# 快速调用教程 —— 在网页里使用 SparrowStudio 音乐引擎

引擎只做一件事：你把 **.mid 曲谱**交给它，它在玩家浏览器里现场演奏。使用只需三步：**引入引擎脚本 → 加载曲谱 → 点击播放**。全部调用走统一门面 `SparrowMusicManager`。

## 第 0 步：准备

1. 把 `core/` 与 `instruments/` 两个文件夹复制到你的网页目录（引擎全部源码：7 个模块 + 音色/音效数据，无任何依赖）。
2. 准备一个本地 HTTP 服务器（如 VS Code 的 Live Server 插件）：`file://` 直接打开网页时，浏览器会拦截曲谱加载。
3. 准备一首 .mid 曲谱：用编辑器（`editor/music-editor.html`）制作，或使用任意来源的 MIDI 文件，放进 `music-sheets/` 文件夹。

## 第 1 步：引入引擎

在你的 HTML 里（`</body>` 之前）一行引入（前置条件：`core/` 与 `instruments/` 两个文件夹按原结构放在一起）：

```html
<!-- 引擎加载器：按依赖顺序自动引入全部 9 个脚本（7 个引擎模块 + 音色/音效数据）。
     必须写成普通 <script> 标签（不可加 defer/async，也不可在动态脚本里加载），
     因为它要在页面解析期同步写出后续脚本，保证顺序执行。
     放在 </body> 之前：引擎不依赖页面元素，放这里只是不阻塞上面内容的呈现。 -->
<script src="core/all.js"></script>
```

它会按依赖顺序自动引入引擎的 9 个脚本，其后的内联代码即可直接使用全局对象。

验证：打开网页按 F12，在控制台输入 `SparrowMusicManager`，显示一个对象即装好。下面所有代码都在调它。

不想用加载器的话，也可以手动按序引入（与 `all.js` 完全等价，各脚本职责见 `core/README.md`）：

```html
<!-- 顺序即依赖顺序，不能打乱： -->
<script src="core/audio-core.js"></script>        <!-- 音频上下文与三总线（master/music/sfx），被其余所有模块依赖，必须最先 -->
<script src="core/note-parser.js"></script>       <!-- 音名 → 频率（C4、F#4、Do 都行），被合成器调用 -->
<script src="instruments/instruments.js"></script><!-- 17 种内置音色的纯数据定义，必须先于使用它的 synth.js -->
<script src="core/synth.js"></script>             <!-- 合成器：振荡器 → 滤波器 → 包络，真正发声音的模块 -->
<script src="core/sequencer.js"></script>         <!-- 多轨循环调度器：按曲谱逐音符、按时间精准排程 -->
<script src="core/sfx-player.js"></script>        <!-- 短音效播放器：把音效事件序列交给合成器发声 -->
<script src="core/midi-parser.js"></script>       <!-- .mid 文件 → 内部曲谱对象（实时解析，几毫秒） -->
<script src="core/audio-manager.js"></script>     <!-- 统一门面 SparrowMusicManager：游戏只需要调它，必须最后 -->
<script src="instruments/sfx-library.js"></script><!-- 16 个内置音效数据（可选：不想要内置音效可不引） -->
```

## 第 2 步：加载曲谱

页面加载时把 .mid 文件取回来、解析成引擎曲谱并注册进曲谱库。这段代码放在页面自己的 `<script>` 里即可（不需要等用户点击）：

```html
<script>
  // fetch 拿到 .mid 文件 —— 注意：fetch 需要 HTTP 环境（file:// 直开会被浏览器拦截）
  fetch("music-sheets/pixel-parade.mid")
      // 第一步：把响应体读成 ArrayBuffer（.mid 是二进制文件，不能按文本读）
      .then((response) => response.arrayBuffer())
      // 第二步：交给引擎解析并注册。解析在播放前瞬间完成（典型文件几毫秒），
      // 之后曲谱就以 "parade" 这个 id 存在曲谱库里，随时可以点播。
      .then((buffer) => SparrowMusicManager.loadMidi("parade", buffer, { loop: true }));
      //        └ id：自己取的名字（之后 playBgm 用它点歌，必须与点歌时一致）
      //        └ 第三个参数 options 全部可省略：
      //            loop    —— 播完是否从头循环（缺省 true）
      //            volume  —— 整曲音量倍率（缺省 2.5，引擎音符本身音量很小，靠它放大）
      //            fadeIn  —— 开始播放时的淡入秒数（缺省 0.3）
      //            name    —— 曲谱显示名（缺省用 id）
  // 可以一次性预载多首：换不同 id 多调几次 loadMidi，播放时按 id 切歌。
</script>
```

失败时控制台会出现 `Sparrow: MIDI 解析失败` 的警告；没有警告即成功。

## 第 3 步：播放（必须由用户点击触发）

浏览器规定：第一次出声必须发生在用户点击之后（自动播放策略）。所以在按钮点击里先 `unlock()` 解锁音频上下文、再 `playBgm()`：

```html
<button id="start">开始播放</button>
<script>
  // 页面里找到按钮，挂点击处理（也可以用 addEventListener，效果相同）
  document.getElementById("start").onclick = async () => {
      // 解锁：浏览器的自动播放策略要求"首次出声"必须由用户手势触发。
      // unlock() 会恢复被浏览器挂起的音频上下文（首次会顺带播一个极短静音兼容移动端）。
      // 必须先 await 它完成，再播放；之后的调用无副作用，重复调用也安全。
      await SparrowMusicManager.unlock();
      // 播放曲谱库中 id 为 "parade" 的曲子（第 2 步注册的名字），按曲谱的 loop 设置循环。
      // id 写错或曲谱还没加载完，控制台会提示"未找到 BGM"。
      SparrowMusicManager.playBgm("parade");
      // 同时来一个内置音效（16 个现成音效之一），BGM 和音效互不打断。
      SparrowMusicManager.playSfx("victory");
  };
</script>
```

想要"用户点击页面**任意位置**就开播"，用一个一次性监听即可（`once: true` 表示触发一次后自动移除，不会重复开播）：

```js
// pointerdown 同时覆盖鼠标按下与手指触摸，比 click 更适合移动端
document.addEventListener("pointerdown", () => {
    // 先解锁再播放：unlock 返回 Promise，用 .then 等它完成
    SparrowMusicManager.unlock().then(() => SparrowMusicManager.playBgm("parade"));
}, { once: true });
```

## 第 4 步：播放控制、音效与音量

```js
// ===== 播放控制 =====
SparrowMusicManager.playBgm("parade");   // 播放指定曲谱；播放中重复调用同一 id 不会打断
SparrowMusicManager.pauseBgm();          // 暂停（记住进度，快速淡出避免残留音）
SparrowMusicManager.resumeBgm();         // 从暂停处继续播放
SparrowMusicManager.stopBgm();           // 停止并清空进度（淡出 0.2 秒）；下次 playBgm 从头开始

// ===== 音效 =====
SparrowMusicManager.playSfx("coin");     // 播放内置音效，同样建议发生在用户点击后

// ===== 音量（三条总线独立控制，0–1，改动会自动记住，下次打开页面仍生效）=====
SparrowMusicManager.setMusicVolume(0.6);   // 音乐总线：只影响 BGM
SparrowMusicManager.setSfxVolume(0.9);     // 音效总线：只影响 playSfx
SparrowMusicManager.setMasterVolume(0.8);  // 总线：同时压住音乐和音效（实际响度 = 总线 × 各自音量）
SparrowMusicManager.setMuted(true);        // 全局静音开关（false 取消）
```

内置音效共 16 个，直接换 ID 使用：UI `click` `hover` `confirm` `back`｜角色 `jump` `coin` `powerup` `levelup` `hurt` `footstep` `doorOpen`｜战斗 `laser` `hit` `explosion`｜剧情 `victory` `gameover`

## 进阶能力（同一门面）

```js
// ducking：把 BGM 压低到 0.35 倍（比如打开暂停菜单时），false 恢复。
// 只压音乐总线，音效不受影响；这个状态不持久化，刷新页面自动恢复。
SparrowMusicManager.setDucked(true);

// 状态快照：一次拿到是否已解锁、正在播哪首、各总线音量、是否静音/压低等，
// 适合做设置界面回显或调试。
SparrowMusicManager.getState();

// 自定义音色：注册后即可在曲谱/音效里当 instrument 使用；
// 字段是波形、音量、包络（起音/衰减/延音/释放）与滤波器，浅合并到内置音色上。
SparrowSynth.registerInstrument("myLead", { wave: "triangle", volume: 0.05, attack: 0.02, release: 0.18 });
```

API 详解见 `core/README.md`。

## 常见问题

| 现象 | 解决 |
|---|---|
| 点了按钮没声音 | 确认播放发生在用户点击之后，且点击处理里先 `await SparrowMusicManager.unlock()` 再 `playBgm` |
| 控制台报 fetch 相关错误 | 用 `file://` 直接打开了网页——改用 HTTP 服务器打开 |
| 音乐太小声 | 曲谱 volume 保持默认 2.5；必要时调 `SparrowMusicManager.setMasterVolume(1)` |
| 提示"未找到 BGM" | `loadMidi` 注册的 id 与 `playBgm` 的 id 不一致，或曲谱还没加载完成 |
