/**
 * Sparrow Editor - playback（播放控制与播放头）
 * 通过 SparrowMusicManager 驱动引擎播放/暂停/停止/跳转；
 * 播放头按 BPM 与每格节拍推进高亮，跨小节仅切换导航高亮不重建 DOM。
 */

/* ===== 播放头状态 ===== */
let playheadRAF = null;
let playStartTime = 0;
let playTempo = 96;
let playLoop = true;
let currentPlayStep = -1;
let playStartBeatOffset = 0;
let playState = "stopped"; /* "stopped" | "playing" | "paused" */

function getTotalBeats() {
    const track = state.tracks[0];
    if (!track) return 0;
    const db = Number(els.defaultBeats.value) || 1;
    return track.cells.reduce((sum, c) => sum + (Number(c.beats) > 0 ? c.beats : db), 0);
}

function beatsBeforeStep(stepIndex) {
    const track = state.tracks[0];
    if (!track) return 0;
    const db = Number(els.defaultBeats.value) || 1;
    let sum = 0;
    const n = Math.max(0, Math.min(stepIndex, track.cells.length));
    for (let i = 0; i < n; i++) {
        sum += Number(track.cells[i].beats) > 0 ? track.cells[i].beats : db;
    }
    return sum;
}

function startPlayhead(fromStep) {
    const song = buildSong();
    playTempo = song.tempo;
    playLoop = song.loop;
    const track = state.tracks[0];
    const startIdx = track ? Math.max(0, Math.min(fromStep || 0, track.cells.length - 1)) : 0;
    playStartBeatOffset = beatsBeforeStep(startIdx);
    playStartTime = SparrowCore.now();
    currentPlayStep = startIdx;
    updatePlayheadUI(startIdx);
    runPlayheadTick();
}

function runPlayheadTick() {
    if (playheadRAF) cancelAnimationFrame(playheadRAF);
    const tick = () => {
        const now = SparrowCore.now();
        const elapsed = now - playStartTime;
        const beatSec = 60 / playTempo;
        let beatsElapsed = playStartBeatOffset + elapsed / beatSec;
        const total = getTotalBeats();
        if (total > 0 && playLoop) {
            beatsElapsed = beatsElapsed % total;
        }

        const track = state.tracks[0];
        if (!track) {
            playheadRAF = requestAnimationFrame(tick);
            return;
        }

        const db = Number(els.defaultBeats.value) || 1;
        let cum = 0;
        let step = 0;
        for (let i = 0; i < track.cells.length; i++) {
            const b = Number(track.cells[i].beats) > 0 ? track.cells[i].beats : db;
            if (cum + b > beatsElapsed) { step = i; break; }
            cum += b;
            step = i;
        }

        if (step !== currentPlayStep) {
            currentPlayStep = step;
            updatePlayheadUI(step);
        }
        playheadRAF = requestAnimationFrame(tick);
    };
    tick();
}

function pausePlayhead() {
    if (playheadRAF) {
        cancelAnimationFrame(playheadRAF);
        playheadRAF = null;
    }
    /* 保留 currentPlayStep，不调用 updatePlayheadUI(-1) */
}

function stopPlayhead() {
    if (playheadRAF) {
        cancelAnimationFrame(playheadRAF);
        playheadRAF = null;
    }
    currentPlayStep = -1;
    updatePlayheadUI(-1);
}

function updatePlayheadUI(step) {
    /* 清除旧的播放高亮与步数标记 */
    document.querySelectorAll(".cell.playing").forEach((el) => el.classList.remove("playing"));
    document.querySelectorAll(".step-num.active").forEach((el) => el.classList.remove("active"));

    if (step < 0) return;

    /* 多小节：播放头可能落在其他小节，仅更新导航文本，不重建 DOM */
    const stepsPerBar = getStepCount();
    const bar = Math.floor(step / stepsPerBar);
    const localStep = step % stepsPerBar;

    if (bar !== state.currentBar) {
        state.currentBar = bar;
        els.barTabs.querySelectorAll(".bar-tab").forEach((el, i) => {
            el.classList.toggle("active", i === bar);
        });
        /* 重建网格跟随播放小节；正在网格输入时暂缓重建，避免打断编辑（代价是该小节内不显示行高亮） */
        const focused = document.activeElement;
        if (!(focused && els.editorBody.contains(focused))) {
            renderTracks();
        }
    }

    /* 高亮当前播放到的"行"：同一 localStep 的全部音轨方格 */
    document.querySelectorAll(`.cell[data-step="${localStep}"]`).forEach((el) => el.classList.add("playing"));

    /* 左侧步数列标记当前行 */
    const stepNums = els.editorBody.querySelectorAll(".step-num");
    if (stepNums[localStep]) stepNums[localStep].classList.add("active");
}

/* ===== 播放/暂停/停止 ===== */
async function playFromStep(step) {
    await SparrowMusicManager.unlock();
    SparrowMusicManager.stopBgm({ fadeOut: 0.05 });
    const song = buildSong();
    SparrowMusicLibrary[song.id] = song;
    SparrowMusicManager.playBgm(song.id, { startStep: step, crossFade: 0.05, fadeIn: song.fadeIn });
    startPlayhead(step);
    playState = "playing";
    writeStatus(step > 0 ? `从第 ${state.currentBar + 1} 小节第 ${step % getStepCount() + 1} 步继续播放：${song.name}` : `正在播放：${song.name}`);
}

async function playCurrentSong() {
    await SparrowMusicManager.unlock();
    if (playState === "paused") {
        await playFromStep(currentPlayStep);
        return;
    }
    if (playState === "playing") return;
    await playFromStep(0);
}

function pauseCurrentSong() {
    if (playState !== "playing") return;
    SparrowMusicManager.stopBgm({ fadeOut: 0.1 });
    pausePlayhead();
    playState = "paused";
    writeStatus(`已暂停于第 ${state.currentBar + 1} 小节第 ${currentPlayStep % getStepCount() + 1} 步，点击播放继续。`);
}

async function restartFromBeginning() {
    await playFromStep(0);
}

function jumpToStep(step) {
    playFromStep(step);
}

function stopCurrentSong() {
    SparrowMusicManager.stopBgm({ fadeOut: 0.2 });
    stopPlayhead();
    playState = "stopped";
    writeStatus("已停止播放。");
}
