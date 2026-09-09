/**
 * Sparrow - 一行引入加载器
 * 用一行 <script src="core/all.js"></script> 引入引擎全部模块。
 * 前置条件：core/ 与 instruments/ 两个文件夹按原结构放在一起。
 * 必须用 document.write 在页面解析期同步写入：9 个脚本按序执行，
 * 其后的内联脚本即可直接使用 Sparrow* 全局对象。
 */

(function(global) {
    "use strict";

    /* 顺序即依赖顺序（同 core/README.md 的加载顺序），新增模块在此追加。
       document.write 写出的 src 相对"页面"而非本文件解析，
       因此必须用 currentScript 换算出本文件所在目录作为基准路径。 */
    const selfSrc = global.document.currentScript && global.document.currentScript.src;
    const base = selfSrc ? selfSrc.replace(/[^/]*$/, "") : "";
    if (!base) {
        console.warn("Sparrow: all.js 需以经典 <script> 标签同步引入（不可 defer/async/动态加载），否则无法定位引擎目录。");
    }

    const files = [
        "audio-core.js",
        "note-parser.js",
        "../instruments/instruments.js",
        "synth.js",
        "sequencer.js",
        "sfx-player.js",
        "midi-parser.js",
        "audio-manager.js",
        "../instruments/sfx-library.js"
    ];

    files.forEach(function(file) {
        global.document.write('<script src="' + base + file + '"><\/script>');
    });
})(window);
