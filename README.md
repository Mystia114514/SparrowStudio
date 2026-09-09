# SparrowStudio（雀音乐工作室）

纯代码 Web Audio 音乐工作室：内置合成引擎、可视化 MIDI 编辑器（Sparrow MIDI Editor）与示例曲库，零依赖、双击即用。当前文件夹不会自动影响原游戏；只有在页面中手动引入这些脚本并调用 `SparrowMusicManager` 后才会生效。

> **命名说明**：项目/工作室名为 **SparrowStudio**；引擎代码命名空间与之对齐，统一使用 `Sparrow` 前缀（`SparrowCore`、`SparrowSynth`、`SparrowMusicManager` 等），二者指同一套系统。

> **只想快速把引擎用起来？** → 看 **[QUICKSTART.md](QUICKSTART.md)**（快速调用教程：一行引入 `core/all.js`，用 `SparrowMusicManager` 加载与播放）。

## 文件夹结构与功能

项目按"层"拆分为 4 个项目组文件夹，另有 1 个构建工具。**本 README 只说明各文件夹的功能定位；每个文件夹内所有文件的逐一功能详解，见该文件夹内的 `README.md`**：

| 文件夹 | 层 | 功能定位 |
|---|---|---|
| [`core/`](core/README.md) | 基础依赖层 | 引擎本体，可整体复制进游戏项目：AudioContext 与 master/music/sfx 三总线调音台、音符解析、合成器（17 种音色）、多轨 BGM 循环调度、短音效播放、MIDI 实时解析、统一门面 `SparrowMusicManager`；`all.js` 提供一行引入的加载器。 |
| [`instruments/`](instruments/README.md) | 音色层 | 声音定义的纯数据层：`instruments.js` 定义 17 种内置乐器音色，`sfx-library.js` 定义 16 个内置游戏音效。不含逻辑代码。 |
| [`editor/`](editor/README.md) | 编辑器层 | 可视化 MIDI 编辑器（Sparrow MIDI Editor）：双击 `music-editor.html` 即可使用（file:// 可用），网格作曲、试听、打开/保存标准 .mid。不进游戏。 |
| [`music-sheets/`](music-sheets/README.md) | 曲谱层 | .mid 曲谱存放处（含 2 首示例曲），游戏运行时经 `fetch` + `loadMidi` 实时加载播放。 |

## 接入游戏的引入顺序

把 `core/` 与 `instruments/` 两个文件夹复制进你的项目，一行引入（编辑器文件夹 `editor/` 不需要）：

```html
<script src="core/all.js"></script>
```

`core/all.js` 是加载器，按依赖顺序自动引入引擎的 9 个脚本；不想用加载器时也可手动按序引入（顺序即依赖顺序）：

```html
<script src="core/audio-core.js"></script>
<script src="core/note-parser.js"></script>
<script src="instruments/instruments.js"></script>
<script src="core/synth.js"></script>
<script src="core/sequencer.js"></script>
<script src="core/sfx-player.js"></script>
<script src="core/midi-parser.js"></script>
<script src="core/audio-manager.js"></script>
<script src="instruments/sfx-library.js"></script> <!-- 可选：内置音效数据 -->
```

引入后即获得完整引擎，用统一门面调用：`fetch` 曲谱 + `SparrowMusicManager.loadMidi(id, buffer)` 注册、`playBgm(id)` 播放、`playSfx("coin")` 音效——详见 `QUICKSTART.md`。

引入序列中各脚本的职责，见 `core/README.md` 与 `instruments/README.md` 的文件功能详解。

### 播放 MIDI 曲谱（推荐工作流）

用编辑器制作曲子 → "保存 MIDI" 得到 `xxx.mid` → 放入 `music-sheets/` → 游戏中实时加载：

```js
const buffer = await (await fetch("music-sheets/xxx.mid")).arrayBuffer();
SparrowMusicManager.loadMidi("xxx", buffer); // options 可选：{ name, loop, volume, fadeIn }，volume 缺省 2.5
await SparrowMusicManager.unlock();
SparrowMusicManager.playBgm("xxx");
```

转换在播放前瞬间完成（几毫秒），对调度器透明。转换规则：GM 音色映射到 5 种内置音色（其余回退 piano）、velocity 转逐音符音量、和弦自动拆分声部轨、中途变速与弯音/CC 被忽略，详见 `core/README.md`。

注意：`fetch` .mid 需 HTTP 环境（file:// 下被浏览器拦截）；本地 file:// 场景用编辑器"打开 MIDI"按钮加载 .mid（FileReader 不受限）。

## 基本调用

浏览器通常要求用户交互后才能播放声音，所以推荐在按钮点击后：

```js
await SparrowMusicManager.unlock();
SparrowMusicManager.playBgm("mySong");
```

播放音效（内置 16 个常用音效，可直接调用；详见 instruments/README.md）：

```js
SparrowMusicManager.playSfx("click");
```

控制音量：

```js
SparrowMusicManager.setMasterVolume(0.7);
SparrowMusicManager.setMusicVolume(0.6);
SparrowMusicManager.setSfxVolume(0.8);
SparrowMusicManager.setMuted(true);
```

暂停菜单可以使用 ducking 降低 BGM 音量：

```js
SparrowMusicManager.setDucked(true);
SparrowMusicManager.setDucked(false);
```

## 曲谱格式说明

引擎**仅面向 MIDI**：曲谱一律以标准 .mid 文件提供（编辑器"保存 MIDI"产出，或任意来源的 MIDI 文件），经 `loadMidi` 实时转换为内部对象后播放。内部对象结构由编辑器与解析器自动生成和维护，对使用者透明，无需手写（原手写 JS 曲谱对象/文件方式均已废弃）。

## 可用内置音色

在 `instruments/instruments.js` 的 `DEFAULT_INSTRUMENTS` 中定义，共 **17 种**：

- **基础**：`piano`（钢琴）/ `violin`（小提琴）/ `tuba`（大号）/ `trumpet`（小号）/ `chip8`（8bit 古早风格）
- **扩展**：`epiano`（电钢琴）/ `musicbox`（八音盒）/ `organ`（管风琴）/ `guitar`（吉他）/ `bass`（贝斯）/ `strings`（弦乐合奏）/ `choir`（人声合唱）/ `brass`（铜管合奏）/ `sax`（萨克斯）/ `flute`（长笛）/ `harp`（竖琴）/ `synthPad`（合成垫）

MIDI 解析时对 GM 全部 128 个音色号做家族区间映射到这些音色（精确编号优先），详见 `instruments/README.md`。

可以通过：

```js
SparrowSynth.registerInstrument("myLead", {
    wave: "triangle",
    volume: 0.05,
    attack: 0.02,
    release: 0.18,
    filter: 1600
});
```

## 当前状态

模块化草案，按功能单职责拆分：

- 音频核心（audio-core）与音符解析（note-parser）
- 纯代码合成器（synth）+ 默认音色库（instruments）
- 多轨循环 BGM 调度（sequencer）+ 音效播放（sfx-player）
- 统一管理器（audio-manager）+ MIDI 实时转换（midi-parser）
- 可视化 MIDI 编辑器（music-editor.html + editor/ 模块，打开/保存标准 .mid）

曲谱统一通过 .mid 文件提供（编辑器制作或外部导入；原手写 JS 曲谱方式已废弃）。内置 16 个游戏音效（`instruments/sfx-library.js`），引擎与编辑器功能完整。尚未接入原游戏文件。

## 更新记录

### 2026-09-09

- **移除快速调用演示页**：删除根目录 `quickstart-demo.html`，调用示例全部由 `QUICKSTART.md` 的代码片段承载；验证引擎改为按 QUICKSTART 自建页面（或直接在控制台调用 API）。
- **修复循环播放错位**：此前各音轨按各自 pattern 总长独立循环，长度不齐时每循环一圈错位一次；现在 MIDI 解析与编辑器 `buildSong()` 都会把较短音轨尾部补 REST 对齐到统一曲长，循环各轨不失步。
- **修复力度格刻度混乱**：力度格改为真正的 MIDI velocity（0-127 整数，96 默认、0 静音），构建曲谱时换算为内部音量刻度 0-0.09（此前按提示输入 96 会被当作 96 倍增益导致爆音）；导出 velocity 0 以 1 表达（MIDI 中 0 表示 Note Off）。
- **修复音量 0 不生效**：合成器包络/噪声/鼓的音量缺省判断由 `|| 默认值` 改为 `Number.isFinite`，音量 0（静音）真正生效。
- **命名空间统一**：引擎代码前缀由原 `CodeAudio` 全部更名为 `Sparrow`（10 个全局对象，如 `SparrowCore`/`SparrowSynth`/`SparrowMusicManager`；日志前缀与 localStorage 设置键同步更名，旧键中的音量设置不再读取），命名与项目名对齐。
- **移除极简接口 `Sparrow`**：API 统一为 `SparrowMusicManager` 一个门面（删除 `core/sparrow-api.js`，单文件版 `sparrow.js` 不再包含 `Sparrow` 门面）；原 `loadSong/loadConfig` 能力由"内嵌曲谱对象到 `SparrowMusicLibrary`"与手动 `loadMidi` 取代，`autoPlay` 由一次性 `pointerdown` 监听取代（QUICKSTART 给出即用片段）。
- **移除编辑器"生成播放代码"功能**：接入统一为"保存 .mid → 放入 music-sheets/ → fetch + loadMidi"一条路径；`quickstart-demo.html` 与 `QUICKSTART.md` 同步改写为 `SparrowMusicManager` 调用。
- **移除单文件版及构建工具**：删除 `sparrow.js` 与 `tools/build-sparrow.js`，接入统一为按序引入 `core/` + `instruments/` 的 9 个脚本；`quickstart-demo.html` 与 `QUICKSTART.md` 的引入方式同步改写。
- **新增一行引入加载器 `core/all.js`**：`<script src="core/all.js"></script>` 按依赖顺序引入引擎全部模块（解析期 `document.write` 同步写入，无构建步骤、与源码永不漂移）；演示页与文档同步切换。

### 2026-09-08

- **傻瓜化接入（C 类改进）**：新增单文件版 `sparrow.js`（构建脚本 `tools/build-sparrow.js`）与极简接口 `Sparrow`（load/play/autoPlay/sfx/volume/loadConfig）；编辑器新增"生成播放代码"按钮，按当前曲子产出复制即用的网页代码；支持 `sparrow.config.json` 声明式配置接入。
- **编辑器小节上限 16 → 100**：长曲目可完整进入网格编辑（引擎播放本身无时长限制，此前仅编辑画面受限）。
- **新增快速调用指南**：根目录 `QUICKSTART.md`（引入脚本、最短代码、BGM/音效/音量 API 速查、常见坑）+ 可直接运行的 `quickstart-demo.html` 演示页。
- **项目命名**：项目定名 **SparrowStudio（雀音乐工作室）**，编辑器页面标题同步更新；引擎代码命名空间保持 `Sparrow` 前缀不变（兼容既有 API 与文档）。
- **修复 ducking 与音量调节互踩**：`ducked` 状态移入 `SparrowCore` 统一维护，`applyVolumes` 重算时计入 duck 比例。
- **修复 `Sequencer.pause()` 残留音**：暂停时 bgmGain 快速淡出（静音已排程未发声的音符），恢复时淡回目标音量；清理调度器死代码。
- **修复导出 MIDI 通道碰撞**：改用旋律通道池（跳过 GM 打击乐通道 10），音轨多于 15 条时循环复用。
- **编辑器播放跨小节画面跟随**：网格随播放小节重建（焦点在网格输入框内时暂缓）；修复步数跳转使用过期小节偏移的问题。
- **编辑器音轨上限 16 → 32**：导入超出部分在状态栏提示截断数量；`normalizeCells` 改用 `state.layout` 记录旧布局，小节步数与小节数量同时修改不再错位。
- **废弃手写 JS 曲谱**：曲谱统一使用 .mid 文件；新增示例曲谱 `music-sheets/demo.mid`。
- **GM 音色映射扩展**：内置音色从 5 种增至 17 种，MIDI 解析对 GM 全部 128 个音色号做家族区间映射，外来文件不再"全员钢琴"；编辑器音色下拉与 .mid 导出同步扩展且往返一致。
- **延音踏板（CC64）支持**：踏板期间的音符延音到抬踏板时刻，钢琴类 MIDI 恢复呼吸感。
- **内置音效库**：新增 `instruments/sfx-library.js`，16 个游戏常用音效（UI/角色/战斗/剧情四类），`playSfx` 开箱即用。
- 以上改动已通过浏览器端到端验证（输入 → 保存/打开 → 播放全链路及各修复点）。
