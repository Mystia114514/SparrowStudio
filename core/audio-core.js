/**
 * Sparrow - AudioCore（音频上下文与总线）
 * 负责 AudioContext 创建、master/music/sfx 三总线连接、
 * 音量控制、静音、用户手势解锁与设置持久化（localStorage）。
 */

(function(global) {
    "use strict";

    const STORAGE_KEY = "sparrow_settings";

    const AudioCore = {
        ctx: null,
        masterGain: null,
        limiter: null,
        musicGain: null,
        sfxGain: null,
        unlocked: false,
        muted: false,
        ducked: false,
        duckRatio: 0.35,
        masterVolume: 0.7,
        musicVolume: 0.6,
        sfxVolume: 0.8,

        init() {
            if (this.ctx) return this;

            const AudioContextClass = global.AudioContext || global.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn("Sparrow: 当前浏览器不支持 Web Audio API。");
                return this;
            }

            this.loadSettings();
            this.ctx = new AudioContextClass();
            this.masterGain = this.ctx.createGain();
            this.musicGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();

            /* 破音防护限幅器：多声部叠放（密集 MIDI、和弦 + 长 release 尾音）
               的峰值总和超过 0dBFS 时，destination 会硬削波产生刺耳破音。
               限幅器挂在 master 末端：常态音乐（峰值 < -6dB）完全透明，
               峰值超限时按 20:1 柔性压缩，只压电平不产生数字削波的破碎感。 */
            this.limiter = this.ctx.createDynamicsCompressor();
            this.limiter.threshold.value = -6;
            this.limiter.knee.value = 3;
            this.limiter.ratio.value = 20;
            this.limiter.attack.value = 0.002;
            this.limiter.release.value = 0.2;

            this.musicGain.connect(this.masterGain);
            this.sfxGain.connect(this.masterGain);
            this.masterGain.connect(this.limiter);
            this.limiter.connect(this.ctx.destination);
            this.applyVolumes(true);
            return this;
        },

        async unlock() {
            this.init();
            if (!this.ctx) return false;

            /* resume 可能因缺少用户手势被浏览器拒绝：捕获而非放任
               unhandled rejection，未解锁时如实返回 false */
            if (this.ctx.state === "suspended") {
                try {
                    await this.ctx.resume();
                } catch (error) {
                    console.warn("Sparrow: AudioContext 恢复失败（需要用户手势）。", error);
                    return false;
                }
            }

            // 播放一个极短静音，帮助部分移动端完成音频解锁（每次会话只播一次）。
            if (!this.unlocked) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                gain.gain.value = 0.0001;
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.01);
                osc.onended = function() {
                    osc.disconnect();
                    gain.disconnect();
                };
                this.unlocked = true;
            }
            return true;
        },

        now() {
            this.init();
            return this.ctx ? this.ctx.currentTime : 0;
        },

        getDestination(bus) {
            this.init();
            if (bus === "sfx") return this.sfxGain;
            return this.musicGain;
        },

        createGain(value, bus) {
            this.init();
            if (!this.ctx) return null;
            const gain = this.ctx.createGain();
            gain.gain.value = Number.isFinite(Number(value)) ? Number(value) : 1;
            gain.connect(this.getDestination(bus));
            return gain;
        },

        setMuted(value) {
            this.muted = !!value;
            this.applyVolumes();
            this.saveSettings();
        },

        /* ducking（压低 BGM）状态由 core 统一维护：会话级不持久化，
           任何音量/静音变更都经 applyVolumes 重算，避免 ducked 与音量调节互踩。 */
        setDucked(value) {
            this.ducked = !!value;
            this.applyVolumes();
        },

        setMasterVolume(value) {
            this.masterVolume = this.clamp01(value);
            this.applyVolumes();
            this.saveSettings();
        },

        setMusicVolume(value) {
            this.musicVolume = this.clamp01(value);
            this.applyVolumes();
            this.saveSettings();
        },

        setSfxVolume(value) {
            this.sfxVolume = this.clamp01(value);
            this.applyVolumes();
            this.saveSettings();
        },

        applyVolumes(immediate) {
            if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
            const at = this.ctx.currentTime;
            const ramp = immediate ? 0 : 0.03;
            const musicTarget = this.muted ? 0 : this.musicVolume * (this.ducked ? this.duckRatio : 1);
            this.setGainTarget(this.masterGain.gain, this.muted ? 0 : this.masterVolume, at, ramp);
            this.setGainTarget(this.musicGain.gain, musicTarget, at, ramp);
            this.setGainTarget(this.sfxGain.gain, this.sfxVolume, at, ramp);
        },

        setGainTarget(audioParam, value, at, ramp) {
            audioParam.cancelScheduledValues(at);
            audioParam.setValueAtTime(audioParam.value, at);
            audioParam.linearRampToValueAtTime(value, at + ramp);
        },

        clamp01(value) {
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue)) return 0;
            return Math.max(0, Math.min(1, numberValue));
        },

        loadSettings() {
            try {
                const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
                if (!data || typeof data !== "object") return;
                this.muted = !!data.muted;
                this.masterVolume = this.clamp01(data.masterVolume ?? this.masterVolume);
                this.musicVolume = this.clamp01(data.musicVolume ?? this.musicVolume);
                this.sfxVolume = this.clamp01(data.sfxVolume ?? this.sfxVolume);
            } catch (error) {
                console.warn("Sparrow: 音频设置读取失败。", error);
            }
        },

        saveSettings() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    muted: this.muted,
                    masterVolume: this.masterVolume,
                    musicVolume: this.musicVolume,
                    sfxVolume: this.sfxVolume
                }));
            } catch (error) {
                console.warn("Sparrow: 音频设置保存失败。", error);
            }
        }
    };

    global.SparrowCore = AudioCore;
})(window);
