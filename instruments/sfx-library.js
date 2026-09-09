/**
 * Sparrow - SfxLibrary（内置音效库）
 * 纯数据文件：向 SparrowSfxLibrary 注册游戏常用短音效，
 * 供 SparrowSfxPlayer 播放（playSfx("click")）。
 * 事件词汇：tone（音符）/ noise（噪声）/ kick（正弦频率下扫，可当激光/爆炸），
 * 字段详见 instruments/README.md。须在 audio-manager.js 之后（或任意时机）加载。
 */

(function(global) {
    "use strict";

    /* UI 音效统一用 chip8 短音；战斗/环境音效混用噪声与扫频 */
    const SFX = {
        /* ===== UI ===== */
        click: [
            { type: "tone", note: "C6", duration: 0.04, instrument: "chip8", volume: 0.04 },
            { type: "noise", delay: 0.005, duration: 0.02, volume: 0.012, filter: 5000 }
        ],
        hover: [
            { type: "tone", note: "E6", duration: 0.02, instrument: "chip8", volume: 0.022 }
        ],
        confirm: [
            { type: "tone", note: "C5", duration: 0.05, instrument: "chip8", volume: 0.04 },
            { type: "tone", delay: 0.07, note: "G5", duration: 0.08, instrument: "chip8", volume: 0.045 }
        ],
        back: [
            { type: "tone", note: "G5", duration: 0.05, instrument: "chip8", volume: 0.04 },
            { type: "tone", delay: 0.07, note: "C5", duration: 0.08, instrument: "chip8", volume: 0.04 }
        ],

        /* ===== 角色 ===== */
        jump: [
            { type: "tone", note: "C5", duration: 0.03, instrument: "chip8", volume: 0.045 },
            { type: "tone", delay: 0.035, note: "E5", duration: 0.03, instrument: "chip8", volume: 0.045 },
            { type: "tone", delay: 0.07, note: "G5", duration: 0.06, instrument: "chip8", volume: 0.05 }
        ],
        coin: [
            { type: "tone", note: "B5", duration: 0.04, instrument: "chip8", volume: 0.05 },
            { type: "tone", delay: 0.05, note: "E6", duration: 0.1, instrument: "chip8", volume: 0.05 }
        ],
        powerup: [
            { type: "tone", note: "C5", duration: 0.05, instrument: "chip8", volume: 0.045 },
            { type: "tone", delay: 0.06, note: "E5", duration: 0.05, instrument: "chip8", volume: 0.045 },
            { type: "tone", delay: 0.12, note: "G5", duration: 0.05, instrument: "chip8", volume: 0.045 },
            { type: "tone", delay: 0.18, note: "C6", duration: 0.14, instrument: "chip8", volume: 0.05 }
        ],
        levelup: [
            { type: "tone", note: "C5", duration: 0.06, instrument: "trumpet", volume: 0.05 },
            { type: "tone", delay: 0.09, note: "E5", duration: 0.06, instrument: "trumpet", volume: 0.05 },
            { type: "tone", delay: 0.18, note: "G5", duration: 0.06, instrument: "trumpet", volume: 0.05 },
            { type: "tone", delay: 0.27, note: "C6", duration: 0.3, instrument: "trumpet", volume: 0.055 }
        ],
        hurt: [
            { type: "tone", note: "E4", duration: 0.07, instrument: "guitar", volume: 0.06 },
            { type: "tone", delay: 0.08, note: "A3", duration: 0.12, instrument: "guitar", volume: 0.06 },
            { type: "noise", delay: 0.02, duration: 0.05, volume: 0.025, filter: 1800 }
        ],
        footstep: [
            { type: "noise", duration: 0.045, volume: 0.03, filter: 600, filterType: "lowpass" }
        ],
        doorOpen: [
            { type: "tone", note: "A2", duration: 0.14, instrument: "organ", volume: 0.05 },
            { type: "tone", delay: 0.12, note: "B2", duration: 0.16, instrument: "organ", volume: 0.05 }
        ],

        /* ===== 战斗 ===== */
        laser: [
            /* kick = 正弦频率下扫，从高到低即"biu" */
            { type: "kick", from: 1400, to: 200, duration: 0.12, volume: 0.08 }
        ],
        hit: [
            { type: "noise", duration: 0.06, volume: 0.05, filter: 2500 }
        ],
        explosion: [
            { type: "noise", duration: 0.4, volume: 0.09, filter: 900, filterType: "lowpass" },
            { type: "kick", delay: 0.02, from: 150, to: 30, duration: 0.35, volume: 0.14 }
        ],

        /* ===== 剧情 ===== */
        victory: [
            { type: "tone", note: "C5", duration: 0.1, instrument: "trumpet", volume: 0.05 },
            { type: "tone", delay: 0.13, note: "E5", duration: 0.1, instrument: "trumpet", volume: 0.05 },
            { type: "tone", delay: 0.26, note: "G5", duration: 0.1, instrument: "trumpet", volume: 0.05 },
            { type: "tone", delay: 0.39, note: "C6", duration: 0.5, instrument: "trumpet", volume: 0.055 }
        ],
        gameover: [
            { type: "tone", note: "G4", duration: 0.2, instrument: "organ", volume: 0.05 },
            { type: "tone", delay: 0.26, note: "E4", duration: 0.2, instrument: "organ", volume: 0.05 },
            { type: "tone", delay: 0.52, note: "C4", duration: 0.5, instrument: "organ", volume: 0.055 }
        ]
    };

    global.SparrowSfxLibrary = global.SparrowSfxLibrary || {};
    Object.assign(global.SparrowSfxLibrary, SFX);
})(window);
