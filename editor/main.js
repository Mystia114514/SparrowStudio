/* ===== 编辑器入口 =====
 * 按钮与参数事件绑定、快捷键（空格播放/删除/撤销重做/复制粘贴）、初始化。
 * 必须最后加载（依赖其余全部 editor 模块）。
 */

/* ===== 走带控制（音乐播放器样式）===== */
document.getElementById("play-button").addEventListener("click", () => {
    /* 单键切换：播放中点 = 暂停，否则 = 播放/继续 */
    if (playState === "playing") pauseCurrentSong();
    else playCurrentSong();
});
document.getElementById("rew-button").addEventListener("click", restartFromBeginning);
document.getElementById("stop-button").addEventListener("click", stopCurrentSong);
bindSeek();
document.getElementById("track-duplicate").addEventListener("click", duplicateCurrentTrack);
document.getElementById("track-delete").addEventListener("click", deleteCurrentTrack);
document.getElementById("clear-button").addEventListener("click", async () => {
    const ok = await customConfirm("清空曲谱", "确定清空当前所有音轨吗？所有音符将被删除。");
    if (!ok) return;
    els.trackCount.value = 3;
    state.tracks = [createEmptyTrack(0), createEmptyTrack(1), createEmptyTrack(2)];
    state.currentTrack = 0;
    clearSelection();
    history.clear();
    state.pasteBeat = 0;
    snapshotSongLength();
    renderAll();
    writeStatus("已清空曲谱。");
});
document.getElementById("save-midi-button").addEventListener("click", () => {
    const id = els.songId.value.trim() || "mySong";
    try {
        const { bytes } = buildMidi();
        downloadBlob(`${id}.mid`, bytes, "audio/midi");
        writeStatus(`已保存 MIDI：${id}.mid`);
    } catch (error) {
        writeStatus(`保存 MIDI 失败：${error.message}`);
    }
});
document.getElementById("import-button").addEventListener("click", () => document.getElementById("import-file").click());
document.getElementById("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        await importMidiFile(file);
    } catch (error) {
        alert(error.message);
    } finally {
        event.target.value = "";
    }
});

/* ===== 参数钳制与联动 ===== */
clampInput(els.tempo, 30, 240);
clampInput(els.barCount, 1, 512);
clampInput(els.beatsPerBar, 1, 12);
clampInput(els.trackCount, 1, 32);

/* 缩短曲长（小节数量或每小节拍数）时，超出曲尾的音符需要确认删除 */
async function onSongLengthChange() {
    const total = getTotalBeats();
    const victims = [];
    state.tracks.forEach((t, ti) => {
        t.notes.forEach((n) => {
            if (n.start + n.dur > total + 1e-6) victims.push({ track: ti, note: n });
        });
    });
    if (victims.length) {
        const ok = await customConfirm(
            "缩短曲长",
            `曲长改为 ${total} 拍后，有 ${victims.length} 个音符超出曲尾将被删除。确定继续吗？`
        );
        if (!ok) {
            els.barCount.value = lastBars;
            els.beatsPerBar.value = lastBeatsPerBar;
            return;
        }
        const deltas = victims.map((v) => ({ track: v.track, id: v.note.id, before: { ...v.note }, after: null }));
        applyNoteDelta(deltas, "after");
        commitNotes("缩短曲长", deltas);
        clearSelection();
    }
    snapshotSongLength();
    renderAll();
}
els.barCount.addEventListener("change", onSongLengthChange);
els.beatsPerBar.addEventListener("change", onSongLengthChange);
els.tempo.addEventListener("change", updateTransportUI);
/* 减少音轨数量：被移除音轨上有音符时必须确认（数据丢失防护）；
   取消则回弹到当前实际音轨数 */
els.trackCount.addEventListener("change", async () => {
    const target = getTrackCount();
    const removed = state.tracks.slice(target);
    const removedNotes = removed.reduce((s, t) => s + t.notes.length, 0);
    if (removed.length && removedNotes > 0) {
        const ok = await customConfirm(
            "减少音轨",
            `音轨数量改为 ${target} 后，${removed.length} 条音轨（含 ${removedNotes} 个音符）将被删除。确定继续吗？`
        );
        if (!ok) {
            els.trackCount.value = state.tracks.length;
            return;
        }
    }
    syncTrackCount();
    renderAll();
});
els.snap.addEventListener("change", () => {
    const v = Number(els.snap.value);
    if ([1, 0.5, 0.25, 0.125].includes(v)) state.snap = v;
});

/* ===== 快捷键（输入框聚焦时不响应）===== */
document.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const mod = e.ctrlKey || e.metaKey;

    if (e.code === "Space") {
        e.preventDefault();
        if (playState === "playing") pauseCurrentSong();
        else playCurrentSong();
    } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteNotes(selectedNotes());
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoNotes();
    } else if ((mod && e.shiftKey && e.key.toLowerCase() === "z") || (mod && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        redoNotes();
    } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const track = state.tracks[state.currentTrack];
        setSelection((track ? track.notes : []).map((n) => ({ track: state.currentTrack, note: n })));
        drawRoll();
        updateNoteProps();
    } else if (mod && e.key.toLowerCase() === "c") {
        copySelection();
    } else if (mod && e.key.toLowerCase() === "v") {
        pasteClipboard();
    } else if (e.key === "Escape") {
        clearSelection();
        drawRoll();
        updateNoteProps();
    }
});

/* ===== 复制/粘贴 ===== */
function copySelection() {
    const sel = selectedNotes();
    if (!sel.length) return;
    const minStart = Math.min(...sel.map((s) => s.note.start));
    state.clipboard = sel.map(({ note }) => ({
        pitch: note.pitch, start: note.start - minStart, dur: note.dur, vel: note.vel
    }));
    writeStatus(`已复制 ${sel.length} 个音符（Ctrl+V 粘贴到最近点击位置）。`);
}

function pasteClipboard() {
    if (!state.clipboard || !state.clipboard.length) return;
    const total = getTotalBeats();
    const base = snapFloorB(state.pasteBeat);
    /* 曲末之外的音符不粘贴：播放时静默不可闻，且与导出行为不一致 */
    const notes = state.clipboard
        .filter((c) => base + c.start < total - 1e-6)
        .map((c) => newNote(c.pitch, qBeats(base + c.start), c.dur, c.vel));
    if (!notes.length) {
        writeStatus("粘贴位置超出曲谱末尾，未粘贴音符。");
        return;
    }
    notes.forEach((n) => state.tracks[state.currentTrack].notes.push(n));
    commitNotes("粘贴音符", notes.map((n) => ({ track: state.currentTrack, id: n.id, before: null, after: { ...n } })));
    setSelection(notes.map((n) => ({ track: state.currentTrack, note: n })));
    renderAll();
    const dropped = state.clipboard.length - notes.length;
    writeStatus(`已粘贴 ${notes.length} 个音符到第 ${Math.floor(base / getBeatsPerBar()) + 1} 小节`
        + (dropped ? `（${dropped} 个超出曲末未粘贴）` : "") + "。");
}

/* ===== 初始化 ===== */
SparrowMusicManager.init();
bindTooltips(document.querySelector("main"));
bindTrackProps();
bindNoteProps();
els.trackCount.value = 3;
els.beatsPerBar.value = 4;
els.barCount.value = 16;
state.tracks = [createEmptyTrack(0), createEmptyTrack(1), createEmptyTrack(2)];
snapshotSongLength();
initRoll();
renderAll();
writeStatus("就绪。左键拖动画音符，拖右缘改时值，右键拖动平移画面（右键点击音符=删除）；滚轮滚动，Ctrl+滚轮缩放；空格播放。");
