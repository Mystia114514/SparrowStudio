简体中文 | [English](README.en.md)

# SparrowStudio（雀音乐工作室）

**当前版本**：v1.0.0 · 完整更新记录见 [CHANGELOG.md](CHANGELOG.md)

> **声明**：本引擎由 AI 编程开发。
>
> **建议使用场景**：① 部署于低带宽服务器上的个人网站；② 使用 CDN/ESA 等内容分发服务、可用流量不多的网站；③ 因其他原因而无法直接播放音频文件的网站。原理：音乐以几 KB 的 .mid 曲谱存储，访问时由浏览器实时合成发声，代替直接分发数 MB 的音频文件，显著节省流量与带宽。

纯代码 Web Audio 音乐工作室：内置合成引擎、可视化 MIDI 编辑器（Sparrow MIDI Editor）与示例曲库，零依赖、双击即用。当前文件夹不会自动影响原游戏；只有在页面中手动引入这些脚本并调用 `SparrowMusicManager` 后才会生效。

> **命名说明**：项目/工作室名为 **SparrowStudio**；引擎代码命名空间与之对齐，统一使用 `Sparrow` 前缀（`SparrowCore`、`SparrowSynth`、`SparrowMusicManager` 等），二者指同一套系统。

> **只想快速把引擎用起来？** → 看 **[QUICKSTART.md](QUICKSTART.md)**（快速调用教程：按序引入 `core/` + `instruments/`，用 `SparrowMusicManager` 加载与播放）。

## 文件夹结构与功能

项目按"层"拆分为 4 个项目组文件夹，另有 1 个构建工具。**本 README 只说明各文件夹的功能定位；每个文件夹内所有文件的逐一功能详解，见该文件夹内的 `README.md`**：

| 文件夹 | 层 | 功能定位 |
|---|---|---|
| [`core/`](core/README.md) | 基础依赖层 | 引擎本体：AudioContext 与 master/music/sfx 三总线调音台、音符解析、合成器（17 种音色）、多轨 BGM 循环调度、短音效播放、MIDI 实时解析、统一门面 `SparrowMusicManager`。 |
| [`instruments/`](instruments/README.md) | 音色层 | 声音定义的纯数据层：`instruments.js` 定义 17 种内置乐器音色，`sfx-library.js` 定义 16 个内置游戏音效。不含逻辑代码。 |
| [`editor/`](editor/README.md) | 编辑器层 | 可视化 MIDI 编辑器（Sparrow MIDI Editor）：双击 `music-editor.html` 即可使用（file:// 可用），钢琴卷帘作曲、试听、打开/保存标准 .mid。不进游戏。 |
| [`music-sheets/`](music-sheets/README.md) | 曲谱层 | .mid 曲谱存放处（含 1 首示例曲，为东方 Project 同人仿写曲），游戏运行时经 `fetch` + `loadMidi` 实时加载播放。 |

## 接入游戏的引入方式

> 看不懂下面的接入步骤？**如果看不懂的话，那就让 AI 来看吧**——把本 README（或 [QUICKSTART.md](QUICKSTART.md)）整段复制给任意 AI 助手，让它照文档帮你接入。

把 `core/` 与 `instruments/` 两个文件夹复制进你的项目，按依赖顺序引入 9 个脚本（顺序即依赖顺序，不能打乱；编辑器文件夹 `editor/` 不需要）：

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

各脚本的职责与依赖关系，见 `core/README.md` 与 `instruments/README.md` 的文件功能详解。

### 播放 MIDI 曲谱（推荐工作流）

用编辑器制作曲子 → "保存 MIDI" 得到 `xxx.mid` → 放入 `music-sheets/` → 游戏中实时加载：

```js
const buffer = await (await fetch("music-sheets/xxx.mid")).arrayBuffer();
SparrowMusicManager.loadMidi("xxx", buffer); // options 可选：{ name, loop, volume, fadeIn }，volume 缺省 2.5
await SparrowMusicManager.unlock();
SparrowMusicManager.playBgm("xxx");
```

转换在播放前瞬间完成（几毫秒），对调度器透明。转换规则：GM 音色按精确编号优先 + 家族区间映射到 17 种内置音色、velocity 转逐音符音量、和弦自动拆分声部轨、中途变速与弯音/CC 被忽略，详见 `core/README.md`。

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
- 钢琴卷帘可视化 MIDI 编辑器（music-editor.html + editor/ 模块，打开/保存标准 .mid，支持撤销重做）

曲谱统一通过 .mid 文件提供（编辑器制作或外部导入）。内置 16 个游戏音效（`instruments/sfx-library.js`），引擎与编辑器功能完整。尚未接入原游戏文件。

## 更新记录

完整更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## License

代码以 [MIT](LICENSE) 协议开源。`music-sheets/` 内的曲谱为二次创作作品，授权单独说明：见 [music-sheets/README.md](music-sheets/README.md)。
