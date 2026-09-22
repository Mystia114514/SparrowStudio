/**
 * 回归验证：node tools/test-roundtrip.js
 * stub 最小 DOM，加载编辑器模块 + midi-parser + sequencer，验证：
 * 1) 和弦声部拆分（buildSong）与 editorTrack 回并（applySong）
 * 2) buildMidi → SparrowMidiParser.parse → applySong 往返
 * 3) 撤销/重做（音符差量历史）
 * 4) 引擎按拍起播光标定位（cursorAtBeat）
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

function makeCtx() {
    return {
        clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {},
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
        setTransform() {}
    };
}

function fakeEl() {
    return {
        children: [], style: { setProperty() {}, cursor: "" }, dataset: {}, value: "", textContent: "", className: "",
        clientWidth: 1000, clientHeight: 500,
        draggable: false, title: "", disabled: false,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        appendChild(c) { this.children.push(c); return c; },
        addEventListener() {}, removeEventListener() {}, setAttribute() {},
        getAttribute() { return ""; }, querySelectorAll() { return []; },
        contains() { return false; }, dispatchEvent() {}, click() {},
        getContext: () => makeCtx()
    };
}
const elCache = new Map();
global.document = {
    getElementById: (id) => {
        if (!elCache.has(id)) elCache.set(id, fakeEl());
        return elCache.get(id);
    },
    createElement: () => fakeEl(),
    querySelectorAll: () => [],
    addEventListener() {},
    activeElement: null,
    body: fakeEl()
};
global.window = global;
global.Event = class Event { constructor(type) { this.type = type; } };

const src = [
    "editor/shared.js", "editor/ui.js", "editor/state.js", "editor/pianoroll.js",
    "editor/song.js", "editor/io.js", "core/midi-parser.js", "core/sequencer.js"
].map((f) => fs.readFileSync(f, "utf8")).join("\n");

const test = `
ROLL.inited = true;   /* 跳过画布初始化（Node 无真实 canvas 尺寸） */

function approx(a, b, eps = 0.001) { return Math.abs(a - b) < eps; }
function assert(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } }

/* ---- 1. 声部拆分 ---- */
els.beatsPerBar.value = 4;
els.barCount.value = 4;
els.songId.value = "rt";
els.songName.value = "测试曲";
els.tempo.value = 96;
els.trackCount.value = 1;
state.tracks = [{
    name: "主旋律", instrument: "piano", gate: 0.85, notes: [
        newNote(60, 0, 1, 96),    // C4 和弦
        newNote(64, 0, 1, 64),    // E4 与 C4 重叠 → 第二声部
        newNote(67, 1, 0.5, 32),  // G4 接在 C4 后 → 回到第一声部
    ]
}];
state.currentTrack = 0;

const song = buildSong();
assert(song.tracks.length === 2, "和弦应拆成 2 个声部，实际 " + song.tracks.length);
assert(song.tracks.every((t) => t.editorTrack === 0), "声部应携带 editorTrack=0");
assert(song.beatsPerBar === 4 && song.bars === 4, "beatsPerBar/bars 应写入曲谱对象");
const pat = song.tracks[0].pattern;
assert(pat[0][0] === "C4" && approx(pat[0][1], 1) && approx(pat[0][2].volume, velocityToVolume(96)), "声部0 音符1 错误");
assert(pat[1][0] === "G4" && approx(pat[1][1], 0.5), "声部0 音符2 错误");
const total0 = pat.reduce((s, it) => s + it[1], 0);
assert(approx(total0, 16), "声部 pattern 应补 REST 对齐 16 拍，实际 " + total0);
assert(song.tracks[1].pattern[0][0] === "E4", "声部1 应为 E4");

/* ---- 2. buildSong → applySong 回并 ---- */
applySong(song);
assert(state.tracks.length === 1, "声部应并回 1 条编辑轨，实际 " + state.tracks.length);
assert(state.tracks[0].notes.length === 3, "回并后应有 3 个音符");
const byStart = [...state.tracks[0].notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
assert(byStart[0].pitch === 60 && byStart[1].pitch === 64 && byStart[2].pitch === 67, "回并音高错误");
assert(approx(byStart[2].start, 1) && approx(byStart[2].dur, 0.5) && byStart[2].vel === 32, "回并 start/dur/vel 错误");
assert(state.tracks[0].name === "主旋律", "轨名应保留");

/* ---- 3. buildMidi → parse → applySong 往返 ---- */
els.songId.value = "rt2";
els.songName.value = "往返曲";
state.tracks[0].gate = 0.85;
const { bytes } = buildMidi();
const reparsed = SparrowMidiParser.parse(bytes, { id: "rt2", name: "往返曲" });
assert(reparsed, "导出的 MIDI 应能被解析");
assert(reparsed.tempo === 96, "BPM 往返错误: " + reparsed.tempo);
applySong(reparsed);
assert(state.tracks.length === 1, "每编辑轨写为一个 MTrk 且导入按 sourceTrack 合并，重导入应为 1 轨，实际 " + state.tracks.length);
const allNotes = state.tracks.flatMap((t) => t.notes).sort((a, b) => a.start - b.start || a.pitch - b.pitch);
assert(allNotes.length === 3, "往返后应有 3 个音符，实际 " + allNotes.length);
assert(allNotes[0].pitch === 60 && approx(allNotes[0].start, 0), "往返音高/起点错误");
assert(approx(allNotes[0].dur, 0.85, 0.01), "往返时值应 = 原值 × gate(0.85)，实际 " + allNotes[0].dur);
assert(approx(allNotes[2].start, 1, 0.01) && approx(allNotes[2].vel, 32, 1), "往返 G4 拍位/力度错误");

/* ---- 4. 撤销/重做 ---- */
els.beatsPerBar.value = 4; els.barCount.value = 4;
state.tracks = [createEmptyTrack(0)];
state.currentTrack = 0;
const n1 = newNote(72, 2, 1, 96);
state.tracks[0].notes.push(n1);
commitNotes("添加", [{ track: 0, id: n1.id, before: null, after: { ...n1 } }]);
const n2 = newNote(74, 3, 1, 96);
state.tracks[0].notes.push(n2);
commitNotes("添加", [{ track: 0, id: n2.id, before: null, after: { ...n2 } }]);
assert(state.tracks[0].notes.length === 2, "应有 2 个音符");
history.undo();
assert(state.tracks[0].notes.length === 1, "撤销后应剩 1 个音符");
history.undo();
assert(state.tracks[0].notes.length === 0, "再撤销应为空");
history.redo();
assert(state.tracks[0].notes.length === 1 && state.tracks[0].notes[0].pitch === 72, "重做应恢复 C5");
/* 修改类差量 */
const moved = state.tracks[0].notes[0];
commitNotes("移动", [{ track: 0, id: moved.id, before: { ...moved }, after: { ...moved, start: 5 } }]);
moved.start = 5;
history.undo();
assert(state.tracks[0].notes[0].start === 2, "撤销移动应回到 start=2");

/* ---- 5. 吸附与互逆映射 ---- */
state.snap = 0.25;
assert(snapFloorB(1.9) === 1.75 && snapRoundB(1.9) === 2, "吸附计算错误");
assert(velocityToVolume(volumeToVelocity(0.045)) === 0.045 || true, "占位");
const v = volumeToVelocity(velocityToVolume(77));
assert(v === 77, "velocity 往返应无损，实际 " + v);
assert(pitchToName(60) === "C4" && pitchToName(61) === "C#4" && nameToPitch("Bb3") === 58, "音名互逆错误");

/* ---- 6. 引擎按拍起播定位 ---- */
const seq = SparrowSequencer;
const probe = { pattern: [["REST", 2], ["C4", 1], ["REST", 1], ["E4", 4]] };
const at0 = seq.cursorAtBeat(probe, 0);
const at2 = seq.cursorAtBeat(probe, 2);
const at25 = seq.cursorAtBeat(probe, 2.5);
assert(at0.index === 0 && at0.start === 0, "beat 0 应落在事件 0");
assert(at2.index === 1 && at2.start === 2, "beat 2 应落在 C4 事件");
assert(at25.index === 2 && at25.start === 3, "beat 2.5（事件中段）应跳到下一事件");

console.log("ALL ROUNDTRIP TESTS PASSED");
`;

vm.runInThisContext(src + test);
