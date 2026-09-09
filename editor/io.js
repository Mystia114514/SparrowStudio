/**
 * Sparrow Editor - io（MIDI 文件读写）
 * 纯 MIDI 编辑器：打开 .mid（SparrowMidiParser 实时解析），
 * 保存为标准 MIDI 文件（format 1）。
 * 力度格直接使用 MIDI velocity（0-127 整数）：构建曲谱时换算为音符音量，
 * 与解析器导入映射互逆，打开 → 编辑 → 保存往返保真。
 */

function downloadBlob(filename, data, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ===== 音符名 → MIDI 音号（与引擎 synth.noteToFrequency 一致：A4=69=440Hz）===== */
function noteNameToMidi(name) {
    if (!name || name === "REST" || name === "R") return null;
    const m = String(name).match(/^([A-Ga-g])(#|b)?(-?\d)$/);
    if (!m) return null;
    const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semis = map[m[1].toUpperCase()];
    if (m[2] === "#") semis += 1;
    if (m[2] === "b") semis -= 1;
    const oct = parseInt(m[3], 10);
    return 12 * (oct + 1) + semis;
}

/* ===== 单音音量 → velocity（0-127）=====
   与 midi-parser 的导入映射互逆（导入 vel/127*0.09 → 音量），
   保证 .mid 打开 → 编辑 → 保存往返力度不丢失；空音量用默认力度 96。
   音量 0（静音）导出为 velocity 1：MIDI 中 velocity 0 表示 Note Off，1 是最弱可表达值。 */
function volumeToVelocity(volume) {
    const n = Number(volume);
    if (!Number.isFinite(n)) return 96;
    if (n <= 0) return 1;
    return Math.max(1, Math.min(127, Math.round(n / 0.09 * 127)));
}

/* ===== 保存为标准 MIDI 文件 (format 1) ===== */
function buildMidi() {
    const PPQ = 480;
    const song = buildSong();
    const tempo = song.tempo || 96;
    const microsPerQuarter = Math.max(1, Math.round(60000000 / tempo));

    /* 内置音色 → GM 音色号（与 midi-parser 的精确映射互逆，往返一致） */
    const instToProgram = {
        piano: 0, epiano: 4, musicbox: 10, organ: 16, guitar: 24, bass: 32,
        violin: 40, harp: 46, strings: 48, choir: 52, trumpet: 56, tuba: 58,
        brass: 61, sax: 64, flute: 72, chip8: 80, synthPad: 88
    };

    function varLen(value) {
        const bytes = [];
        let v = Math.max(0, value) & 0x0FFFFFFF;
        bytes.push(v & 0x7F);
        v >>= 7;
        while (v > 0) {
            bytes.unshift((v & 0x7F) | 0x80);
            v >>= 7;
        }
        return bytes;
    }

    function u32(v) {
        return [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
    }

    const tracks = [];

    // 轨道 0: 速度 + 拍号
    const t0 = [];
    t0.push(...varLen(0), 0xFF, 0x51, 0x03,
        (microsPerQuarter >> 16) & 0xFF,
        (microsPerQuarter >> 8) & 0xFF,
        microsPerQuarter & 0xFF);
    // 拍号元事件：4/4 拍，24 ticks per metronome click, 8 32nd notes per quarter
    t0.push(...varLen(0), 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);
    t0.push(...varLen(0), 0xFF, 0x2F, 0x00);
    tracks.push(t0);

    /* 旋律通道池：跳过通道 10（索引 9，GM 打击乐），避免通道分配碰撞。
       音轨多于 15 条时循环复用通道——format 1 允许跨轨共享通道，
       各轨音色由轨内自己的 Program Change 决定。 */
    const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

    // 每条音轨一条 MIDI 轨道
    song.tracks.forEach((track, i) => {
        const ev = [];
        const ch = MELODIC_CHANNELS[i % MELODIC_CHANNELS.length];
        const prog = instToProgram[track.instrument] ?? 0;
        ev.push(...varLen(0), 0xC0 | ch, prog & 0x7F);
        ev.push(...varLen(0), 0xB0 | ch, 0x07, 100); // CC7 音量

        let last = 0;
        let t = 0;
        const gate = track.gate ?? 0.85;
        track.pattern.forEach((item) => {
            const note = item[0];
            const beats = Number(item[1]) || 1;
            const duration = Math.max(1, Math.round(beats * PPQ));
            if (note !== "REST" && note !== "R") {
                const midi = noteNameToMidi(note);
                if (midi !== null && midi >= 0 && midi <= 127) {
                    let noteLen = Math.round(duration * gate);
                    if (noteLen < 1) noteLen = 1;
                    const vel = volumeToVelocity(item[2]?.volume);
                    ev.push(...varLen(t - last), 0x90 | ch, midi & 0x7F, vel);
                    last = t;
                    ev.push(...varLen(noteLen), 0x80 | ch, midi & 0x7F, 0);
                    last = t + noteLen;
                }
            }
            t += duration;
        });
        ev.push(...varLen(Math.max(0, t - last)), 0xFF, 0x2F, 0x00);
        tracks.push(ev);
    });

    const out = [];
    out.push(0x4D, 0x54, 0x68, 0x64); // "MThd"
    out.push(...u32(6));
    out.push(0, 1); // format 1
    out.push((tracks.length >> 8) & 0xFF, tracks.length & 0xFF);
    out.push((PPQ >> 8) & 0xFF, PPQ & 0xFF);
    tracks.forEach((tr) => {
        out.push(0x4D, 0x54, 0x72, 0x6B); // "MTrk"
        out.push(...u32(tr.length));
        out.push(...tr);
    });
    return new Uint8Array(out);
}

/* ===== 打开 MIDI：实时解析 .mid 为曲谱对象再应用 ===== */
async function importMidiFile(file) {
    const song = SparrowMidiParser.parse(
        new Uint8Array(await file.arrayBuffer()),
        { id: file.name.replace(/\.(mid|midi)$/i, ""), name: file.name.replace(/\.(mid|midi)$/i, "") }
    );
    if (!song) throw new Error("无法解析 MIDI 文件。");
    applySong(song);
    const overflow = song.tracks.length - 32;
    const cutNote = overflow > 0 ? `，超出 32 轨的 ${overflow} 轨未在网格中显示` : "";
    writeStatus(`已打开 MIDI：${els.songName.value}（${song.tracks.length} 条音轨，${song.tempo} BPM${cutNote}）`);
}
