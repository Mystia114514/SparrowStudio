/**
 * Sparrow Editor - song（曲谱对象构建与应用）
 * buildSong：编辑器状态 → 引擎可播放的曲谱数据对象。
 * applySong：曲谱数据对象 → 编辑器状态（导入用）。
 */

/* velocity(0-127) → 音符音量：与 midi-parser 的导入映射同一公式（4 位小数），往返不失真 */
function velocityToVolume(vel) {
    const v = getVelocityValue(vel);
    return Math.round(v / 127 * 0.09 * 10000) / 10000;
}

function buildSong() {
    const patterns = state.tracks.map((track) => track.cells.map((cell) => {
        const note = (cell.note || "").trim();
        const beats = Number(cell.beats) > 0 ? cell.beats : (Number(els.defaultBeats.value) || 1);
        const vol = cell.volume;
        if (!note || note === "REST" || note === "R") return ["REST", beats];
        if (vol !== "" && vol !== undefined && vol !== null) {
            return [note, beats, { volume: velocityToVolume(vol) }];
        }
        return [note, beats];
    }));
    /* 各音轨尾部补 REST 对齐到最长音轨：调度器按各轨 pattern 总长循环，
       长度不齐时每循环一圈就错位一次；对齐后所有音轨循环周期一致。 */
    const sums = patterns.map((p) => p.reduce((sum, item) => sum + item[1], 0));
    const maxBeats = Math.max(0, ...sums);
    return {
        id: els.songId.value.trim() || "mySong",
        name: els.songName.value.trim() || "未命名曲谱",
        tempo: Math.max(30, Math.min(240, Number(els.tempo.value) || 96)),
        loop: els.loop.value === "true",
        volume: getVolumeValue(els.volume.value),
        fadeIn: Math.max(0, Number(els.fadeIn.value) || 0),
        stepsPerBar: getStepCount(),
        barCount: getBarCount(),
        tracks: state.tracks.map((track, i) => ({
            instrument: track.instrument,
            gate: track.gate,
            pattern: sums[i] < maxBeats ? [...patterns[i], ["REST", maxBeats - sums[i]]] : patterns[i]
        }))
    };
}

function applySong(song) {
    els.songId.value = song.id || "importedSong";
    els.songName.value = song.name || "导入曲谱";
    els.tempo.value = song.tempo || 96;
    els.volume.value = song.volume ?? 2.5;
    els.fadeIn.value = song.fadeIn ?? 0.5;
    els.loop.value = String(song.loop !== false);

    /* 优先读取曲谱中保存的 stepsPerBar/barCount，否则按 pattern 长度推断 */
    const maxSteps = Math.max(...(song.tracks || []).map((t) => t.pattern?.length || 0), 16);
    let stepsPerBar, barCount;
    if (song.stepsPerBar && song.barCount) {
        stepsPerBar = Math.min(64, Math.max(4, song.stepsPerBar));
        barCount = Math.min(100, Math.max(1, song.barCount));
    } else if (maxSteps <= 16) {
        stepsPerBar = Math.min(64, Math.max(4, maxSteps));
        barCount = 1;
    } else {
        /* 超过 16 步：按每小节 16 步拆分 */
        stepsPerBar = 16;
        barCount = Math.ceil(maxSteps / stepsPerBar);
    }
    els.stepCount.value = stepsPerBar;
    els.barCount.value = Math.min(100, barCount);
    state.currentBar = 0;

    els.trackCount.value = Math.min(32, Math.max(1, song.tracks?.length || 1));
    const total = stepsPerBar * barCount;
    /* 超出 32 轨的声部不进入网格（调用方在状态栏提示截断） */
    state.tracks = (song.tracks || []).slice(0, 32).map((track, index) => ({
        name: `音轨 ${index + 1}`,
        instrument: track.instrument || "piano",
        gate: track.gate ?? 0.85,
        cells: Array.from({ length: total }, (_, step) => {
            const item = track.pattern?.[step];
            const beats = Number(item?.[1]) > 0 ? item[1] : 1;
            if (!item || item[0] === "REST" || item[0] === "R") {
                return { note: "", beats, volume: "" };
            }
            /* 音符音量(0-0.09) → velocity(0-127) 显示：与 buildSong 的导出映射互逆 */
            const vol = item[2] ? Number(item[2].volume) : NaN;
            return {
                note: item[0],
                beats,
                volume: Number.isFinite(vol)
                    ? Math.max(0, Math.min(127, Math.round(vol / 0.09 * 127)))
                    : ""
            };
        })
    }));
    if (state.tracks.length === 0) state.tracks.push(createEmptyTrack(0));
    state.layout = { stepsPerBar, barCount };
    renderAll();
    writeStatus(`已导入曲谱：${els.songName.value}`);
}
