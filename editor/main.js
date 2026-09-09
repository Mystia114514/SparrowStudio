/**
 * Sparrow Editor - main（编辑器入口）
 * 按钮与参数事件绑定、数值输入钳制应用、初始化。
 * 必须最后加载（依赖其余全部 editor 模块）。
 */

/* ===== 初始化 ===== */
document.getElementById("play-button").addEventListener("click", playCurrentSong);
document.getElementById("pause-button").addEventListener("click", pauseCurrentSong);
document.getElementById("restart-button").addEventListener("click", restartFromBeginning);
document.getElementById("stop-button").addEventListener("click", stopCurrentSong);
document.getElementById("clear-button").addEventListener("click", async () => {
    const ok = await customConfirm("清空曲谱", "确定清空当前所有音轨吗？所有数据将被删除。");
    if (!ok) return;
    els.trackCount.value = 3;
    els.barCount.value = 1;
    state.currentBar = 0;
    state.tracks = [createEmptyTrack(0), createEmptyTrack(1), createEmptyTrack(2)];
    state.layout = { stepsPerBar: getStepCount(), barCount: getBarCount() };
    renderAll();
    writeStatus("已清空曲谱。");
});
document.getElementById("save-midi-button").addEventListener("click", () => {
    const id = els.songId.value.trim() || "mySong";
    try {
        const data = buildMidi();
        downloadBlob(`${id}.mid`, data, "audio/midi");
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

clampInput(els.tempo, 30, 240);
clampInput(els.stepCount, 4, 64);
clampInput(els.barCount, 1, 100);
clampInput(els.trackCount, 1, 32);
clampInput(els.defaultBeats, 0.25, 8);
clampInput(els.volume, 0, 2000);
clampInput(els.fadeIn, 0, 5);

els.stepCount.addEventListener("change", renderAll);
els.barCount.addEventListener("change", async () => {
    const newCount = getBarCount();
    const oldCount = state.tracks[0]?.cells
        ? Math.ceil(state.tracks[0].cells.length / getStepCount())
        : 1;
    if (newCount < oldCount) {
        const ok = await customConfirm(
            "减少小节数量",
            `将小节数量从 ${oldCount} 减少到 ${newCount}，第 ${newCount + 1}-${oldCount} 小节的数据将被删除。确定继续吗？`
        );
        if (!ok) {
            els.barCount.value = oldCount;
            return;
        }
    }
    state.currentBar = 0;
    renderAll();
});
els.trackCount.addEventListener("change", renderAll);

SparrowMusicManager.init();
bindTooltips(document.querySelector("main"));
els.trackCount.value = 3;
state.tracks = [createEmptyTrack(0), createEmptyTrack(1), createEmptyTrack(2)];
state.layout = { stepsPerBar: getStepCount(), barCount: getBarCount() };
renderAll();
