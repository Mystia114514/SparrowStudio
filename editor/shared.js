/**
 * Sparrow Editor - shared（编辑器共享基础）
 * 提供音色清单、DOM 引用表、状态栏输出与数值输入钳制工具。
 * 必须先于其余 editor 模块加载。
 */

/* 编辑器可选音色清单（与引擎内置音色一一对应，共 17 种） */
const instruments = [
    "piano", "epiano", "musicbox", "organ", "guitar", "bass", "harp",
    "violin", "strings", "choir", "trumpet", "tuba", "brass", "sax",
    "flute", "chip8", "synthPad"
];

const els = {
    status: document.getElementById("status"),
    editorBody: document.getElementById("editor-body"),
    songId: document.getElementById("song-id"),
    songName: document.getElementById("song-name"),
    tempo: document.getElementById("song-tempo"),
    stepCount: document.getElementById("step-count"),
    barCount: document.getElementById("bar-count"),
    barTabs: document.getElementById("bar-tabs"),
    trackCount: document.getElementById("track-count"),
    defaultBeats: document.getElementById("default-beats"),
    volume: document.getElementById("song-volume"),
    fadeIn: document.getElementById("song-fade-in"),
    loop: document.getElementById("song-loop")
};

function writeStatus(message) {
    els.status.textContent = message;
}

/* 通用：输入超限弹回上限/下限。
   输入过程中仅拦截超上限（超上限不可能靠继续输入补全），
   低于下限的中间值（如正在输入 50 时的 "5"）放行；
   失焦或回车时才强制回弹到完整范围，避免打断重新输入。 */
function clampInput(el, min, max) {
    el.addEventListener("input", () => {
        if (el.value === "") return;
        const v = Number(el.value);
        if (!Number.isFinite(v)) return;
        if (v > max) el.value = max;
    });
    const clampRange = () => {
        if (el.value === "") return;
        const v = Number(el.value);
        if (!Number.isFinite(v)) return;
        if (v > max) el.value = max;
        else if (v < min) el.value = min;
    };
    el.addEventListener("change", clampRange);
    el.addEventListener("blur", clampRange);
}
