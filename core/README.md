# core/ 基础依赖层详解

引擎的逻辑代码层，可整体复制进游戏项目接入。本层所有文件均为经典 script 标签 + IIFE 全局对象模式（非 ES modules，保证 `file://` 直接可用）。本 README 逐一详解本层 8 个文件的功能。

## 文件功能详解

### all.js — 一行引入加载器

- **暴露全局**：无（纯加载器，不挂任何全局对象）
- **职责**：按依赖顺序 `document.write` 引入本层 7 个模块与 `instruments/` 的 2 个数据文件（解析期同步写入，保证执行顺序与其后的内联代码可直接使用全局对象）。接入方一行 `<script src="core/all.js"></script>` 即完成引擎引入，与手动按序引入 9 个脚本完全等价；新增引擎模块时在此文件清单中追加即可。
- **前置条件**：`core/` 与 `instruments/` 两个文件夹按原结构放在一起（相对路径 `../instruments/`）。

### audio-core.js — 音频上下文与总线

- **暴露全局**：`SparrowCore`
- **职责**：AudioContext 的惰性创建与用户手势解锁、master/music/sfx 三总线连接（music/sfx → master → destination）、音量/静音/ducking 控制、设置持久化（localStorage，key：`sparrow_settings`）。
- 关键 API：
  - `init()`：惰性创建 AudioContext 与三条总线，并从 localStorage 恢复音量设置。
  - `unlock()`：用户手势后调用，resume 挂起的上下文并播放一段极短静音以兼容移动端。
  - `now()`：AudioContext 时间基准（秒），调度器与播放头统一使用。
  - `getDestination(bus)`：`"sfx"` 返回 sfx 总线，其余返回 music 总线。
  - `setMuted(v)` / `setMasterVolume(v)` / `setMusicVolume(v)` / `setSfxVolume(v)`：音量 0–1，变更即持久化。
  - `setDucked(v)`：压低 music 总线（0.35 倍）。ducked 状态由 core 统一维护（会话级，不持久化），与音量/静音调节互不冲突。

### note-parser.js — 音符解析

- **暴露全局**：`SparrowNoteParser`（纯计算，无状态）
- **职责**：音名/唱名 → 频率，供合成器与曲谱处理使用。
- 关键 API：
  - `noteToFrequency(note)`：支持两种记法，返回 Hz（无法解析返回 0）：
    - 科学音高记法：`C4`、`F#4`、`Bb3`，升降号可叠加（`C##`、`Dbb`），异名记法（`Cb4`、`B#4`）八度映射正确。
    - Solfège 唱名：`Do`/`Re`/`Mi`/`Fa`/`Sol`/`So`/`La`/`Ti`/`Si`，可带升降号与八度，缺省八度 4。
  - 频率计算使用 MIDI 标准公式：`midi = (octave+1)*12 + 半音偏移`，`freq = 440 * 2^((midi-69)/12)`。

### synth.js — 合成器

- **暴露全局**：`SparrowSynth`
- **职责**：实际发声——振荡器组 → 滤波器 → ADSR 包络 → 输出。默认音色表来自 `instruments/instruments.js`（须先于本文件加载），运行时可用 `registerInstrument` 扩展。
- 关键 API：
  - `registerInstrument(id, config)`：注册/覆盖音色（浅合并）。
  - `playNote(note, options)` / `playTone(options)`：解析音色并创建节点链发声；`options.bus` 决定输出总线。
  - `createToneNodes(options)`：底层节点创建，可指定自定义 destination gain（BGM 淡出的独立节点链依赖此能力）。
  - `playNoise(options)` / `playKick(options)`：噪声与鼓类（正弦频率下扫）发声。
  - `resolveInstrument(id, overrides)`：合并音色定义与临时覆盖。

### sequencer.js — 多轨 BGM 循环调度器

- **暴露全局**：`SparrowSequencer`
- **职责**：按曲谱 pattern 逐音符调度合成器，多轨并行、循环、gate 时值。
- 关键 API：
  - `play(song, options)`：开始调度。`options.startStep` 从指定步起播；`options.fadeIn` 覆盖淡入；曲谱 `volume`/`loop` 字段生效。
  - `stop(options)`：按 `options.fadeOut` 淡出并清理定时器与 bgmGain 节点链。
  - `pause()` / `resume()`：暂停/恢复。暂停时 bgmGain 快速淡出（静音 lookahead 窗口内已排程的残留音），恢复时淡回目标音量并把各轨时间基准重置到当前时刻。
- 调度机制：lookahead 定时器每 35ms 醒来一次，向前调度 0.45s 内的音符，避免 setInterval 抖动造成节拍不准。
- BGM 使用独立 gain 节点链（不经全局 music 总线音量），因此切歌淡出互不影响。

### sfx-player.js — 短音效播放器

- **暴露全局**：`SparrowSfxPlayer`
- **职责**：`play(definition)` 接受单个事件或事件数组，按 `delay` 时间轴调度发声，固定输出 sfx 总线。`type` 支持 `tone`（音符）/ `noise`（噪声）/ `kick`（正弦频率下扫）。
- 音效数据来自 `instruments/sfx-library.js`，经 `SparrowMusicManager.playSfx(id)` 调用。

### midi-parser.js — MIDI 实时转换

- **暴露全局**：`SparrowMidiParser`
- **职责**：把 .mid 文件字节（Uint8Array，SMF format 0/1/2）实时解析为引擎曲谱对象，失败返回 null。解析在播放前瞬间完成（典型文件几毫秒），产物对 Sequencer 完全透明。
- 关键 API：`parse(bytes, options)`，`options`：`{ id, name, loop, volume, fadeIn }`。
- 转换规则：
  - 每个 (MIDI 轨, 通道, 音色) 组合 → 一条内部音轨；同轨重叠音符自动拆分声部（和弦保真）。
  - 所有声部尾部补 REST 对齐全曲长度（最晚结束时刻）：调度器各轨按各自 pattern 总长循环，对齐后循环播放不失步。
  - GM 音色映射：精确编号优先、未命中按 GM 家族区间映射到 17 种内置合成音色（对照表见 instruments/README.md）；通道 10（索引 9，打击乐）固定 chip8。
  - 延音踏板（CC64）生效：踏板期间的 Note Off 缓存挂起，抬踏板时统一延长到该时刻。
  - velocity（0-127）→ 逐音符音量覆盖参数。
  - 速度取第一个 SetTempo 元事件（缺省 120）；中途变速与弯音/其他 CC 表现事件被忽略。

### audio-manager.js — 统一门面（推荐游戏只调用这一层）

- **暴露全局**：`SparrowMusicManager`、`SparrowMusicLibrary`（曲谱容器壳）、`SparrowSfxLibrary`（音效容器壳）
- **职责**：初始化容器、封装游戏调用 API；`loadMidi` 封装"解析 + 注册曲谱库"。
- API 快查：

```js
SparrowMusicManager.init();                  // 初始化（幂等）
await SparrowMusicManager.unlock();          // 用户手势后解锁
SparrowMusicManager.playBgm("maze");         // 播放曲库中的 BGM
SparrowMusicManager.stopBgm();               // 停止
SparrowMusicManager.pauseBgm() / resumeBgm();
SparrowMusicManager.playSfx("click");        // 播放音效（内置音效数据见 instruments/sfx-library.js）
SparrowMusicManager.loadMidi(id, buffer);    // MIDI 实时转换并注册曲谱库（见上文 MidiParser）
SparrowMusicManager.setDucked(true);         // 暂停菜单压低 BGM（0.35 倍）
SparrowMusicManager.getState();              // 当前播放/音量状态快照
```

注意：`fetch` .mid 文件需 HTTP 环境（file:// 下被浏览器拦截）；本地 file:// 场景请用编辑器的"打开 MIDI"按钮（FileReader，不受限）。

## 依赖关系与加载顺序

```text
audio-core.js      （无依赖，被所有文件引用）
note-parser.js     （无依赖，被 synth 委托）
instruments/instruments.js   （音色层，须先于 synth.js 加载）
synth.js           （依赖 Core + NoteParser + DefaultInstruments）
sequencer.js       （依赖 Core + Synth）
sfx-player.js      （依赖 Core + Synth；音效数据见 instruments/sfx-library.js，可选）
midi-parser.js     （无依赖，可选模块：MIDI 实时转换）
audio-manager.js   （依赖以上全部，须最后加载）
instruments/sfx-library.js   （可选音效数据，audio-manager 之后或之前均可）
```

游戏接入时按 `audio-core → note-parser → instruments/instruments → synth → sequencer → sfx-player → midi-parser（可选） → audio-manager → instruments/sfx-library（可选音效数据）` 顺序引入，或直接一行引入 `core/all.js`（内部即此顺序）。

## 数据流

```text
曲谱数据（music-sheets/ 的 .mid 实时解析，或编辑器构建）
  → MusicManager.playBgm(id) 查 SparrowMusicLibrary
  → Sequencer 按 pattern 逐音符调度（gate 控制发声占时值比例）
  → Synth.noteToFrequency 算频率 → createToneNodes 发声
  → BGM gain → music 总线 → master → destination
```
