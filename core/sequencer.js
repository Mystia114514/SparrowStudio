/**
 * Sparrow - Sequencer（多轨 BGM 调度器）
 * 按曲谱 pattern 逐音符调度合成器发声：lookahead 定时器、
 * 循环、gate 时值、独立 BGM gain（切歌淡出不影响全局 music bus）。
 */

(function(global) {
    "use strict";

    const Sequencer = {
        currentSong: null,
        playing: false,
        timerId: null,
        songStartTime: 0,
        cursor: [],
        trackTimes: [],
        lookAheadMs: 35,
        scheduleAheadTime: 0.45,
        bgmGain: null,
        targetVolume: 1,
        lastNoteEndTime: 0,

        play(song, options) {
            /* tracks 必须是数组：缺字段/坏数据直接拒绝，不让 tick 每 35ms 崩一次 */
            if (!song || !Array.isArray(song.tracks)) return false;
            this.stop({ fadeOut: options?.crossFade ?? 0.2 });

            const core = global.SparrowCore;
            core.init();
            if (!core.ctx) return false;

            this.currentSong = song;
            this.playing = true;
            this.pausedTrackTimes = null;
            this.lastNoteEndTime = 0;
            this.songStartTime = core.now() + 0.03;
            const startStep = Math.max(0, Math.floor(Number(options?.startStep) || 0));
            const startBeat = Number(options?.startBeat) || 0;
            if (startBeat > 0) {
                /* 按拍起播：各轨光标定位到首个起始拍 >= startBeat 的事件，
                   trackTimes 按（事件拍位 - startBeat）偏移，保持多轨时间对齐。
                   整轨都短于 startBeat 的声部直接标记播完（保持静音）。 */
                this.cursor = [];
                this.trackTimes = [];
                song.tracks.forEach((track) => {
                    const beatSec = this.beatSeconds(track, song);
                    const at = this.cursorAtBeat(track, startBeat);
                    if (at.index >= (track.pattern || []).length) {
                        this.cursor.push(at.index);
                        this.trackTimes.push(Infinity);
                    } else {
                        this.cursor.push(at.index);
                        this.trackTimes.push(this.songStartTime + Math.max(0, at.start - startBeat) * beatSec);
                    }
                });
            } else {
                this.cursor = song.tracks.map(() => startStep);
                this.trackTimes = song.tracks.map(() => this.songStartTime);
            }
            this.bgmGain = core.ctx.createGain();
            this.bgmGain.gain.value = 0;
            this.bgmGain.connect(core.getDestination("music"));

            const targetVolume = Math.max(0, Number(song.volume ?? 1)); /* 负值会使增益反相放大，钳 0 */
            this.targetVolume = targetVolume;
            const fadeIn = Number(options?.fadeIn ?? song.fadeIn ?? 0.35);
            this.bgmGain.gain.setValueAtTime(0.0001, this.songStartTime);
            this.bgmGain.gain.linearRampToValueAtTime(targetVolume, this.songStartTime + fadeIn);

            this.tick();
            this.timerId = setInterval(() => this.tick(), this.lookAheadMs);
            return true;
        },

        stop(options) {
            const core = global.SparrowCore;
            const fadeOut = Number(options?.fadeOut ?? 0.2);

            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
            this.playing = false;
            this.currentSong = null;
            this.cursor = [];
            this.trackTimes = [];

            if (this.bgmGain && core.ctx) {
                const gain = this.bgmGain;
                const at = core.now();
                gain.gain.cancelScheduledValues(at);
                gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, fadeOut));
                setTimeout(() => {
                    try { gain.disconnect(); } catch (error) { /* ignore */ }
                }, Math.ceil((fadeOut + 0.05) * 1000));
            }
            this.bgmGain = null;
        },

        pause() {
            if (!this.playing) return;
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
            this.playing = false;

            const core = global.SparrowCore;
            this.pauseWallTime = core.now();

            /* 光标回退：lookahead 窗口内已排程、暂停时被静音的音符，
               把各轨光标退回到"暂停时刻尚未发声"的第一个事件并重算时间基准，
               恢复时重新排程，内容不丢失（已开始发声的音符不回退，只截断在暂停点）。
               非循环曲已播完的声部（trackTimes = Infinity）跳过回退。 */
            if (this.currentSong) {
                const newCursor = [];
                const newTimes = [];
                this.cursor.forEach((c, i) => {
                    const wall = this.trackTimes[i];
                    const track = this.currentSong.tracks[i];
                    if (!isFinite(wall) || !track) {
                        newCursor.push(c);
                        newTimes.push(wall);
                        return;
                    }
                    const beatSec = this.beatSeconds(track, this.currentSong);
                    let k = c;
                    let w = wall;
                    while (k > 0) {
                        const prevBeats = this.parseStep(track.pattern[k - 1], track).beats;
                        const prevWall = w - prevBeats * beatSec;
                        if (prevWall < this.pauseWallTime) break;
                        w = prevWall;
                        k--;
                    }
                    newCursor.push(k);
                    newTimes.push(w);
                });
                this.cursor = newCursor;
                this.trackTimes = newTimes;
            }
            this.pausedTrackTimes = this.trackTimes.slice();

            if (this.bgmGain && core.ctx) {
                const at = core.now();
                this.bgmGain.gain.cancelScheduledValues(at);
                this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), at);
                this.bgmGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
            }
        },

        resume() {
            if (!this.currentSong || this.playing) return;
            const core = global.SparrowCore;
            const at = core.now() + 0.03;
            const shift = this.pauseWallTime ? at - this.pauseWallTime : 0;
            this.trackTimes = (this.pausedTrackTimes || this.trackTimes).map((t) => t + shift);
            this.pausedTrackTimes = null;

            /* 旧的 bgmGain 上挂着暂停前已排程、又被静音的音符（光标已回退、恢复后会
               重新排程）——直接弃用旧节点链并新建，防止恢复后残留音与新排程重叠 */
            if (this.bgmGain && core.ctx) {
                try { this.bgmGain.disconnect(); } catch (error) { /* ignore */ }
                this.bgmGain = core.ctx.createGain();
                this.bgmGain.gain.value = 0.0001;
                this.bgmGain.connect(core.getDestination("music"));
            }
            if (this.bgmGain && core.ctx) {
                this.bgmGain.gain.cancelScheduledValues(at);
                this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), at);
                this.bgmGain.gain.linearRampToValueAtTime(Math.max(0.0001, this.targetVolume ?? 1), at + 0.06);
            }
            this.playing = true;
            this.tick();
            this.timerId = setInterval(() => this.tick(), this.lookAheadMs);
        },

        /* 定位 pattern 中首个起始拍 >= beat 的事件（按拍起播用） */
        cursorAtBeat(track, beat) {
            const pat = track?.pattern || [];
            let cum = 0;
            for (let i = 0; i < pat.length; i++) {
                if (cum + 1e-6 >= beat) return { index: i, start: cum };
                cum += this.parseStep(pat[i], track).beats;
            }
            /* 整轨短于目标拍位：返回越界光标，配合"播完标记"该轨保持静音 */
            return { index: pat.length, start: cum };
        },

        tick() {
            if (!this.playing || !this.currentSong) return;
            const core = global.SparrowCore;
            const now = core.now();

            /* 卡顿追赶重锚：主线程停顿（GC / 掉帧 / 后台标签页把 setInterval
               节流到 1s+）会让调度停滞超过 lookahead 窗口，各轨"下一事件时刻"
               落后于音频时钟。若照旧按原时刻排程，过期 startTime 会让积压音符
               全部挤在当前时刻齐爆（爆音卡顿），各轨积压量不同还会互相错位。
               处理：所有轨的时间基准统一平移同一差值重锚到当前——光标已越过
               的音符不会重触发（无叠音）、任何音符都不丢、轨间相对对齐不变，
               音乐从停顿处的音乐位置无缝继续。 */
            let minNext = Infinity;
            this.trackTimes.forEach((t) => { if (t < minNext) minNext = t; });
            if (minNext < now - 0.1) {
                const shift = now - minNext;
                for (let i = 0; i < this.trackTimes.length; i++) {
                    if (isFinite(this.trackTimes[i])) this.trackTimes[i] += shift;
                }
            }

            const song = this.currentSong;
            const until = core.now() + this.scheduleAheadTime;

            for (let trackIndex = 0; trackIndex < song.tracks.length; trackIndex++) {
                this.scheduleTrack(trackIndex, until);
            }

            /* 非循环曲所有声部排程完毕：不能立刻淡出——lookahead 窗口内还有最多
               0.45s 已排程未发声的内容，立即 stop 会把结尾音符吞掉（短末音整颗静音、
               长音丢 release 尾音）。等最后一个已排程音符（含 release）自然结束后再清理。 */
            if (this.trackTimes.every((t) => t === Infinity)) {
                const endAt = Number.isFinite(this.lastNoteEndTime) && this.lastNoteEndTime > 0
                    ? this.lastNoteEndTime
                    : core.now();
                if (core.now() >= endAt) {
                    this.stop({ fadeOut: 0.3 });
                }
            }
        },

        scheduleTrack(trackIndex, until) {
            const song = this.currentSong;
            const track = song.tracks[trackIndex];
            const loop = song.loop !== false && (track ? track.loop !== false : true);
            if (!track || !Array.isArray(track.pattern) || track.pattern.length === 0) {
                /* 空曲谱声部：非循环时直接标记播完，避免卡住"全部播完"的判定 */
                if (!loop) this.trackTimes[trackIndex] = Infinity;
                return;
            }

            const beatSeconds = this.beatSeconds(track, song);
            while (this.trackTimes[trackIndex] < until) {
                /* 光标越界：循环曲回到开头；非循环曲标记该轨已播完（Infinity 使
                   while 退出且不再进入），否则下一 tick 会读到 undefined 而崩溃 */
                if (this.cursor[trackIndex] >= track.pattern.length) {
                    if (loop) {
                        this.cursor[trackIndex] = 0;
                    } else {
                        this.trackTimes[trackIndex] = Infinity;
                        return;
                    }
                }

                const step = track.pattern[this.cursor[trackIndex]];
                const parsed = this.parseStep(step, track);
                const duration = parsed.beats * beatSeconds;

                if (!parsed.rest) {
                    this.scheduleNote(parsed, track, this.trackTimes[trackIndex], duration);
                }

                this.trackTimes[trackIndex] += duration;
                this.cursor[trackIndex]++;
            }
        },

        parseStep(step, track) {
            /* null/undefined 步进按休止符处理：pattern 混入坏数据
               不允许在 tick（每 35ms）里抛 TypeError 停摆后续轨 */
            if (step === null || step === undefined) {
                return { note: null, beats: track.defaultBeats || 1, rest: true };
            }
            if (typeof step === "string" || typeof step === "number") {
                return { note: step, beats: track.defaultBeats || 1, rest: step === "REST" || step === "R" };
            }

            const note = step[0];
            const beats = Number(step[1] ?? track.defaultBeats ?? 1);
            const options = step[2] || {};
            return {
                note,
                beats: Number.isFinite(beats) && beats > 0 ? beats : 1,
                options,
                rest: note === "REST" || note === "R" || note === null
            };
        },

        scheduleNote(parsed, track, startTime, duration) {
            if (!this.bgmGain) return;
            /* gate 允许 0–1 之外按缺省处理：0/负数/非数值不能当 0 用（时长归零会
               被下游当成缺省 0.25s），统一回退 0.88；gate 语义为占时比例 */
            const rawGate = track.gate ?? 0.88;
            const gate = Number.isFinite(Number(rawGate)) && Number(rawGate) > 0
                ? Number(rawGate)
                : 0.88;
            const options = {
                ...(track.options || {}),
                ...(parsed.options || {}),
                instrument: parsed.options?.instrument || track.instrument || "piano",
                startTime,
                duration: Math.max(0.01, duration * gate),
                bus: "music"
            };

            // 为 BGM 创建单独节点链，避免切歌淡出影响全局 music bus。
            const noteStopTime = this.playNoteToGain(parsed.note, options, this.bgmGain);
            /* 记录最晚音符结束时刻（含 release）：非循环曲自然结束要等它播完再清理 */
            if (noteStopTime > this.lastNoteEndTime) this.lastNoteEndTime = noteStopTime;
        },

        playNoteToGain(note, options, destinationGain) {
            const core = global.SparrowCore;
            const synth = global.SparrowSynth;
            const freq = synth.noteToFrequency(note);
            if (!freq || !core.ctx) return 0;

            const instrument = synth.resolveInstrument(options.instrument, options);
            /* 起始时刻钳到当前：轻微迟到（追赶窗口内 ≤0.1s）可容忍，
               但 stopTime 必须随钳制后的起点重算，否则过去时刻的
               osc.stop 会让音符立即停振（哑音） */
            const startTime = Math.max(core.now(), Number(options.startTime) || 0);
            const rawDuration = Number(options.duration);
            const duration = Math.max(0.01, Number.isFinite(rawDuration) ? rawDuration : 0.25);
            const release = Math.max(0.01, Number(instrument.release) || 0.08);
            const stopTime = startTime + duration + release + 0.03;
            synth.createToneNodes({
                freq,
                startTime,
                duration,
                stopTime,
                instrument,
                destination: destinationGain
            });
            return stopTime;
        },

        /* 拍→秒换算统一入口：track.tempo 优先于 song.tempo。
           startBeat 定位、pause 光标回退与 scheduleTrack 必须同基准，否则带
           轨 tempo 的曲子会各处节拍长度不一致导致错位 */
        beatSeconds(track, song) {
            return 60 / ((track && track.tempo) || song.tempo || 120);
        }
    };

    global.SparrowSequencer = Sequencer;
})(window);
