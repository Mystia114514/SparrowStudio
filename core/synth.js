/**
 * Sparrow - Synth（合成器）
 * 负责实际发声：振荡器组、包络、滤波器、噪声与鼓类音效。
 * 音符解析委托 SparrowNoteParser；默认音色来自 SparrowDefaultInstruments
 * （须先加载 instruments.js），可通过 registerInstrument 注册/覆盖音色。
 */

(function(global) {
    "use strict";

    /* 数值缺省判断：只有未提供/非数值才用缺省值，0（与负数）是合法输入
       不能被 || 当缺省吞掉（与 volume 0 静音同一规则，2026-09-09 修复的延续） */
    function numOr(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    const Synth = {
        /* 不在加载期快照默认音色表：instruments.js 若晚于本文件加载，
           resolveInstrument 会延迟到 global.SparrowDefaultInstruments 上查找，
           避免加载顺序错误导致全部音符静默退化为默认正弦参数 */
        instruments: {},

        registerInstrument(id, config) {
            if (!id || !config) return;
            this.instruments[id] = { ...(this.instruments[id] || {}), ...config };
        },

        noteToFrequency(note) {
            return global.SparrowNoteParser.noteToFrequency(note);
        },

        playNote(note, options) {
            const freq = this.noteToFrequency(note);
            if (!freq) return null;
            return this.playTone({ ...options, freq });
        },

        playTone(options) {
            const core = global.SparrowCore;
            core.init();
            if (!core.ctx) return null;

            const instrument = this.resolveInstrument(options?.instrument, options);
            const startTime = Math.max(core.now(), Number(options?.startTime) || core.now());
            /* duration 允许 0（最短音）：只有未提供/非数值时才用缺省，不能把 0 当缺省 */
            const rawDuration = Number(options?.duration);
            const duration = Math.max(0.01, Number.isFinite(rawDuration) ? rawDuration : 0.25);
            const release = Math.max(0.01, numOr(instrument.release, 0.08));
            const stopTime = startTime + duration + release + 0.03;

            return this.createToneNodes({
                freq: options.freq,
                startTime,
                duration,
                stopTime,
                instrument,
                destination: core.getDestination(options?.bus || "music")
            });
        },

        createToneNodes(options) {
            const core = global.SparrowCore;
            /* 起始时刻不允许在过去：osc.start(过去时刻) 会立即起振，包络/滤波器
               automation 也会被钳到当前值（电平跳变咔哒）。调度器停顿追赶等
               场景仍可能送入略过期时刻，统一钳到当前——最多轻微迟到，绝不齐爆 */
            const startTime = Math.max(core.now(), Number(options.startTime) || 0);
            const duration = options.duration;
            const instrument = options.instrument;
            const stopTime = options.stopTime || startTime + duration + Math.max(0.01, numOr(instrument.release, 0.08)) + 0.03;
            const amp = core.ctx.createGain();
            const filter = core.ctx.createBiquadFilter();
            const oscillators = [];
            const oscillatorDefs = Array.isArray(instrument.oscillators) && instrument.oscillators.length
                ? instrument.oscillators
                : [{ wave: instrument.wave || "sine", gain: 1, detune: 0, octave: 0 }];
            /* 频率上限：极高音（导入 MIDI 可达 G9≈12.5kHz）叠加 +1/+2 八度泛音后
               超过奈奎斯特频率，带限振荡器折返会产生刺耳的不可谐音失真；
               钳到采样率的 0.45 倍（留出过渡带） */
            const maxFreq = (core.ctx.sampleRate || 48000) * 0.45;

            filter.type = instrument.filterType || "lowpass";
            filter.frequency.setValueAtTime(Number(instrument.filter) || 20000, startTime);
            filter.Q.setValueAtTime(Number(instrument.q) || 0.0001, startTime);
            if (Number.isFinite(Number(instrument.filterEnd))) {
                filter.frequency.linearRampToValueAtTime(Number(instrument.filterEnd), startTime + duration);
            }

            this.applyEnvelope(amp.gain, startTime, duration, instrument);

            oscillatorDefs.forEach((def) => {
                const osc = core.ctx.createOscillator();
                const mix = core.ctx.createGain();
                const octave = Number(def.octave) || 0;
                const ratio = Number(def.ratio) || Math.pow(2, octave);
                const gain = Number.isFinite(Number(def.gain)) ? Number(def.gain) : 1 / oscillatorDefs.length;

                osc.type = def.wave || instrument.wave || "sine";
                osc.frequency.setValueAtTime(Math.min(options.freq * ratio, maxFreq), startTime);
                osc.detune.setValueAtTime((Number(instrument.detune) || 0) + (Number(def.detune) || 0), startTime);
                mix.gain.setValueAtTime(Math.max(0, gain), startTime);
                osc.connect(mix);
                mix.connect(filter);
                osc.start(startTime);
                osc.stop(stopTime);
                oscillators.push({ osc, mix });
            });

            filter.connect(amp);
            amp.connect(options.destination);

            const cleanup = function() {
                oscillators.forEach(({ osc, mix }) => {
                    osc.disconnect();
                    mix.disconnect();
                });
                filter.disconnect();
                amp.disconnect();
            };
            oscillators[oscillators.length - 1].osc.onended = cleanup;

            return { oscillators, amp, filter, stopTime };
        },

        playNoise(options) {
            const core = global.SparrowCore;
            core.init();
            if (!core.ctx) return null;

            const startTime = Math.max(core.now(), Number(options?.startTime) || core.now());
            const duration = Math.max(0.01, Number(options?.duration) || 0.08);
            /* volume 允许 0（静音）：只在未提供时才用默认值，不能用 || 把 0 当缺省 */
            const volume = Number.isFinite(Number(options?.volume))
                ? Math.max(0.0001, Number(options.volume))
                : 0.04;
            const bufferSize = Math.max(1, Math.floor(core.ctx.sampleRate * duration));
            const buffer = core.ctx.createBuffer(1, bufferSize, core.ctx.sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const source = core.ctx.createBufferSource();
            const filter = core.ctx.createBiquadFilter();
            const amp = core.ctx.createGain();
            source.buffer = buffer;
            filter.type = options?.filterType || "highpass";
            filter.frequency.setValueAtTime(Number(options?.filter) || 1800, startTime);
            amp.gain.setValueAtTime(volume, startTime);
            amp.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            source.connect(filter);
            filter.connect(amp);
            amp.connect(core.getDestination(options?.bus || "sfx"));
            source.start(startTime);
            source.stop(startTime + duration);
            source.onended = function() {
                source.disconnect();
                filter.disconnect();
                amp.disconnect();
            };
            return { source, amp, filter };
        },

        playKick(options) {
            const core = global.SparrowCore;
            core.init();
            if (!core.ctx) return null;

            const startTime = Math.max(core.now(), Number(options?.startTime) || core.now());
            const duration = Number(options?.duration) || 0.16;
            const osc = core.ctx.createOscillator();
            const amp = core.ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(Math.max(0.01, numOr(options?.from, 130)), startTime);
            /* exponentialRampToValueAtTime 目标必须为正（0/负值浏览器抛 RangeError，
               异常会沿 playSfx 直接抛给游戏代码）：非法回退缺省 45 */
            const kickTo = numOr(options?.to, 45);
            osc.frequency.exponentialRampToValueAtTime(kickTo > 0 ? kickTo : 45, startTime + duration);
            amp.gain.setValueAtTime(Number.isFinite(Number(options?.volume))
                ? Math.max(0.0001, Number(options.volume))
                : 0.12, startTime);
            amp.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(amp);
            amp.connect(core.getDestination(options?.bus || "sfx"));
            osc.start(startTime);
            osc.stop(startTime + duration + 0.02);
            osc.onended = function() {
                osc.disconnect();
                amp.disconnect();
            };
            return { osc, amp };
        },

        resolveInstrument(id, overrides) {
            /* 查找顺序：registerInstrument 注册的自定义音色 → 默认音色表 → 回退 piano。
               默认表在每次解析时从全局现取（而非加载期快照），兼容任意加载顺序 */
            const defaults = global.SparrowDefaultInstruments || {};
            const base = { ...(defaults.piano || {}), ...((id && defaults[id]) || {}) };
            const custom = (id && this.instruments[id]) || {};
            return { ...base, ...custom, ...(overrides || {}) };
        },

        applyEnvelope(param, startTime, duration, instrument) {
            /* 包络四段参数同一规则：0/负数合法（0 落到下限 0.001），
               只有未提供/非数值才用缺省。此前 sustain 0 被 || 吞成 0.4，
               打击乐/拨弦类"一次成音"音色（sustain 0）静默变成持续音 */
            const attack = Math.max(0.001, numOr(instrument.attack, 0.01));
            const decay = Math.max(0.001, numOr(instrument.decay, 0.08));
            const sustain = Math.max(0.001, Math.min(1, numOr(instrument.sustain, 0.4)));
            const release = Math.max(0.001, numOr(instrument.release, 0.08));
            /* volume 允许 0（静音）：0 由下限 0.0001 兜底（保持指数曲线合法），不能当缺省值 */
            const volume = Number.isFinite(Number(instrument.volume))
                ? Math.max(0.0001, Number(instrument.volume))
                : 0.05;
            const sustainLevel = volume * sustain;
            const noteEnd = startTime + duration;

            /* 包络各阶段按时值等比压缩：短音符（时值 < attack+decay）的 attack/decay
               不再越过 noteEnd，release 始终从 noteEnd 起。否则 automation 事件
               时间乱序/滞后——慢起音音色（strings/choir/synthPad 等）短音符拖影
               糊过后续音符，release 较短的音色（bass 等）还会出现结尾电平跳变咔哒 */
            let attackTime = attack;
            let decayTime = decay;
            if (attackTime + decayTime > duration) {
                const scale = duration / (attackTime + decayTime);
                attackTime = Math.max(0.001, attackTime * scale);
                decayTime = Math.max(0.001, decayTime * scale);
                if (attackTime + decayTime > duration) {
                    /* 极短音符兜底：两阶段各占一半，保证事件时间严格单调 */
                    attackTime = duration / 2;
                    decayTime = duration / 2;
                }
            }

            param.cancelScheduledValues(startTime);
            param.setValueAtTime(0.0001, startTime);
            param.linearRampToValueAtTime(volume, startTime + attackTime);
            param.linearRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
            /* 锚定 release 起点：指数衰减必须从 noteEnd 的当前值出发，
               而非从 attack/decay 末事件时刻起斜率错乱 */
            param.setValueAtTime(sustainLevel, noteEnd);
            param.exponentialRampToValueAtTime(0.0001, noteEnd + release);
        }
    };

    global.SparrowSynth = Synth;
})(window);
