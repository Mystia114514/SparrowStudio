/**
 * Sparrow - SfxPlayer（短音效播放器）
 * 解析音效事件序列（tone/noise/kick），按延迟时间轴调度合成器发声，
 * 输出到 sfx 总线。
 */

(function(global) {
    "use strict";

    const SfxPlayer = {
        play(definition) {
            if (!definition) return false;
            const core = global.SparrowCore;
            const synth = global.SparrowSynth;
            core.init();
            if (!core.ctx) return false;

            const events = Array.isArray(definition) ? definition : [definition];
            const baseTime = core.now();

            for (const event of events) {
                const startTime = baseTime + Math.max(0, Number(event.delay) || 0);
                const duration = Math.max(0.01, Number(event.duration) || 0.08);
                const type = event.type || "tone";

                if (type === "noise") {
                    synth.playNoise({ ...event, startTime, duration, bus: "sfx" });
                } else if (type === "kick") {
                    synth.playKick({ ...event, startTime, duration, bus: "sfx" });
                } else {
                    synth.playNote(event.note || event.freq, {
                        ...event,
                        startTime,
                        duration,
                        bus: "sfx",
                        instrument: event.instrument || "chip8"
                    });
                }
            }

            return true;
        }
    };

    global.SparrowSfxPlayer = SfxPlayer;
})(window);
