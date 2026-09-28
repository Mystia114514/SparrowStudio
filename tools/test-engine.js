/**
 * 引擎回归验证：node tools/test-engine.js（或 npm test，与 test-roundtrip.js 并列）
 * stub 最小 Web Audio（含 automation 录制），加载 core/ + instruments/ 全部脚本，验证：
 * 1) 非循环曲自然停止与清理；循环曲播放/暂停/恢复/停止全生命周期
 * 2) startBeat 按拍起播的光标定位
 * 3) playBgm 幂等（无参）/ 带选项重播；未知 id 与坏数据防御
 *    （null 曲谱、tracks 非数组、空轨自停、null 步进、负 defaultBeats 三条路径、
 *     负 tempo、gate 0 —— 负节拍长不得让调度 while 死循环）
 * 4) 数值缺省规则：sustain 0 真正生效（不被 || 吞成 0.4），缺省路径行为不变
 * 5) playKick 负 to 钳制（exponentialRampToValueAtTime 目标必须为正）
 * 6) unlock / 音量钳制 / playSfx / 全部内置音色与音效无异常
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ===== stub AudioContext ===== */
const rampCalls = [];      // 全局记录 exponentialRamp 目标（kick 钳制断言用）
let recording = null;      // { set: [], ramp: [] }：单个 play 调用的 automation 录制
function makeParam(initial) {
    return {
        value: initial,
        cancelScheduledValues() {},
        setValueAtTime(v) { if (recording) recording.set.push(v); this.value = v; },
        linearRampToValueAtTime(v) { if (recording) recording.set.push(v); this.value = v; },
        exponentialRampToValueAtTime(v) { rampCalls.push(v); if (recording) recording.ramp.push(v); this.value = v; }
    };
}
function makeNode() {
    return {
        connect() {}, disconnect() {}, start() {}, stop() {}, onended: null,
        type: "sine",
        frequency: makeParam(440), detune: makeParam(0), Q: makeParam(0), gain: makeParam(1),
        threshold: makeParam(-6), knee: makeParam(3), ratio: makeParam(20),
        attack: makeParam(0.002), release: makeParam(0.2),
        buffer: null
    };
}
let now = 1;
const ctx = {
    currentTime: now, sampleRate: 48000, state: "running", destination: makeNode(),
    resume: async () => { ctx.state = "running"; },
    createGain: () => makeNode(),
    createOscillator: () => makeNode(),
    createBiquadFilter: () => makeNode(),
    createDynamicsCompressor: () => makeNode(),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => makeNode()
};

global.window = global;
global.AudioContext = function () { return ctx; };
global.localStorage = { getItem: () => null, setItem: () => {} };

const src = [
    "core/audio-core.js", "core/note-parser.js", "instruments/instruments.js",
    "core/synth.js", "core/sequencer.js", "core/sfx-player.js",
    "core/midi-parser.js", "core/audio-manager.js", "instruments/sfx-library.js"
].map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
vm.runInThisContext(src);

const Core = global.SparrowCore;
const Seq = global.SparrowSequencer;
const Mgr = global.SparrowMusicManager;
const Synth = global.SparrowSynth;

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error("FAIL:", msg); failures++; }
    else console.log("ok  -", msg);
}
/* 模拟时间推进并驱动调度器 tick（定时器未真跑，手动驱动） */
function advance(seconds, stepMs) {
    const end = now + seconds;
    while (now < end) {
        now += (stepMs || 35) / 1000;
        ctx.currentTime = now;
        if (Seq.timerId) Seq.tick();
    }
}

/* ---- 1. 非循环曲：播放 → 自然停止 → 清理 ---- */
assert(Mgr.playBgm("nope") === false, "未知 id 播放返回 false");
const song = {
    id: "t", name: "t", tempo: 120, loop: false, volume: 1,
    tracks: [
        { name: "a", instrument: "piano", gate: 1, pattern: [["C4", 1], ["E4", 1], ["G4", 1], ["C5", 1]] },
        { name: "b", instrument: "piano", gate: 1, pattern: [["REST", 2], ["E5", 2]] }
    ]
};
assert(Seq.play(song, {}) === true && Seq.playing && Seq.currentSong === song, "play 成功且状态记录");
advance(4);
assert(Seq.playing === false && Seq.currentSong === null && Seq.timerId === null, "非循环曲播完自然停止并清理定时器");

/* ---- 2. 循环曲：暂停光标回退 → 恢复 ---- */
const songLoop = Object.assign({}, song, { loop: true });
Seq.play(songLoop, {});
advance(1.5);
const prePauseCursor = Seq.cursor.slice();
Seq.pause();
assert(Seq.playing === false, "暂停后 playing 复位");
assert(Seq.cursor.every((c, i) => c <= prePauseCursor[i]), "暂停光标回退不越界");
Seq.resume();
assert(Seq.playing === true, "恢复后 playing 置位");
advance(0.5);
Seq.stop({});
assert(Seq.playing === false, "手动停止");

/* ---- 3. startBeat 起播：REST 轨时间基准更晚 ---- */
assert(Seq.play(songLoop, { startBeat: 2 }) === true, "startBeat 起播");
assert(Seq.trackTimes[1] > Seq.trackTimes[0], "REST 偏移轨时间基准更晚（多轨对齐）");
advance(1);
Seq.stop({});

/* ---- 4. playBgm 幂等与带选项 ---- */
const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
function minimalMidi() {
    const trk = [];
    trk.push(0, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20); // SetTempo 120
    trk.push(0, 0x90, 60, 96);                       // Note On C4
    trk.push(96, 0x80, 60, 0);                       // Note Off（480 tick = 1 拍）
    trk.push(0, 0xFF, 0x2F, 0x00);                   // End of Track
    const out = [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, 1, 0xE0];
    out.push(0x4D, 0x54, 0x72, 0x6B, ...u32(trk.length), ...trk);
    return new Uint8Array(out).buffer;
}
Mgr.loadMidi("t", minimalMidi());
assert(Mgr.playBgm("t") === true, "playBgm 播放");
assert(Mgr.playBgm("t") === true && Seq.playing, "同 id 无参重复调用幂等（不重启）");
now += 0.2; ctx.currentTime = now;
assert(Mgr.playBgm("t", { volume: 2 }) === true, "带选项视为明确播放意图照常生效");
Seq.stop({});

/* ---- 5. 坏数据防御 ---- */
assert(Seq.play(null) === false, "null 曲谱拒绝");
assert(Seq.play({ tracks: "bad" }) === false, "tracks 非数组拒绝");
assert(Seq.play({ tracks: [] }) === true, "空轨曲谱可 play");
Seq.tick();
assert(Seq.playing === false, "空轨曲谱首个 tick 自然自停");
const hangStart = Date.now();
assert(Seq.play({ tempo: 120, loop: true, tracks: [{ instrument: "piano", defaultBeats: -1, pattern: [null, ["C4", 1], null] }] }) === true, "null 步进 + 负 defaultBeats 可 play");
Seq.tick();
assert(Date.now() - hangStart < 2000, "负 defaultBeats（null 路径）不死循环");
Seq.stop({});
assert(Seq.play({ tempo: -120, loop: true, tracks: [{ instrument: "piano", pattern: [["C4", 1]] }] }) === true, "负 tempo 可 play");
Seq.tick();
assert(Seq.playing, "负 tempo（节拍长钳回退）不死循环");
Seq.stop({});
assert(Seq.play({ tracks: [{ instrument: "piano", pattern: [null, ["C4", 1], null, "REST"] }] }) === true, "pattern 混入 null 不抛错");
advance(1);
Seq.stop({});
assert(Seq.play({ tracks: [{ instrument: "piano", pattern: [["C4", 1]], gate: 0 }] }) === true, "gate 0 回退不抛错");
advance(0.5);
Seq.stop({});

/* ---- 6. sustain 0 生效 / 缺省路径不变 ---- */
Synth.registerInstrument("testOneshot", { attack: 0.001, decay: 0.01, sustain: 0, release: 0.05, volume: 0.05, filter: 4000 });
recording = { set: [], ramp: [] };
Synth.playTone({ instrument: "testOneshot", freq: 440, duration: 0.1 });
assert(recording.set.some((v) => Math.abs(v - 0.00005) < 1e-12), "sustain 0 → sustainLevel = 5e-5（一次成音，不被 || 吞成 0.4）");
Synth.registerInstrument("testNoSustain", { attack: 0.001, decay: 0.01, release: 0.05, volume: 0.05, filter: 4000 });
recording = { set: [], ramp: [] };
Synth.playTone({ instrument: "testNoSustain", freq: 440, duration: 0.1 });
assert(recording.set.some((v) => Math.abs(v - 0.0125) < 1e-12), "sustain 未提供 → piano 底板 0.25 → 0.0125 不变");

/* ---- 7. playKick 负 to 钳制 ---- */
rampCalls.length = 0;
Synth.playKick({ from: 200, to: -5, duration: 0.1 });
assert(rampCalls.length === 2 && rampCalls.every((v) => v > 0) && rampCalls[0] === 45, "kick 负 to → frequency 回退 45，全部 ramp 目标为正");
rampCalls.length = 0;
Synth.playKick({ from: 200, to: 80, duration: 0.1 });
assert(rampCalls[0] === 80, "kick 正常 to 仍生效");

/* ---- 8. unlock / 音量钳制 / SFX ---- */
(async () => {
    assert(await Mgr.unlock() === true, "unlock 成功");
    Mgr.setMasterVolume(2);
    assert(Core.masterVolume === 1, "master 音量钳 1");
    Mgr.setMusicVolume(0.5); Mgr.setSfxVolume(0.5);
    Mgr.setMuted(true); Mgr.toggleMuted();
    Mgr.setDucked(true);
    assert(Mgr.playSfx("coin") === true, "playSfx 成功");
    assert(Mgr.playSfx("nope") === false, "未知音效返回 false");

    /* ---- 9. MIDI 解析边界 ---- */
    assert(Mgr.loadMidi("bad", new Uint8Array([1, 2, 3])) === null, "非 MIDI 字节拒绝");
    assert(Mgr.loadMidi("short", new Uint8Array(13)) === null, "过短字节拒绝");
    const parsed = Mgr.loadMidi("parsed", minimalMidi(), { loop: false, volume: 1.5 });
    assert(parsed && parsed.tracks.length >= 1, "合法 MIDI 解析出音轨");
    assert(Seq.play(parsed, {}) === true, "解析结果可播放");
    advance(60, 100); // 长推进：验证追赶重锚不抛错
    Seq.stop({});

    /* ---- 10. 全量内置音色 / 音效冒烟 ---- */
    let allOk = true;
    for (const id of Object.keys(global.SparrowDefaultInstruments)) {
        try { Synth.playTone({ instrument: id, freq: 440, duration: 0.1 }); } catch (e) { allOk = false; console.error(e.message, id); }
    }
    assert(allOk, "17 种内置音色 playTone 无异常");
    allOk = true;
    for (const id of Object.keys(global.SparrowSfxLibrary)) {
        try { global.SparrowSfxPlayer.play(global.SparrowSfxLibrary[id]); } catch (e) { allOk = false; console.error(e.message, id); }
    }
    assert(allOk, "16 个内置音效 playSfx 无异常");

    console.log(failures ? `\n${failures} FAILURES` : "\nALL ENGINE TESTS PASSED");
    process.exit(failures ? 1 : 0);
})();
