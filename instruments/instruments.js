/**
 * Sparrow - Instruments（默认音色库）
 * 纯数据文件：定义内置音色的波形、包络、滤波器与多振荡器配置。
 * 供 SparrowSynth 初始化音色表使用，必须先于 synth.js 加载。
 */

(function(global) {
    "use strict";

    const DEFAULT_INSTRUMENTS = {
        /* 钢琴：快起音、亮度随时间衰减的敲击弦音 */
        piano: {
            wave: "triangle",
            volume: 0.07,
            attack: 0.002,
            decay: 0.3,
            sustain: 0.25,
            release: 0.4,
            filter: 2800,
            filterEnd: 1400,
            q: 0.4,
            detune: 0,
            oscillators: [
                { wave: "triangle", gain: 0.75 },
                { wave: "sine", gain: 0.25, octave: 1 }
            ]
        },
        /* 小提琴：双失谐锯齿模拟弓弦摩擦，慢起音、持续圆润 */
        violin: {
            wave: "sawtooth",
            volume: 0.045,
            attack: 0.1,
            decay: 0.15,
            sustain: 0.78,
            release: 0.35,
            filter: 3200,
            q: 0.7,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.45, detune: -7 },
                { wave: "sawtooth", gain: 0.45, detune: 7 },
                { wave: "triangle", gain: 0.1, octave: 1 }
            ]
        },
        /* 大号：深沉的低音铜管，低通滤波压住毛刺 */
        tuba: {
            wave: "sawtooth",
            volume: 0.09,
            attack: 0.05,
            decay: 0.12,
            sustain: 0.75,
            release: 0.2,
            filter: 480,
            filterEnd: 380,
            q: 0.6,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.6 },
                { wave: "sine", gain: 0.4 }
            ]
        },
        /* 小号：明亮铜管，滤波器上滑模拟起吹的爆发感 */
        trumpet: {
            wave: "sawtooth",
            volume: 0.055,
            attack: 0.05,
            decay: 0.14,
            sustain: 0.7,
            release: 0.25,
            filter: 1800,
            filterEnd: 3600,
            q: 1.0,
            detune: 0
        },
        /* 8bit古早风格：纯方波、超短包络，红白机/早期游戏机味 */
        chip8: {
            wave: "square",
            volume: 0.05,
            attack: 0.001,
            decay: 0.02,
            sustain: 0.5,
            release: 0.04,
            filter: 6500,
            detune: 0
        },
        /* ===== 以下为 GM 兼容扩展音色（供 midi-parser 按家族区间映射） ===== */

        /* 电钢琴（GM 4-7）：柔和正弦 + 高八度三角泛音，衰减绵长 */
        epiano: {
            wave: "sine",
            volume: 0.07,
            attack: 0.002,
            decay: 0.45,
            sustain: 0.18,
            release: 0.5,
            filter: 2200,
            filterEnd: 900,
            q: 0.4,
            detune: 0,
            oscillators: [
                { wave: "sine", gain: 0.8 },
                { wave: "triangle", gain: 0.2, octave: 1 }
            ]
        },
        /* 八音盒/钟类（GM 8-15、112-119）：高八度泛音 + 极短起音的长衰减 */
        musicbox: {
            wave: "sine",
            volume: 0.055,
            attack: 0.001,
            decay: 0.55,
            sustain: 0.1,
            release: 0.6,
            filter: 5000,
            detune: 0,
            oscillators: [
                { wave: "sine", gain: 0.75 },
                { wave: "sine", gain: 0.25, octave: 2 }
            ]
        },
        /* 管风琴（GM 16-23）：多八度正弦叠加，持续饱满无衰减 */
        organ: {
            wave: "sine",
            volume: 0.05,
            attack: 0.02,
            decay: 0.05,
            sustain: 1,
            release: 0.15,
            filter: 4000,
            detune: 0,
            oscillators: [
                { wave: "sine", gain: 0.55 },
                { wave: "sine", gain: 0.3, octave: 1 },
                { wave: "sine", gain: 0.15, octave: 2 }
            ]
        },
        /* 木吉他（GM 24-31、104-111）：拨弦感——三角波为主 + 锯齿泛音，滤波器下滑 */
        guitar: {
            wave: "triangle",
            volume: 0.065,
            attack: 0.002,
            decay: 0.35,
            sustain: 0.15,
            release: 0.3,
            filter: 2600,
            filterEnd: 1100,
            q: 0.5,
            detune: 0,
            oscillators: [
                { wave: "triangle", gain: 0.7 },
                { wave: "sawtooth", gain: 0.3 }
            ]
        },
        /* 贝斯（GM 32-39）：低八度正弦垫底 + 窄滤波锯齿 */
        bass: {
            wave: "sawtooth",
            volume: 0.09,
            attack: 0.005,
            decay: 0.2,
            sustain: 0.7,
            release: 0.15,
            filter: 700,
            filterEnd: 400,
            q: 0.8,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.6 },
                { wave: "sine", gain: 0.4, octave: -1 }
            ]
        },
        /* 弦乐合奏（GM 48-51）：三把失谐锯齿慢起音，宽厚 */
        strings: {
            wave: "sawtooth",
            volume: 0.04,
            attack: 0.25,
            decay: 0.2,
            sustain: 0.8,
            release: 0.5,
            filter: 2600,
            q: 0.6,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.35, detune: -8 },
                { wave: "sawtooth", gain: 0.35, detune: 8 },
                { wave: "triangle", gain: 0.3, octave: 1 }
            ]
        },
        /* 人声合唱（GM 52-55）：失谐三角波慢起音，柔和圆润 */
        choir: {
            wave: "triangle",
            volume: 0.045,
            attack: 0.3,
            decay: 0.2,
            sustain: 0.85,
            release: 0.6,
            filter: 1800,
            q: 0.5,
            detune: 0,
            oscillators: [
                { wave: "triangle", gain: 0.4, detune: -5 },
                { wave: "triangle", gain: 0.4, detune: 5 },
                { wave: "sine", gain: 0.2, octave: 1 }
            ]
        },
        /* 铜管合奏（GM 61-63）：双失谐锯齿 + 滤波上滑的群奏爆发 */
        brass: {
            wave: "sawtooth",
            volume: 0.05,
            attack: 0.06,
            decay: 0.15,
            sustain: 0.75,
            release: 0.3,
            filter: 1200,
            filterEnd: 2600,
            q: 1.0,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.45, detune: -6 },
                { wave: "sawtooth", gain: 0.45, detune: 6 },
                { wave: "sine", gain: 0.1, octave: -1 }
            ]
        },
        /* 萨克斯（GM 64-71）：锯齿 + 方波泛音，滤波器上滑的簧片感 */
        sax: {
            wave: "sawtooth",
            volume: 0.055,
            attack: 0.04,
            decay: 0.12,
            sustain: 0.75,
            release: 0.25,
            filter: 1600,
            filterEnd: 2400,
            q: 1.2,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.8 },
                { wave: "square", gain: 0.2 }
            ]
        },
        /* 长笛（GM 72-79）：纯音正弦 + 气息八度 */
        flute: {
            wave: "sine",
            volume: 0.05,
            attack: 0.06,
            decay: 0.08,
            sustain: 0.85,
            release: 0.2,
            filter: 3500,
            detune: 0,
            oscillators: [
                { wave: "sine", gain: 0.85 },
                { wave: "sine", gain: 0.15, octave: 1 }
            ]
        },
        /* 竖琴（GM 46）：拨弦泛音，长衰减 */
        harp: {
            wave: "triangle",
            volume: 0.06,
            attack: 0.001,
            decay: 0.4,
            sustain: 0.1,
            release: 0.5,
            filter: 3200,
            filterEnd: 1500,
            detune: 0,
            oscillators: [
                { wave: "triangle", gain: 0.75 },
                { wave: "sine", gain: 0.25, octave: 1 }
            ]
        },
        /* 合成垫（GM 88-103）：慢起音双失谐锯齿 + 低八度三角，宽厚氛围 */
        synthPad: {
            wave: "sawtooth",
            volume: 0.035,
            attack: 0.5,
            decay: 0.3,
            sustain: 0.9,
            release: 0.8,
            filter: 1500,
            q: 0.5,
            detune: 0,
            oscillators: [
                { wave: "sawtooth", gain: 0.3, detune: -10 },
                { wave: "sawtooth", gain: 0.3, detune: 10 },
                { wave: "triangle", gain: 0.4, octave: -1 }
            ]
        }
    };

    global.SparrowDefaultInstruments = DEFAULT_INSTRUMENTS;
})(window);
