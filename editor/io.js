/**
 * Sparrow Editor - io（MIDI 文件读写）
 * 打开：SparrowMidiParser 实时解析 → applySong 回填（音符事件模型）。
 * 保存：直接从音符事件序列化标准 MIDI format 1（起点/时值按 PPQ 换算，
 * 无需 REST 拼装）；每条编辑轨写为一个 MTrk，轨内声部各占独立通道，同音不碰撞；
 * 轨数/小节数经 sourceTrack 合并与曲长标记在往返中保留。
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

/* ===== 保存为标准 MIDI 文件 (format 1) ===== */
function buildMidi() {
    const PPQ = 480;
    const tempo = Math.max(30, Math.min(240, Number(els.tempo.value) || 96));
    const microsPerQuarter = Math.max(1, Math.round(60000000 / tempo));
    const utf8 = new TextEncoder();

    /* 文本元事件（Track/Sequence Name）：delta 0 + FF type + 变长长度 + UTF-8 数据 */
    function textMeta(metaType, text) {
        const data = utf8.encode(String(text || ""));
        return [...varLen(0), 0xFF, metaType, ...varLen(data.length), ...data];
    }

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

    // 轨道 0: 序列名 + 速度 + 拍号 + 曲长标记
    const t0 = [];
    t0.push(...textMeta(0x03, els.songName.value.trim() || "SparrowStudio"));
    t0.push(...varLen(0), 0xFF, 0x51, 0x03,
        (microsPerQuarter >> 16) & 0xFF,
        (microsPerQuarter >> 8) & 0xFF,
        microsPerQuarter & 0xFF);
    // 拍号元事件：每小节 beatsPerBar 拍，24 ticks per metronome click, 8 32nd notes per quarter
    t0.push(...varLen(0), 0xFF, 0x58, 0x04, getBeatsPerBar() & 0x7F, 0x02, 0x18, 0x08);
    // 曲长标记（Sequencer-Specific 元事件，MIDI 标准无小节数字段）：
    // "SPW" 魔数 + 16 位小节数，导入时还原网格长度（外部文件无此标记则按音符推断）
    const barCount = getBarCount();
    t0.push(...varLen(0), 0xFF, 0x7F, 0x05, 0x53, 0x50, 0x57,
        (barCount >> 8) & 0xFF, barCount & 0xFF);
    t0.push(...varLen(0), 0xFF, 0x2F, 0x00);
    tracks.push(t0);

    /* 旋律通道池：跳过通道 10（索引 9，GM 打击乐）。每个声部占用一个通道，
       同音碰撞只可能发生在同一声部内（单声部，无碰撞）；音轨多于通道池时循环复用。
       注意：一条编辑轨的全部声部合写进同一个 MTrk（仅通道不同），
       这样 MIDI 往返（导入按 sourceTrack 合并）不会把和弦声部拆成多条编辑轨。 */
    const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
    const instToProgram = {
        piano: 0, epiano: 4, musicbox: 10, organ: 16, guitar: 24, bass: 32,
        violin: 40, harp: 46, strings: 48, choir: 52, trumpet: 56, tuba: 58,
        brass: 61, sax: 64, flute: 72, chip8: 80, synthPad: 88
    };
    let chCursor = 0;

    state.tracks.forEach((track) => {
        const prog = instToProgram[track.instrument] ?? 0;
        const gate = Number.isFinite(Number(track.gate)) ? Math.min(1, Math.max(0.1, track.gate)) : 0.85;
        const ev = [];
        ev.push(...textMeta(0x03, track.name));

        /* 收集全部声部事件后按 tick 排序再折算 delta（MTrk 内 delta 必须单调递增）；
           同 tick 时 note off 先于 note on（order 0 < 1），保证 gate=1 的顺接音符时值正确 */
        const events = [];
        splitVoices(track.notes).forEach((vnotes) => {
            const ch = MELODIC_CHANNELS[chCursor++ % MELODIC_CHANNELS.length];
            events.push({ tick: 0, order: 0, data: [0xC0 | ch, prog & 0x7F] });
            events.push({ tick: 0, order: 0, data: [0xB0 | ch, 0x07, 100] }); // CC7 音量
            [...vnotes].sort((a, b) => a.start - b.start).forEach((n) => {
                const on = Math.round(n.start * PPQ);
                const off = Math.max(on + 1, Math.round((n.start + n.dur * gate) * PPQ));
                /* 力度 0（静音）导出为 1：MIDI 中 velocity 0 表示 Note Off */
                const vel = n.vel > 0 ? Math.max(1, Math.min(127, Math.round(n.vel))) : 1;
                events.push({ tick: on, order: 1, data: [0x90 | ch, n.pitch & 0x7F, vel] });
                events.push({ tick: off, order: 0, data: [0x80 | ch, n.pitch & 0x7F, 0] });
            });
        });
        events.sort((a, b) => a.tick - b.tick || a.order - b.order);
        let last = 0;
        events.forEach((e) => {
            ev.push(...varLen(Math.max(0, e.tick - last)), ...e.data);
            last = e.tick;
        });

        ev.push(...varLen(0), 0xFF, 0x2F, 0x00);
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
    return { bytes: new Uint8Array(out) };
}

/* ===== 打开 MIDI：实时解析 .mid 为音符事件再应用 ===== */
async function importMidiFile(file) {
    const song = SparrowMidiParser.parse(
        new Uint8Array(await file.arrayBuffer()),
        { id: file.name.replace(/\.(mid|midi)$/i, ""), name: file.name.replace(/\.(mid|midi)$/i, "") }
    );
    if (!song) throw new Error("无法解析 MIDI 文件。");
    applySong(song);
}
