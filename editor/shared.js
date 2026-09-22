/**
 * Sparrow Editor - shared（编辑器共享基础）
 * 音色清单（含中文标注）、音高↔音名工具、DOM 引用表、状态栏输出、输入钳制。
 * 必须先于其余 editor 模块加载。
 */

/* 编辑器可选音色清单（与引擎内置音色一一对应，共 17 种） */
const instruments = [
    "piano", "epiano", "musicbox", "organ", "guitar", "bass", "harp",
    "violin", "strings", "choir", "trumpet", "tuba", "brass", "sax",
    "flute", "chip8", "synthPad"
];

/* 音色中文名标注：下拉框等处显示为 "piano · 钢琴" */
const INSTRUMENT_LABELS = {
    piano: "钢琴", epiano: "电钢琴", musicbox: "八音盒", organ: "管风琴",
    guitar: "吉他", bass: "贝斯", harp: "竖琴", violin: "小提琴",
    strings: "弦乐合奏", choir: "人声合唱", trumpet: "小号", tuba: "大号",
    brass: "铜管合奏", sax: "萨克斯", flute: "长笛", chip8: "8bit 芯片音",
    synthPad: "合成垫"
};

function instrumentLabel(id) {
    return INSTRUMENT_LABELS[id] ? `${id} · ${INSTRUMENT_LABELS[id]}` : id;
}

/* ===== 音高（MIDI 音号）↔ 音名（与引擎 SparrowNoteParser 同一套记法）===== */
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function pitchToName(pitch) {
    const p = Math.round(Number(pitch));
    if (!Number.isFinite(p)) return "C4";
    const clamped = Math.max(0, Math.min(127, p));
    return PITCH_NAMES[clamped % 12] + (Math.floor(clamped / 12) - 1);
}

function nameToPitch(name) {
    const m = String(name || "").trim().match(/^([A-Ga-g])(#|b)?(-?\d+)$/);
    if (!m) return null;
    const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semis = map[m[1].toUpperCase()];
    if (m[2] === "#") semis += 1;
    if (m[2] === "b") semis -= 1;
    return 12 * (parseInt(m[3], 10) + 1) + semis;
}

/* 拍数浮点整理：吸附运算会积累 1e-13 级尾差，统一整理到 1e-4 拍（约 0.5ms @120BPM） */
function qBeats(b) {
    return Math.round(Number(b) * 10000) / 10000;
}

const els = {
    status: document.getElementById("status"),
    playButton: document.getElementById("play-button"),
    seekBar: document.getElementById("seek-bar"),
    timeDisplay: document.getElementById("time-display"),
    rollWrap: document.getElementById("roll-wrap"),
    rollMain: document.getElementById("roll-main"),
    rollOverlay: document.getElementById("roll-overlay"),
    trackTabs: document.getElementById("track-tabs"),
    trackName: document.getElementById("track-name"),
    trackInstrument: document.getElementById("track-instrument"),
    trackGate: document.getElementById("track-gate"),
    npPitch: document.getElementById("np-pitch"),
    npStart: document.getElementById("np-start"),
    npDur: document.getElementById("np-dur"),
    npVel: document.getElementById("np-vel"),
    songId: document.getElementById("song-id"),
    songName: document.getElementById("song-name"),
    tempo: document.getElementById("song-tempo"),
    barCount: document.getElementById("bar-count"),
    beatsPerBar: document.getElementById("beats-per-bar"),
    snap: document.getElementById("snap"),
    trackCount: document.getElementById("track-count")
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
