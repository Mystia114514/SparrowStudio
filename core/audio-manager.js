/**
 * Sparrow - AudioManager（统一门面）
 * 由原 music-manager.js 与 music-library.js 合并而成。
 * 对外提供游戏调用的统一 API，并初始化曲谱容器 SparrowMusicLibrary。
 */
(function(global) {
    "use strict";

    // 曲谱容器壳：保证 SparrowMusicLibrary 始终存在，
    // 便于后续 music-sheets 里的曲谱文件 Object.assign 进去。
    global.SparrowMusicLibrary = global.SparrowMusicLibrary || {};
    // 音效容器壳：保证 SparrowSfxLibrary 始终存在（音效数据文件可后续补充）。
    global.SparrowSfxLibrary = global.SparrowSfxLibrary || {};

    const MusicManager = {
        initialized: false,
        currentBgm: null,

        init() {
            if (this.initialized) return this;
            global.SparrowCore.init();
            this.initialized = true;
            return this;
        },

        async unlock() {
            this.init();
            return await global.SparrowCore.unlock();
        },

        async unlockAndPlayBgm(id, options) {
            await this.unlock();
            return this.playBgm(id, options);
        },

        playBgm(id, options) {
            this.init();
            const song = global.SparrowMusicLibrary[id];
            if (!song) {
                console.warn("Sparrow: 未找到 BGM：", id);
                return false;
            }
            /* 幂等保护仅针对无参调用（游戏循环里重复 playBgm 不重启）；
               播放中与暂停中都算"进行中"——暂停态放行会让每帧调用把曲子
               反复拉回开头。带选项（startBeat/volume/loop…）的调用视为明确的
               播放意图照常生效；曲子自然播完后（currentSong 为 null）重新播放 */
            const hasOptions = !!options && Object.keys(options).length > 0;
            if (this.currentBgm === id && !hasOptions
                && (global.SparrowSequencer.playing || global.SparrowSequencer.currentSong)) return true;
            this.currentBgm = id;
            return global.SparrowSequencer.play(song, options || {});
        },

        stopBgm(options) {
            this.currentBgm = null;
            global.SparrowSequencer.stop(options || {});
        },

        pauseBgm() {
            global.SparrowSequencer.pause();
        },

        resumeBgm() {
            global.SparrowSequencer.resume();
        },

        playSfx(id) {
            this.init();
            const sfx = global.SparrowSfxLibrary[id];
            if (!sfx) {
                console.warn("Sparrow: 未找到 SFX：", id);
                return false;
            }
            return global.SparrowSfxPlayer.play(sfx);
        },

        /**
         * 实时加载 MIDI：解析 .mid 字节为曲谱对象并注册到曲谱库。
         * 之后用 playBgm(id) 播放。需要先引入 core/midi-parser.js。
         * @param {string} id 注册到曲谱库的标识（playBgm 参数）
         * @param {ArrayBuffer} arrayBuffer .mid 文件原始字节
         * @param {Object} [options] { name, loop, volume, fadeIn }
         * @returns {Object|null} 解析出的曲谱对象（失败返回 null）
         */
        loadMidi(id, arrayBuffer, options) {
            this.init();
            if (!global.SparrowMidiParser) {
                console.warn("Sparrow: 未加载 SparrowMidiParser（core/midi-parser.js），无法解析 MIDI。");
                return null;
            }
            const song = global.SparrowMidiParser.parse(
                new Uint8Array(arrayBuffer),
                Object.assign({ id }, options || {})
            );
            if (!song) {
                console.warn("Sparrow: MIDI 解析失败：", id);
                return null;
            }
            global.SparrowMusicLibrary[id] = song;
            return song;
        },

        setMuted(value) {
            this.init();
            global.SparrowCore.setMuted(value);
        },

        toggleMuted() {
            this.init();
            global.SparrowCore.setMuted(!global.SparrowCore.muted);
            return global.SparrowCore.muted;
        },

        setMasterVolume(value) {
            this.init();
            global.SparrowCore.setMasterVolume(value);
        },

        setMusicVolume(value) {
            this.init();
            global.SparrowCore.setMusicVolume(value);
        },

        setSfxVolume(value) {
            this.init();
            global.SparrowCore.setSfxVolume(value);
        },

        setDucked(value) {
            this.init();
            /* ducked 状态与淡变曲线统一在 SparrowCore 维护，避免与音量调节互踩 */
            global.SparrowCore.setDucked(value);
        },

        getState() {
            this.init();
            const core = global.SparrowCore;
            return {
                initialized: this.initialized,
                unlocked: core.unlocked,
                muted: core.muted,
                masterVolume: core.masterVolume,
                musicVolume: core.musicVolume,
                sfxVolume: core.sfxVolume,
                currentBgm: this.currentBgm,
                playing: global.SparrowSequencer.playing,
                ducked: core.ducked
            };
        }
    };

    global.SparrowMusicManager = MusicManager;
})(window);