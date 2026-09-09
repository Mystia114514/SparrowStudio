/**
 * Sparrow - MidiParser（MIDI 实时转换）
 * 将标准 MIDI 文件（SMF format 0/1/2）字节实时解析为引擎曲谱对象，
 * 挂入 SparrowMusicLibrary 后即可用 SparrowMusicManager.playBgm 播放。
 *
 * 转换规则：
 * - 每个 (MIDI轨, 通道, 音色) 组合 → 一条内部音轨；同轨重叠音符自动拆分声部（和弦保真）
 * - GM 音色映射到内置合成音色：精确映射优先，未命中按 GM 家族区间映射（详见 GM_PROGRAM_EXACT /
 *   GM_FAMILY_RANGES），打击乐通道 10（索引 9）固定 chip8
 * - velocity（0-127）→ 逐音符音量覆盖参数
 * - 延音踏板（CC64）生效：踏板期间的 Note Off 缓存，抬踏板时统一延长到该时刻
 * - 所有声部尾部补 REST 对齐全曲长度（最晚结束时刻），保证循环播放各轨同步
 * - 速度取第一个 SetTempo 元事件（缺省 120）；中途变速与弯音/其他 CC 被忽略
 */

(function(global) {
    "use strict";

    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    /* GM 音色精确映射（含编辑器导出用的代表音色号，往返一致） */
    const GM_PROGRAM_EXACT = {
        0: "piano", 4: "epiano", 10: "musicbox", 16: "organ", 24: "guitar",
        32: "bass", 40: "violin", 46: "harp", 48: "strings", 52: "choir",
        56: "trumpet", 57: "tuba", 58: "tuba", 61: "brass", 64: "sax",
        72: "flute", 80: "chip8", 88: "synthPad"
    };

    /* GM 家族区间映射：[起始编号, 结束编号, 音色]，覆盖全部 0-127 */
    const GM_FAMILY_RANGES = [
        [0, 3, "piano"], [4, 7, "epiano"], [8, 15, "musicbox"], [16, 23, "organ"],
        [24, 31, "guitar"], [32, 39, "bass"], [40, 47, "violin"], [48, 51, "strings"],
        [52, 55, "choir"], [56, 60, "trumpet"], [61, 63, "brass"], [64, 71, "sax"],
        [72, 79, "flute"], [80, 87, "chip8"], [88, 103, "synthPad"],
        [104, 111, "guitar"], [112, 119, "musicbox"], [120, 127, "chip8"]
    ];

    function programToInstrument(program) {
        if (GM_PROGRAM_EXACT[program]) return GM_PROGRAM_EXACT[program];
        for (const [from, to, inst] of GM_FAMILY_RANGES) {
            if (program >= from && program <= to) return inst;
        }
        return "piano";
    }

    function midiToNoteName(midi) {
        return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
    }

    const MidiParser = {
        /**
         * 解析 MIDI 字节为曲谱对象。
         * @param {Uint8Array} bytes .mid 文件原始字节
         * @param {Object} [options] { id, name, loop, volume, fadeIn }
         * @returns {Object|null} 引擎曲谱对象（失败返回 null）
         */
        parse(bytes, options) {
            options = options || {};
            if (!(bytes instanceof Uint8Array) || bytes.length < 14) return null;
            if (this.readStr(bytes, 0, 4) !== "MThd") return null;

            const headerLen = this.readU32(bytes, 4);
            const trackCount = (bytes[10] << 8) | bytes[11];
            const division = (bytes[12] << 8) | bytes[13];
            let ppq = 480;
            if (division & 0x8000) {
                console.warn("Sparrow: SMPTE 时间格式暂不支持，按 PPQ=480 解析。");
            } else if (division > 0) {
                ppq = division;
            }

            /* ---- 逐轨解析：收集音符事件 ---- */
            let pos = 8 + headerLen;
            let tempo = 120;
            let tempoSet = false;
            const parsedTracks = []; // { ch, program, notes: [{start, dur, midi, vel}] }

            for (let t = 0; t < trackCount && pos + 8 <= bytes.length; t++) {
                if (this.readStr(bytes, pos, 4) !== "MTrk") break;
                const length = this.readU32(bytes, pos + 4);
                const end = Math.min(pos + 8 + length, bytes.length);
                pos += 8;

                let tick = 0;
                let running = 0;
                const programs = new Array(16).fill(0);
                // 通道 → { sustained: Map(midi → {startTick, vel, program}),
                //          pedalHeld: Map(midi → 同上，踏板延音中的音符),
                //          pedalDown: bool, notes: [] }
                const channels = new Map();
                const getChannel = (ch) => {
                    let c = channels.get(ch);
                    if (!c) {
                        c = { sustained: new Map(), pedalHeld: new Map(), pedalDown: false, notes: [] };
                        channels.set(ch, c);
                    }
                    return c;
                };

                while (pos < end) {
                    /* 变长 delta time */
                    let delta = 0;
                    for (;;) {
                        const b = bytes[pos++];
                        delta = (delta << 7) | (b & 0x7F);
                        if (!(b & 0x80)) break;
                    }
                    tick += delta;

                    let status = bytes[pos];
                    if (status === undefined) break;
                    if (status & 0x80) {
                        pos++;
                    } else {
                        status = running; /* running status 复用上一个状态字节 */
                    }
                    if (!(status & 0x80)) break; /* 数据错位，放弃本轨剩余部分 */
                    running = (status & 0xF0) === 0xF0 ? 0 : status; /* 元/SysEx 事件取消 running status */

                    const type = status & 0xF0;
                    const ch = status & 0x0F;

                    if (status === 0xFF) {
                        /* 元事件 */
                        const metaType = bytes[pos++];
                        let len = 0;
                        for (;;) {
                            const b = bytes[pos++];
                            len = (len << 7) | (b & 0x7F);
                            if (!(b & 0x80)) break;
                        }
                        if (metaType === 0x51 && len === 3 && !tempoSet) {
                            const micros = (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
                            if (micros > 0) {
                                tempo = Math.round(60000000 / micros);
                                tempoSet = true;
                            }
                        }
                        pos += len;
                    } else if (status === 0xF0 || status === 0xF7) {
                        /* SysEx：跳过 */
                        let len = 0;
                        for (;;) {
                            const b = bytes[pos++];
                            len = (len << 7) | (b & 0x7F);
                            if (!(b & 0x80)) break;
                        }
                        pos += len;
                    } else if (type === 0x90) {
                        /* Note On（vel=0 视为 Note Off） */
                        const midi = bytes[pos++];
                        const vel = bytes[pos++];
                        const c = getChannel(ch);
                        if (vel > 0) {
                            if (c.sustained.has(midi)) this.closeNote(c, midi, tick);
                            if (c.pedalHeld.has(midi)) this.closeHeld(c, midi, tick);
                            c.sustained.set(midi, { startTick: tick, vel, program: programs[ch] });
                        } else {
                            this.releaseNote(c, midi, tick);
                        }
                    } else if (type === 0x80) {
                        const midi = bytes[pos++];
                        pos++; /* vel 忽略 */
                        const c = channels.get(ch);
                        if (c) this.releaseNote(c, midi, tick);
                    } else if (type === 0xC0) {
                        programs[ch] = bytes[pos++];
                    } else if (type === 0xB0) {
                        const cc = bytes[pos++];
                        const val = bytes[pos++];
                        if (cc === 64) {
                            /* 延音踏板：val >= 64 踩下；抬起时挂起音符统一延长到当前时刻 */
                            const c = getChannel(ch);
                            if (val >= 64) {
                                c.pedalDown = true;
                            } else if (c.pedalDown) {
                                c.pedalDown = false;
                                c.pedalHeld.forEach((open, midi) => this.pushNote(c, open, midi, tick));
                                c.pedalHeld.clear();
                            }
                        }
                    } else if (type === 0xD0 || type === 0xA0) {
                        pos += 1; /* 通道压力 / 触后：1 字节 */
                    } else {
                        pos += 2; /* 弯音等：双字节，忽略 */
                    }
                }
                pos = end;

                /* 收尾：关闭未结束音符（含踏板挂起），按 (通道, 音色) 分组 */
                channels.forEach((c, ch) => {
                    c.sustained.forEach((_, midi) => this.closeNote(c, midi, tick));
                    c.pedalHeld.forEach((open, midi) => this.pushNote(c, open, midi, tick));
                    c.pedalHeld.clear();
                    const groups = new Map();
                    c.notes.forEach((note) => {
                        const key = note.program;
                        let g = groups.get(key);
                        if (!g) {
                            g = { ch, program: note.program, notes: [] };
                            groups.set(key, g);
                        }
                        g.notes.push(note);
                    });
                    groups.forEach((g) => {
                        if (g.notes.length) parsedTracks.push(g);
                    });
                });
            }

            if (!parsedTracks.length) return null;

            /* ---- 转内部曲谱：声部拆分（重叠音符各自成轨，保真和弦） ---- */
            const groups = []; /* { instrument, voices } */
            let maxEndTick = 0;
            parsedTracks.forEach((g) => {
                g.notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
                const voices = []; /* { endTick, pattern } */
                g.notes.forEach((note) => {
                    let voice = voices.find((v) => v.endTick <= note.start);
                    if (!voice) {
                        voice = { endTick: 0, pattern: [] };
                        voices.push(voice);
                    }
                    const gap = note.start - voice.endTick;
                    if (gap > 0) voice.pattern.push(["REST", gap / ppq]);
                    /* 4 位小数精度：相邻 velocity 的音量间隔约 0.0007，必须比它更细才能往返无损；
                       下限 0.0001 仅保证音量非 0（velocity 0 不会走到这里，vel=0 视作 Note Off） */
                    const vol = Math.round(Math.max(0.0001, (note.vel / 127) * 0.09) * 10000) / 10000;
                    voice.pattern.push([midiToNoteName(note.midi), note.dur / ppq, { volume: vol }]);
                    voice.endTick = note.start + note.dur;
                    if (voice.endTick > maxEndTick) maxEndTick = voice.endTick;
                });
                const instrument = g.ch === 9
                    ? "chip8"
                    : programToInstrument(g.program);
                groups.push({ instrument, voices });
            });

            /* 所有声部尾部补 REST 到全曲统一长度：调度器各轨按各自 pattern 总长循环，
               长度不齐则每循环一圈错位一次；对齐后全部音轨循环周期一致。 */
            const tracks = [];
            let maxSteps = 0;
            groups.forEach(({ instrument, voices }) => {
                voices.forEach((v) => {
                    const tail = maxEndTick - v.endTick;
                    if (tail > 0) v.pattern.push(["REST", tail / ppq]);
                    if (v.pattern.length > maxSteps) maxSteps = v.pattern.length;
                    tracks.push({ instrument, gate: 1, pattern: v.pattern });
                });
            });

            /* 编辑器导入推断用的小节信息 */
            let stepsPerBar = 16, barCount = 1;
            if (maxSteps <= 16) {
                stepsPerBar = Math.max(4, maxSteps);
            } else {
                barCount = Math.ceil(maxSteps / 16);
            }

            return {
                id: options.id || "midiSong",
                name: options.name || options.id || "MIDI 曲谱",
                tempo: Math.min(240, Math.max(30, tempo)),
                loop: options.loop !== false,
                volume: options.volume ?? 2.5,
                fadeIn: options.fadeIn ?? 0.3,
                stepsPerBar,
                barCount,
                tracks
            };
        },

        /* 结束音符：从 sustained 表移除并按当前时刻收尾 */
        closeNote(channel, midi, tick) {
            const open = channel.sustained.get(midi);
            if (!open) return;
            channel.sustained.delete(midi);
            this.pushNote(channel, open, midi, tick);
        },

        /* 结束被踏板挂起的音符 */
        closeHeld(channel, midi, tick) {
            const open = channel.pedalHeld.get(midi);
            if (!open) return;
            channel.pedalHeld.delete(midi);
            this.pushNote(channel, open, midi, tick);
        },

        /* Note Off（含 vel=0）：踏板踩下时挂起延音，否则立即收尾 */
        releaseNote(channel, midi, tick) {
            if (!channel.sustained.has(midi)) return;
            if (channel.pedalDown) {
                channel.pedalHeld.set(midi, channel.sustained.get(midi));
                channel.sustained.delete(midi);
            } else {
                this.closeNote(channel, midi, tick);
            }
        },

        pushNote(channel, open, midi, tick) {
            channel.notes.push({
                start: open.startTick,
                dur: Math.max(1, tick - open.startTick),
                midi,
                vel: open.vel,
                program: open.program
            });
        },

        readU32(bytes, offset) {
            return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
        },

        readStr(bytes, offset, length) {
            let out = "";
            for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
            return out;
        }
    };

    global.SparrowMidiParser = MidiParser;
})(window);
