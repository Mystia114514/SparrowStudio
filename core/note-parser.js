/**
 * Sparrow - NoteParser（音符解析）
 * 音名/唱名 → 频率。支持科学音高记法（A-G + 多重升降号 + 八度，
 * 含 Cb、B# 等异名记法）与 Solfège 唱名（Do/Re/Mi...，缺省八度 4）。
 * 使用 MIDI 标准公式：A4 = 69 = 440Hz。
 */

(function(global) {
    "use strict";

    // 基础音名字在其八度内的半音位置（C=0 … B=11）。
    // 变音记号（#/b）以半音为单位在基音上加减，可叠加任意数量（含双升/双降），
    // 因此 Cb、B#、E#、Fb、Dbb、C## 等异名记法都能解析为正确的等音音高。
    const BASE_NOTE = {
        C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
    };

    // 唱名 → 音名（支持常见拼写变体：Sol/So、Ti/Si）。
    const SOLFEGE_NOTE = {
        do: "C", re: "D", mi: "E", fa: "F",
        sol: "G", so: "G", la: "A", ti: "B", si: "B"
    };

    const NoteParser = {
        noteToFrequency(note) {
            if (typeof note === "number") return note;
            if (!note || note === "REST" || note === "R") return 0;

            // 唱名优先：Do/Re/Mi/Fa/Sol/So/La/Ti/Si（可带 #/b 和可选八度，缺省为 4）。
            const sol = this.solfegeToFrequency(note);
            if (sol != null) return sol;

            // 字母 + 任意个同向变音记号（#.. 或 b..）+ 八度数字。
            const match = String(note).trim().match(/^([A-Ga-g])(#+|b+)?(-?\d)$/);
            if (!match) return 0;

            const name = match[1].toUpperCase();
            const accidental = match[2] || "";
            const octave = parseInt(match[3], 10);
            const base = BASE_NOTE[name];
            if (base === undefined) return 0;

            // 每升号 +1 半音，每降号 -1 半音（支持双升/双降等多重变音）。
            const offset = accidental[0] === "#"
                ? accidental.length
                : accidental[0] === "b" ? -accidental.length : 0;

            // 直接以整数半音求 MIDI，不做取模，保证 B#4=C5、Cb4=B3 等异名记法八度正确。
            const midi = (octave + 1) * 12 + base + offset;
            return 440 * Math.pow(2, (midi - 69) / 12);
        },

        // 唱名记法 → 频率。格式：Do/Re/Mi/Fa/Sol/So/La/Ti/Si，可带 #/b，
        // 可选八度数字；未写八度时默认落中音 Do4(=C4)。无法识别返回 null。
        solfegeToFrequency(note) {
            const match = String(note).trim().match(/^(do|re|mi|fa|sol|so|la|ti|si)(#+|b+)?(-?\d)?$/i);
            if (!match) return null;

            const letter = SOLFEGE_NOTE[match[1].toLowerCase()];
            const accidental = match[2] || "";
            const octave = match[3] !== undefined && match[3] !== ""
                ? parseInt(match[3], 10)
                : 4;

            const base = BASE_NOTE[letter];
            const offset = accidental[0] === "#"
                ? accidental.length
                : accidental[0] === "b" ? -accidental.length : 0;

            const midi = (octave + 1) * 12 + base + offset;
            return 440 * Math.pow(2, (midi - 69) / 12);
        }
    };

    global.SparrowNoteParser = NoteParser;
})(window);
