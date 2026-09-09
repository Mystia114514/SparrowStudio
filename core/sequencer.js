/**
 * Sparrow - Sequencer（多轨 BGM 调度器）
 * 按曲谱 pattern 逐音符调度合成器发声：lookahead 定时器、
 * 循环、gate 时值、独立 BGM gain（切歌淡出不影响全局 music bus）。
 */

(function(global) {
    "use strict";

    const Sequencer = {
        currentSong: null,
        currentSongId: null,
        playing: false,
        timerId: null,
        songStartTime: 0,
        nextStepTime: 0,
        cursor: [],
        trackTimes: [],
        lookAheadMs: 35,
        scheduleAheadTime: 0.45,
        bgmGain: null,
        targetVolume: 1,

        play(song, options) {
            if (!song) return false;
            this.stop({ fadeOut: options?.crossFade ?? 0.2 });

            const core = global.SparrowCore;
            core.init();
            if (!core.ctx) return false;

            this.currentSong = song;
            this.currentSongId = song.id || null;
            this.playing = true;
            this.songStartTime = core.now() + 0.03;
            this.nextStepTime = this.songStartTime;
            const startStep = Math.max(0, Math.floor(Number(options?.startStep) || 0));
            this.cursor = song.tracks.map(() => startStep);
            this.trackTimes = song.tracks.map(() => this.songStartTime);
            this.bgmGain = core.ctx.createGain();
            this.bgmGain.gain.value = 0;
            this.bgmGain.connect(core.getDestination("music"));

            const targetVolume = Number(song.volume ?? 1);
            this.targetVolume = targetVolume;
            const fadeIn = Number(options?.fadeIn ?? song.fadeIn ?? 0.35);
            this.bgmGain.gain.setValueAtTime(0.0001, this.songStartTime);
            this.bgmGain.gain.linearRampToValueAtTime(targetVolume, this.songStartTime + fadeIn);

            this.tick();
            this.timerId = setInterval(() => this.tick(), this.lookAheadMs);
            return true;
        },

        stop(options) {
            const core = global.SparrowCore;
            const fadeOut = Number(options?.fadeOut ?? 0.2);

            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
            this.playing = false;
            this.currentSong = null;
            this.currentSongId = null;
            this.cursor = [];
            this.trackTimes = [];

            if (this.bgmGain && core.ctx) {
                const gain = this.bgmGain;
                const at = core.now();
                gain.gain.cancelScheduledValues(at);
                gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, fadeOut));
                setTimeout(() => {
                    try { gain.disconnect(); } catch (error) { /* ignore */ }
                }, Math.ceil((fadeOut + 0.05) * 1000));
            }
            this.bgmGain = null;
        },

        pause() {
            if (!this.playing) return;
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
            this.playing = false;
            /* 快速淡出 bgmGain：静音 lookahead 窗口内已排程、尚未发声的残留音符 */
            const core = global.SparrowCore;
            if (this.bgmGain && core.ctx) {
                const at = core.now();
                this.bgmGain.gain.cancelScheduledValues(at);
                this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), at);
                this.bgmGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
            }
        },

        resume() {
            if (!this.currentSong || this.playing) return;
            const core = global.SparrowCore;
            const at = core.now() + 0.03;
            if (this.bgmGain && core.ctx) {
                this.bgmGain.gain.cancelScheduledValues(at);
                this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), at);
                this.bgmGain.gain.linearRampToValueAtTime(Math.max(0.0001, this.targetVolume ?? 1), at + 0.06);
            }
            this.trackTimes = this.trackTimes.map(() => at);
            this.playing = true;
            this.tick();
            this.timerId = setInterval(() => this.tick(), this.lookAheadMs);
        },

        tick() {
            if (!this.playing || !this.currentSong) return;
            const core = global.SparrowCore;
            const song = this.currentSong;
            const until = core.now() + this.scheduleAheadTime;

            for (let trackIndex = 0; trackIndex < song.tracks.length; trackIndex++) {
                this.scheduleTrack(trackIndex, until);
            }
        },

        scheduleTrack(trackIndex, until) {
            const song = this.currentSong;
            const track = song.tracks[trackIndex];
            if (!track || !Array.isArray(track.pattern) || track.pattern.length === 0) return;

            const beatSeconds = 60 / (track.tempo || song.tempo || 120);
            while (this.trackTimes[trackIndex] < until) {
                const step = track.pattern[this.cursor[trackIndex]];
                const parsed = this.parseStep(step, track);
                const duration = parsed.beats * beatSeconds;

                if (!parsed.rest) {
                    this.scheduleNote(parsed, track, this.trackTimes[trackIndex], duration);
                }

                this.trackTimes[trackIndex] += duration;
                this.cursor[trackIndex]++;

                if (this.cursor[trackIndex] >= track.pattern.length) {
                    if (song.loop !== false && track.loop !== false) {
                        this.cursor[trackIndex] = 0;
                    } else {
                        break;
                    }
                }
            }
        },

        parseStep(step, track) {
            if (typeof step === "string" || typeof step === "number") {
                return { note: step, beats: track.defaultBeats || 1, rest: step === "REST" || step === "R" };
            }

            const note = step[0];
            const beats = Number(step[1] ?? track.defaultBeats ?? 1);
            const options = step[2] || {};
            return {
                note,
                beats: Number.isFinite(beats) && beats > 0 ? beats : 1,
                options,
                rest: note === "REST" || note === "R" || note === null
            };
        },

        scheduleNote(parsed, track, startTime, duration) {
            const synth = global.SparrowSynth;
            if (!this.bgmGain) return;
            const options = {
                ...(track.options || {}),
                ...(parsed.options || {}),
                instrument: parsed.options?.instrument || track.instrument || "piano",
                startTime,
                duration: duration * (track.gate ?? 0.88),
                bus: "music"
            };

            // 为 BGM 创建单独节点链，避免切歌淡出影响全局 music bus。
            this.playNoteToGain(parsed.note, options, this.bgmGain);
        },

        playNoteToGain(note, options, destinationGain) {
            const core = global.SparrowCore;
            const synth = global.SparrowSynth;
            const freq = synth.noteToFrequency(note);
            if (!freq || !core.ctx) return;

            const instrument = synth.resolveInstrument(options.instrument, options);
            const startTime = options.startTime;
            const duration = Math.max(0.01, options.duration || 0.25);
            const release = Math.max(0.01, Number(instrument.release) || 0.08);
            synth.createToneNodes({
                freq,
                startTime,
                duration,
                stopTime: startTime + duration + release + 0.03,
                instrument,
                destination: destinationGain
            });
        }
    };

    global.SparrowSequencer = Sequencer;
})(window);
