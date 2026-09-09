# editor/ 编辑器文件夹详解

可视化 **MIDI 编辑器**（Sparrow MIDI Editor，即 SparrowStudio 工作室的编辑器组件与首页），仅用于制作/试听/编辑标准 .mid 文件，**不进游戏**。

## 启动方式

直接双击 `music-editor.html` 即可（经典 script 标签，支持 `file://` 打开；浏览器自动播放策略要求声音须由点击触发，点击"播放"即为有效手势）。

## 文件功能详解

### music-editor.html — 入口页

完整 HTML 结构：左侧参数面板（曲谱 ID/曲名/BPM/小节步数/小节数量/音轨数量/默认节拍/音量/淡入/循环）、按钮条（播放/暂停/从头开始/停止/清空/打开 MIDI/保存 MIDI）、右侧编辑区（小节导航 + 竖向网格 + 操作提示）、自定义确认弹窗。文件底部按依赖顺序加载 core/ 引擎、instruments/ 音色与音效数据、本文件夹模块。

### style.css — 暗色主题样式

设计令牌（CSS 变量：配色/边框）、左面板与按钮/输入框样式、编辑区网格（竖向格子、步数列、小节导航卡、播放高亮 `.playing`）、悬浮提示 `.tip`、确认弹窗 `.modal`。

### shared.js — 共享基础（须最先加载）

- `instruments`：编辑器可选音色清单（17 种，与引擎内置音色一一对应）。
- `els`：DOM 引用表（状态栏、网格容器、全部参数输入框、工具栏）。
- `writeStatus(message)`：状态栏输出。
- `clampInput(el, min, max)`：数值输入延迟钳制——输入中只拦超上限（继续输入不可能补全），失焦/回车才回弹完整范围，避免打断输入。

### ui.js — 通用 UI 组件

- `bindTooltips(root)`：给带 `data-tip` 的输入控件绑定悬浮提示（悬停 2 秒显示参数说明）。
- `customConfirm(title, body)`：自定义确认弹窗（Promise 化；Esc/点遮罩取消），替代原生 confirm。

### state.js — 数据模型与参数约束

- `state`：`{ tracks, currentBar, layout }`——音轨数组、当前显示小节、网格布局记录。
- 音轨结构 `{ name, instrument, gate, cells[] }`；单元格 `{ note, beats, volume }`（volume 承担 MIDI velocity 角色）。
- 参数读取与钳制：`getStepCount`（4–64）、`getBarCount`（1–16）、`getTrackCount`（1–32）、`getDefaultLength` 等。
- `syncTrackCount()`：音轨数量与输入同步（增轨/减轨）。
- `normalizeCells()`：布局变化时按 `state.layout` 记录的旧布局把平铺 cells 按 `[bar][step]` 二维重组（两个参数同时修改也不错位）。

### grid.js — 网格与小节导航渲染

- `renderAll()` / `renderTracks()`：重建竖向网格（列 = 音轨，行 = 步骤，仅渲染当前小节）；列头内嵌音轨名/音色/gate 输入。
- `updateBarNav()`：小节卡片导航渲染与高亮。
- 步数点击：从该步播放——**读取点击时刻的 currentBar** 计算绝对步，避免跨小节后闭包过期。

### song.js — 曲谱对象双向转换

- `buildSong(startBeat)`：编辑器状态 → 引擎曲谱对象（空格按 defaultBeats 转 REST、力度格转逐音符 volume、全部 pattern 等长保证循环同步）。
- `applySong(song)`：曲谱对象 → 编辑器状态（推断/读取布局、音符超出网格截断、最多 32 轨、写 `state.layout`）。

### playback.js — 播放控制与播放头

- `playCurrentSong` / `playFromStep` / `pauseCurrentSong` / `restartFromBeginning` / `stopCurrentSong`：播放 = `buildSong()` 即时构建曲谱注册进曲谱库后走引擎调度器，听到即真实效果。
- 播放头：`requestAnimationFrame` + 音频时钟按 BPM 推进，高亮当前行；跨小节时重建网格跟随播放（焦点在网格输入框内则暂缓，避免打断编辑）。

### io.js — MIDI 文件读写

- `buildMidi()`：手写字节序列化——标准 MIDI format 1（PPQ 480，SetTempo + 4/4 拍号），旋律通道池分配（跳过通道 10），gate 按比例缩短音符，力度格 ↔ velocity 互逆转换。
- `importMidiFile(file)`：FileReader → `SparrowMidiParser` 实时解析 → `applySong` 回填；超出 32 轨在状态栏提示截断数量。
- `noteNameToMidi` / `volumeToVelocity`：与解析映射互逆的转换器，保证打开 → 编辑 → 保存往返不失真。

### main.js — 事件绑定与初始化（须最后加载）

按钮事件绑定、数值输入钳制应用、小节步数/小节数量/音轨数量变更处理（缩小时二次确认）、清空确认、保存/打开 MIDI 入口、初始化（默认 3 轨 × 16 步）。

## 加载顺序（music-editor.html 中）

```text
../core/audio-core.js → ../core/note-parser.js → ../instruments/instruments.js
→ ../core/synth.js → ../core/sequencer.js → ../core/sfx-player.js
→ ../core/midi-parser.js → ../core/audio-manager.js
→ shared.js → ui.js → state.js → grid.js → song.js → playback.js → io.js → main.js
```

编辑器模块之间通过**经典脚本的共享全局词法作用域**协作（顶层 `const`/`let`/`function` 跨文件可见），因此顺序即依赖；引擎部分见 `core/README.md`。

## 数据模型

- 每条音轨 `{ name, instrument, gate, cells[] }`。
- `cells` 为 **1D 平铺数组**，长度 = 小节步数 × 小节数量，按小节顺序排列；渲染/播放时按 `[bar][step]` 展开寻址。
- 每格 `{ note, beats, volume }`：note 留空或 `REST` 为休止；volume 即 MIDI velocity（0-127 整数，96 为默认，0 为静音），留空用默认力度 96；构建曲谱时换算为音符音量 0-0.09（与解析导入映射互逆）。

## 参数约束（双重钳制：HTML min/max 属性 + 读取时钳制）

| 参数 | 范围 |
|---|---|
| BPM | 30 – 240 |
| 小节步数 | 4 – 64 |
| 小节数量 | 1 – 100 |
| 音轨数量 | 1 – 32 |
| 默认节拍 | 0.25 – 8 |
| 音量 | 0 – 2000 |
| 淡入秒数 | 0 – 5（仅编辑器内播放有效，MIDI 文件不支持） |

数值输入采用**延迟钳制**：输入过程中只拦截超上限（继续输入不可能补全），低于下限的中间值（如输入 50 时的 "5"）放行，失焦/回车才强制回弹，避免打断输入。

## 关键行为约定（改代码前必读）

- **播放跨小节时网格重建跟随播放小节**；若焦点正在网格输入框内则暂缓重建（避免打断编辑，代价是该小节内不显示行高亮）。
- **修改小节步数**时 `normalizeCells` 依据 `state.layout` 记录的旧布局按 `[bar][step]` 二维展开重组平铺数组（小节步数与小节数量同时修改也不会错位）。
- **减少小节数量**会截断数据，弹出二次确认（`customConfirm`）后才执行。
- 播放时 `buildSong()` 即时构建曲谱并挂到 `SparrowMusicLibrary[song.id]`，再经 `SparrowMusicManager.playBgm` 播放——编辑器内听到即引擎真实效果。

## 文件读写（纯 MIDI）

- **打开 MIDI**：任意来源 `.mid`/`.midi` 文件（本编辑器保存的、DAW 导出的均可），`SparrowMidiParser` 实时解析为可编辑网格。GM 音色按家族区间映射到 17 种内置音色，延音踏板（CC64）生效，和弦自动拆分声部轨；编辑器网格显示上限 32 轨 × 100 小节，超出部分在状态栏提示截断数量。
- **保存 MIDI**：标准 MIDI format 1（PPQ 480，4/4 拍），音色映射到 GM program，gate 按比例缩短音符时值；单音"力度"格转换为 velocity（0-127），与打开时的解析映射互逆，**打开 → 编辑 → 保存往返力度不丢失**。MIDI 通道使用旋律通道池（跳过通道 10 打击乐），音轨多于 15 条时循环复用通道。
- 编辑器仅支持 .mid 一种格式（JS/JSON 曲谱已废弃）；引擎侧 `loadMidi` API 不受影响（见 `core/README.md`）。

## 设计边界（当前范式约束，知悉即可）

- **"小节"是格子分块而非音乐小节**：每格节拍数可变，一个小节的实际拍数 = 该块各格 beats 之和；BPM 播放按拍计时、网格按格分块，两者只在所有格 beats=1 时对齐 4/4。
- **每轨单声部**：一格只容纳一个音名，和弦需拆多条音轨（打开含和弦的 MIDI 时解析器已自动拆声部）。
- **播放头时长按音轨 0 累计**：各轨同格子的 beats 可以不同，播放头以音轨 0 为时间基准（所有轨格子数由 `normalizeCells` 强制等长）。
- **循环对齐由 buildSong 保证**：各音轨节拍总和可能不同（各格 beats 独立可调），`buildSong()` 构建曲谱时给较短的音轨尾部补 REST 对齐到最长音轨，保证调度器循环各轨不失步（MIDI 导入由解析器做同样对齐）。
