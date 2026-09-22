/**
 * Sparrow Editor - song（曲谱对象构建与应用）
 * buildSong：音符事件 → 引擎曲谱对象。一条编辑轨允许多音符叠放（和弦），
 *   播放时按重叠关系自动拆成多个单声部（voices），每个声部序列化为
 *   [音名, 拍数, {volume}] + REST 的顺序 pattern，尾部补 REST 对齐曲长保证循环同步。
 *   各声部带 editorTrack 标记，applySong 据此把声部并回同一编辑轨（往返不增轨）。
 * applySong：引擎曲谱对象 → 音符事件（外来 MIDI 每轨一条编辑轨）。
 */

/* velocity(0-127) → 音符音量：与 midi-parser 的导入映射同一公式（4 位小数），往返不失真 */
function velocityToVolume(vel) {
    const v = getVelocityValue(vel);
    return Math.round(v / 127 * 0.09 * 10000) / 10000;
}

/* 音符音量(0-0.09) → velocity(0-127)：与 velocityToVolume 互逆 */
function volumeToVelocity(volume) {
    const n = Number(volume);
    if (!Number.isFinite(n)) return 96;
    return Math.max(0, Math.min(127, Math.round(n / 0.09 * 127)));
}

/* 重叠音符 → 单声部组：贪心复用"已结束"的声部（与 midi-parser 的拆分策略同构） */
function splitVoices(notes) {
    const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    const voices = [];
    sorted.forEach((n) => {
        let voice = voices.find((v) => v.end <= n.start + 1e-6);
        if (!voice) {
            voice = { end: 0, notes: [] };
            voices.push(voice);
        }
        voice.notes.push(n);
        voice.end = n.start + n.dur;
    });
    return voices.map((v) => v.notes);
}

/* 单声部 → 顺序 pattern：音符间插入 REST，尾部补 REST 对齐 totalBeats */
function serializeVoice(notes, totalBeats) {
    const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    const pattern = [];
    let cursor = 0;
    sorted.forEach((n) => {
        if (n.start >= totalBeats - 1e-6) return;
        const start = Math.max(0, n.start);
        if (start > cursor + 1e-6) pattern.push(["REST", start - cursor]);
        const dur = Math.max(1e-4, Math.min(n.dur, totalBeats - start));
        pattern.push([pitchToName(n.pitch), dur, { volume: velocityToVolume(n.vel) }]);
        cursor = start + dur;
    });
    if (cursor < totalBeats - 1e-6) pattern.push(["REST", totalBeats - cursor]);
    return pattern;
}

function buildSong() {
    const total = getTotalBeats();
    const tracks = [];
    state.tracks.forEach((track, ti) => {
        splitVoices(track.notes).forEach((vnotes) => {
            tracks.push({
                name: track.name,
                instrument: track.instrument,
                gate: track.gate,
                editorTrack: ti,
                pattern: serializeVoice(vnotes, total)
            });
        });
    });
    if (tracks.length === 0) {
        tracks.push({ name: "音轨 1", instrument: "piano", gate: 0.85, editorTrack: 0, pattern: [["REST", total]] });
    }
    return {
        id: els.songId.value.trim() || "mySong",
        name: els.songName.value.trim() || "未命名曲谱",
        tempo: Math.max(30, Math.min(240, Number(els.tempo.value) || 96)),
        /* MIDI 不支持音量/淡入/循环标记：编辑器内播放使用引擎默认值，
           游戏侧按需经 loadMidi 的 { volume, loop } 选项控制 */
        loop: true,
        volume: 2.5,
        beatsPerBar: getBeatsPerBar(),
        bars: getBarCount(),
        tracks
    };
}

function applySong(song) {
    els.songId.value = song.id || "importedSong";
    els.songName.value = song.name || "导入曲谱";
    els.tempo.value = song.tempo || 96;

    const beatsPerBar = Math.min(12, Math.max(1, Math.round(Number(song.beatsPerBar) || 4)));
    els.beatsPerBar.value = beatsPerBar;
    /* 曲长按真实拍数推断（构建过的曲谱直接读 bars 字段），不再按事件数估算 */
    const sums = (song.tracks || []).map((t) => (t.pattern || []).reduce(
        (s, it) => s + (typeof it === "string" ? 1 : (Number(it?.[1]) > 0 ? Number(it[1]) : 1)), 0));
    const maxBeats = Math.max(0, ...sums);
    const bars = Number(song.bars) > 0
        ? Math.min(512, Math.max(1, Math.round(Number(song.bars))))
        : Math.min(512, Math.max(1, Math.ceil(maxBeats / beatsPerBar)));
    els.barCount.value = bars;
    const capacity = beatsPerBar * bars;

    /* 按来源合并声部：
       - editorTrack 标记（构建过的曲谱）：并回同一编辑轨；
       - sourceTrack 标记（MIDI 解析）：同一 MIDI 轨拆出的和弦声部并回同一条
         编辑轨（同轨同音色），不同音色仍各占一条以保留音色；
       - 都没有：每轨一条 */
    const groups = new Map();
    (song.tracks || []).forEach((t, i) => {
        let key;
        if (Number.isInteger(t.editorTrack)) key = `e${t.editorTrack}`;
        else {
            const src = Number.isInteger(t.sourceTrack) ? t.sourceTrack : i;
            key = `s${src}:${t.instrument || "piano"}`;
        }
        if (!groups.has(key)) {
            groups.set(key, { name: t.name, instrument: t.instrument, gate: t.gate, notes: [] });
        }
        const g = groups.get(key);
        let cum = 0;
        (t.pattern || []).forEach((item) => {
            const beats = typeof item === "string" ? 1
                : (Number(item?.[1]) > 0 ? Number(item[1]) : 1);
            const note = typeof item === "string" ? item : item?.[0];
            if (note && note !== "REST" && note !== "R") {
                const pitch = nameToPitch(note);
                if (pitch !== null) {
                    const vol = typeof item === "object" && item[2] ? volumeToVelocity(item[2].volume) : 96;
                    g.notes.push(newNote(pitch, qBeats(cum), qBeats(beats), vol));
                }
            }
            cum += beats;
        });
    });

    /* 超出 32 条编辑轨上限的音轨丢弃并计数（保留前 32 条） */
    const merged = [...groups.values()].map((g, idx) => ({
        name: g.name || `音轨 ${idx + 1}`,
        instrument: g.instrument || "piano",
        gate: Number.isFinite(Number(g.gate)) ? Math.min(1, Math.max(0.1, Number(g.gate))) : 0.85,
        notes: g.notes
    }));
    const droppedTracks = Math.max(0, merged.length - 32);
    state.tracks = merged.slice(0, 32);
    els.trackCount.value = Math.max(1, state.tracks.length);
    if (state.tracks.length === 0) state.tracks.push(createEmptyTrack(0));

    /* 超出网格容量（512 小节上限）的音符丢弃并提示 */
    let dropped = 0;
    state.tracks.forEach((t) => {
        const kept = t.notes.filter((n) => n.start < capacity - 1e-6);
        dropped += t.notes.length - kept.length;
        t.notes = kept;
    });
    snapshotSongLength(); /* 导入直接改写了曲长输入框，同步回弹基准 */

    state.currentTrack = 0;
    clearSelection();
    history.clear();
    state.pasteBeat = 0;
    renderAll();
    writeStatus(`已导入曲谱：${els.songName.value}（${state.tracks.length} 条音轨，${els.tempo.value} BPM）`
        + (dropped ? `；超出 ${bars} 小节容量，丢弃 ${dropped} 个音符` : "")
        + (droppedTracks ? `；超出 32 条音轨上限，丢弃 ${droppedTracks} 条音轨` : ""));
}
