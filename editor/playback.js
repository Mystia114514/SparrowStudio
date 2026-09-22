/**
 * Sparrow Editor - playback（播放控制与播放头，按拍计时）
 * 播放 = buildSong() 即时构建曲谱注册进曲谱库后走引擎调度器；
 * 播放头按 AudioContext 时钟推进（拍），overlay 动画帧重绘；
 * 从任意拍起播走引擎 startBeat（各轨光标按拍定位，保持对齐）。
 */

let playState = "stopped"; /* "stopped" | "playing" | "paused" */
let playStartAudioTime = 0;
let playStartBeat = 0;
let playTempo = 96;
let playLoop = true;
let playTotalBeats = 16;
let playheadPos = -1;      /* 当前播放头拍位，停止为 -1 */
let pausedBeat = 0;
let pausedSong = null;     /* 暂停时曲谱快照：恢复时对比判断数据是否被编辑过 */

function playheadBeat() {
    return playheadPos;
}

/* ===== 走带 UI（音乐播放器样式）===== */
let seekDragging = false; /* 拖动进度条期间暂停 rAF 回写，避免互相覆盖 */

function beatsToClock(beats) {
    /* 播放/暂停中按音频实际使用的 tempo 换算：输入框改 BPM 不影响正在播放的曲子
       （tempo 在 playFromBeat 时已定格进曲谱），显示必须与听到的内容一致；
       停止状态按输入框 BPM 预览曲长 */
    const bpm = playState === "stopped" ? (Number(els.tempo.value) || 96) : playTempo;
    const sec = Math.max(0, beats) * 60 / Math.max(1, bpm);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
}

function updateTransportUI() {
    const total = getTotalBeats();
    const pos = playheadPos < 0 ? 0 : Math.min(playheadPos, total);
    els.timeDisplay.textContent = beatsToClock(pos) + " / " + beatsToClock(total);
    if (!seekDragging) {
        els.seekBar.value = total > 0 ? Math.round(pos / total * 1000) : 0;
    }
    els.playButton.textContent = playState === "playing" ? "⏸" : "▶";
}

/* 进度条：拖动中只移动播放头预览；松手后播放/暂停状态从该处重建播放，停止状态仅定位 */
function bindSeek() {
    els.seekBar.addEventListener("pointerdown", () => { seekDragging = true; });
    /* change 在部分场景（点击但值未变）可能不触发，pointerup 延迟复位兜底，
       rAF 保证 change 先于复位执行 */
    els.seekBar.addEventListener("pointerup", () => {
        requestAnimationFrame(() => { seekDragging = false; });
    });
    els.seekBar.addEventListener("pointercancel", () => { seekDragging = false; });
    els.seekBar.addEventListener("input", () => {
        const total = getTotalBeats();
        playheadPos = Math.min(total, total * (Number(els.seekBar.value) / 1000));
        updateTransportUI();
        drawOverlay();
    });
    els.seekBar.addEventListener("change", () => {
        seekDragging = false;
        const total = getTotalBeats();
        const beat = Math.max(0, Math.min(total - 0.001, total * (Number(els.seekBar.value) / 1000)));
        if (playState === "playing" || playState === "paused") {
            pausedSong = null; /* 曲谱快照失效：暂停恢复会退回重建重播 */
            playFromBeat(beat);
        } else {
            playheadPos = beat;
            drawOverlay();
        }
        updateTransportUI();
    });
}

/* 播放头推进（由 pianoroll 的 overlay 动画帧每帧调用） */
function tickPlayhead() {
    if (playState !== "playing") return;
    if (seekDragging) return; /* 拖动进度条期间冻结音频时钟推进，由 input 事件接管播放头 */
    const elapsed = SparrowCore.now() - playStartAudioTime;
    const beatSec = 60 / playTempo;
    let beats = playStartBeat + elapsed / beatSec;
    if (playLoop && playTotalBeats > 0) beats = beats % playTotalBeats;
    playheadPos = beats;
    followPlayhead();
    updateTransportUI();
}

function followPlayhead() {
    const wrap = els.rollWrap;
    const x = rollBeatToX(playheadPos);
    if (x > wrap.clientWidth - 40 || x < ROLL.KEY_W) {
        ROLL.scrollX = Math.max(0, playheadPos * ROLL.pxPerBeat - (wrap.clientWidth - ROLL.KEY_W) / 2);
        clampScroll();
        drawRoll();
    }
}

async function playFromBeat(beat) {
    await SparrowMusicManager.unlock();
    SparrowMusicManager.stopBgm({ fadeOut: 0.05 });
    /* 起播拍钳制在网格内：越界起播会让所有轨标记播完、引擎立即停止，
       而编辑器仍处于播放态（界面在走、无声、暂停/恢复循环损坏） */
    const clamped = Math.max(0, Math.min(Number(beat) || 0, getTotalBeats() - 0.001));
    const song = buildSong();
    SparrowMusicLibrary[song.id] = song;
    SparrowMusicManager.playBgm(song.id, { startBeat: clamped });
    playTempo = song.tempo;
    playLoop = song.loop;
    playTotalBeats = song.beatsPerBar * song.bars;
    playStartBeat = Math.max(0, Math.min(clamped, playTotalBeats - 0.001));
    playStartAudioTime = SparrowCore.now();
    playheadPos = playStartBeat;
    playState = "playing";
    pausedSong = null;
    updateTransportUI();
    writeStatus(beat > 0
        ? `从第 ${Math.floor(beat / song.beatsPerBar) + 1} 小节播放：${song.name}`
        : `正在播放：${song.name}`);
}

async function playCurrentSong() {
    await SparrowMusicManager.unlock();
    if (playState === "paused") {
        /* 暂停后数据未被编辑：走引擎真恢复（保留调度状态）；
           被编辑过：快照失效，退回重建曲谱从暂停拍重播 */
        const unchanged = pausedSong !== null
            && JSON.stringify(buildSong()) === JSON.stringify(pausedSong);
        if (unchanged) {
            SparrowMusicManager.resumeBgm();
            playStartAudioTime = SparrowCore.now();
            playStartBeat = playheadPos;
            playState = "playing";
            updateTransportUI();
            writeStatus(`继续播放：${els.songName.value.trim() || "未命名曲谱"}`);
            return;
        }
        await playFromBeat(pausedBeat);
        return;
    }
    if (playState === "playing") return;
    /* 停止状态：从播放头所在位置播放（进度条定位过则从定位处开始） */
    await playFromBeat(playheadPos > 0 ? playheadPos : 0);
}

function pauseCurrentSong() {
    if (playState !== "playing") return;
    pausedSong = buildSong();
    pausedBeat = playheadPos;
    SparrowMusicManager.pauseBgm();
    playState = "paused";
    updateTransportUI();
    writeStatus(`已暂停于第 ${Math.floor(playheadPos / getBeatsPerBar()) + 1} 小节，点击播放继续。`);
}

function restartFromBeginning() {
    return playFromBeat(0);
}

/* 后台返回对齐：标签页隐藏期间 rAF 暂停使播放头冻结，但调度器仍被浏览器
   节流（setInterval ≥1s）并因停顿重锚拉伸推进音频内容——返回时播放头跳到
   墙钟位置，音频内容滞后且永不自愈。隐藏超过 3s 后重新可见时，在冻结的
   播头位置重建播放，立即与显示对齐（跳过后台拉伸期，不重复已播内容）。 */
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
    } else if (document.visibilityState === "visible"
        && playState === "playing"
        && hiddenAt > 0 && Date.now() - hiddenAt > 3000) {
        const beat = Math.max(0, playheadPos); /* 同步捕获：rAF 恢复前读冻结的播放头 */
        playFromBeat(beat);
    }
});

function stopCurrentSong() {
    SparrowMusicManager.stopBgm({ fadeOut: 0.2 });
    playheadPos = -1;
    pausedSong = null;
    playState = "stopped";
    updateTransportUI();
    writeStatus("已停止播放。");
}
