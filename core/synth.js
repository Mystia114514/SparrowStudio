/**
 * Sparrow - Synth（合成器）
 * 负责实际发声：振荡器组、包络、滤波器、噪声与鼓类音效。
 * 音符解析委托 SparrowNoteParser；默认音色来自 SparrowDefaultInstruments
 * （须先加载 instruments.js），可通过 registerInstrument 注册/覆盖音色。
 */

(function(global) {
    "use strict";

    const Synth = {
        instruments: { ...global.SparrowDefaultInstruments },

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
            const duration = Math.max(0.01, Number(options?.duration) || 0.25);
            const release = Math.max(0.01, Number(instrument.release) || 0.08);
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
            const startTime = options.startTime;
            const duration = options.duration;
            const instrument = options.instrument;
            const stopTime = options.stopTime || startTime + duration + Math.max(0.01, Number(instrument.release) || 0.08) + 0.03;
            const amp = core.ctx.createGain();
            const filter = core.ctx.createBiquadFilter();
            const oscillators = [];
            const oscillatorDefs = Array.isArray(instrument.oscillators) && instrument.oscillators.length
                ? instrument.oscillators
                : [{ wave: instrument.wave || "sine", gain: 1, detune: 0, octave: 0 }];

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
                osc.frequency.setValueAtTime(options.freq * ratio, startTime);
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
            osc.frequency.setValueAtTime(Number(options?.from) || 130, startTime);
            osc.frequency.exponentialRampToValueAtTime(Number(options?.to) || 45, startTime + duration);
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
            const base = this.instruments[id] || this.instruments.piano;
            return { ...base, ...(overrides || {}) };
        },

        applyEnvelope(param, startTime, duration, instrument) {
            const attack = Math.max(0.001, Number(instrument.attack) || 0.01);
            const decay = Math.max(0.001, Number(instrument.decay) || 0.08);
            const sustain = Math.max(0.001, Math.min(1, Number(instrument.sustain) || 0.4));
            const release = Math.max(0.001, Number(instrument.release) || 0.08);
            /* volume 允许 0（静音）：0 由下限 0.0001 兜底（保持指数曲线合法），不能当缺省值 */
            const volume = Number.isFinite(Number(instrument.volume))
                ? Math.max(0.0001, Number(instrument.volume))
                : 0.05;
            const sustainLevel = volume * sustain;
            const noteEnd = startTime + duration;

            param.cancelScheduledValues(startTime);
            param.setValueAtTime(0.0001, startTime);
            param.linearRampToValueAtTime(volume, startTime + attack);
            param.linearRampToValueAtTime(sustainLevel, startTime + attack + decay);
            param.setValueAtTime(sustainLevel, Math.max(startTime + attack + decay, noteEnd));
            param.exponentialRampToValueAtTime(0.0001, noteEnd + release);
        }
    };

    global.SparrowSynth = Synth;
})(window);
