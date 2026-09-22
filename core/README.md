# core/ 基础依赖层详解

引擎的逻辑代码层，可整体复制进游戏项目接入。本层所有文件均为经典 script 标签 + IIFE 全局对象模式（非 ES modules，保证 `file://` 直接可用）。本 README 逐一详解本层 8 个文件的功能。

## 文件功能详解

### 引入方式 — 散装按依赖顺序引入

- **方式**：接入方在页面中按"加载顺序"（见文末）依次引入 9 个脚本（本层 7 个模块 + `instruments/` 的 2 个数据文件），顺序即依赖顺序。
- **前置条件**：`core/` 与 `instruments/` 两个文件夹按原结构放在一起（相对路径 `../instruments/`）。
- **注意**：经典 script 标签共享全局词法作用域，顺序错误会在运行时报"未定义"；新增引擎文件时同步更新引用方的引入列表与本 README 的顺序说明。

### audio-core.js — 音频上下文与总线

- **暴露全局**：`SparrowCore`
- **职责**：AudioContext 的惰性创建与用户手势解锁、master/music/sfx 三总线连接（music/sfx → master → **限幅器 → destination**）、音量/静音/ducking 控制、设置持久化（localStorage，key：`sparrow_settings`）。
- 关键 API：
  - `init()`：惰性创建 AudioContext 与三条总线，并从 localStorage 恢复音量设置。
  - `unlock()`：用户手势后调用，resume 挂起的上下文并播放一段极短静音以兼容移动端。
  - `now()`：AudioContext 时间基准（秒），调度器与播放头统一使用。
  - `getDestination(bus)`：`"sfx"` 返回 sfx 总线，其余返回 music 总线。
  - `setMuted(v)` / `setMasterVolume(v)` / `setMusicVolume(v)` / `setSfxVolume(v)`：音量 0–1，变更即持久化。
  - `setDucked(v)`：压低 music 总线（0.35 倍）。ducked 状态由 core 统一维护（会话级，不持久化），与音量/静音调节互不冲突。
- **破音防护**：master 与 destination 之间挂 DynamicsCompressorNode 限幅器（threshold -6dB / knee 3 / ratio 20 / attack 2ms / release 0.2s）。多声部叠放（密集 MIDI、和弦 + 长 release 尾音）的峰值总和超过 0dBFS 时，destination 会硬削波产生破音；限幅器对常态音乐（峰值 < -6dB）完全透明，峰值超限时柔性压缩只压电平不产生数字削波。

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
   - `createToneNodes(options)`：底层节点创建，可指定自定义 destination gain（BGM 淡出的独立节点链依赖此能力）。入口将 `startTime` 钳到当前时刻（过期排程最多轻微迟到、绝不齐爆），振荡器频率钳到采样率的 0.45 倍（极高音 + 八度泛音不超过奈奎斯特频率，避免折返失真）。
  - `playNoise(options)` / `playKick(options)`：噪声与鼓类（正弦频率下扫）发声。
  - `resolveInstrument(id, overrides)`：合并音色定义与临时覆盖。

### sequencer.js — 多轨 BGM 循环调度器

- **暴露全局**：`SparrowSequencer`
- **职责**：按曲谱 pattern 逐音符调度合成器，多轨并行、循环、gate 时值。
- 关键 API：
  - `play(song, options)`：开始调度。`options.startStep` 从指定 pattern 序号起播；`options.startBeat` 从指定拍位起播（各轨光标按拍定位到首个起始拍 ≥ 该拍位的事件，trackTimes 按拍差偏移，多轨保持对齐；编辑器钢琴卷帘使用此选项）；`options.fadeIn` 覆盖淡入；曲谱 `volume`/`loop` 字段生效。
  - `stop(options)`：按 `options.fadeOut` 淡出并清理定时器与 bgmGain 节点链。
  - `pause()` / `resume()`：暂停/恢复。暂停时 bgmGain 快速淡出（静音 lookahead 窗口内已排程的残留音），并把各轨光标回退到"暂停时刻尚未发声"的第一个事件（已开始发声的音符截断在暂停点，不回退）；恢复时各轨时间基准整体平移并重建 bgmGain 节点链，被静音的音符重新排程——**暂停点前后的音乐内容无丢失**，多轨相对对齐保持（即使各轨 pattern 事件密度不同）。
  - **自然结束**：非循环曲（`loop: false`）所有声部排程完毕后，调度器等最后一个已排程音符（含 release 尾音）播完再自动停止并清理定时器（淡出 0.3 秒）；结尾音符不会被 lookahead 窗口提前截断，循环曲不受影响。
- 调度机制：lookahead 定时器每 35ms 醒来一次，向前调度 0.45s 内的音符，避免 setInterval 抖动造成节拍不准。
- **停顿追赶重锚**：主线程停顿（GC / 掉帧 / 后台标签页把定时器节流到 1s+）超过 lookahead 窗口后，tick 会把所有轨的时间基准统一平移到当前音频时钟重锚——过期 `startTime` 的音符若照常排程会被 Web Audio 立即起振（积压音符挤在同一瞬间齐爆、各轨积压量不同互相错位）；重锚后音乐从停顿处的音乐位置无缝继续，**不丢音符、不齐爆、轨间相对对齐不变**（代价是停顿期间欠下的时间以静音补回）。`synth.createToneNodes` / `playNoteToGain` 另有过期 `startTime` 钳制兜底（迟到但不爆）。
- BGM 使用独立 gain 节点链（不经全局 music 总线音量），因此切歌淡出互不影响。

### sfx-player.js — 短音效播放器

- **暴露全局**：`SparrowSfxPlayer`
- **职责**：`play(definition)` 接受单个事件或事件数组，按 `delay` 时间轴调度发声，固定输出 sfx 总线。`type` 支持 `tone`（音符）/ `noise`（噪声）/ `kick`（正弦频率下扫）。
- 音效数据来自 `instruments/sfx-library.js`，经 `SparrowMusicManager.playSfx(id)` 调用。

### midi-parser.js — MIDI 实时转换

- **暴露全局**：`SparrowMidiParser`
- **职责**：把 .mid 文件字节（Uint8Array，SMF format 0/1；format 2 的顺序式轨被按同时播放近似并给出警告）实时解析为引擎曲谱对象，失败返回 null。解析在播放前瞬间完成（典型文件几毫秒），产物对 Sequencer 完全透明。
- 关键 API：`parse(bytes, options)`，`options`：`{ id, name, loop, volume, fadeIn }`。
- 转换规则：
  - 每条 MIDI 轨内按 (音色, 是否打击乐) 合并通道 → 一条内部音轨（同轨同音色的多通道和弦声部并回一组，携带 `sourceTrack` 来源轨标记，编辑器据此按轨合并，自家文件往返不增轨）；同组内重叠音符自动拆分声部（和弦保真）。
  - 所有声部尾部补 REST 对齐全曲长度（最晚结束时刻）：调度器各轨按各自 pattern 总长循环，对齐后循环播放不失步。
  - GM 音色映射：精确编号优先、未命中按 GM 家族区间映射到 17 种内置合成音色（对照表见 instruments/README.md）；通道 10（索引 9，打击乐）固定 chip8。
  - 延音踏板（CC64）生效：踏板期间的 Note Off 缓存挂起，抬踏板时统一延长到该时刻。
  - velocity（0-127）→ 逐音符音量覆盖参数。
  - Track Name 元事件（0x03）读为音轨名（UTF-8），随曲谱对象返回（编辑器导入时回显轨名）；其他文本元事件忽略。
  - 速度取第一个 SetTempo 元事件（缺省 120）；中途变速与弯音/其他 CC 表现事件被忽略。
  - 拍号取第一个时间签名元事件（0x58，分母折算为四分音符拍数，缺省 4）；小节数优先读本编辑器写入的 Sequencer-Specific 曲长标记（0x7F，"SPW" 魔数 + 16 位小节数），无标记按真实拍数推断，产出 `beatsPerBar`/`bars` 小节元信息（与编辑器 `applySong` 消费的字段同名）。
  - 系统实时消息（0xF8-0xFE，如 active sensing / MIDI clock）与 0xF1/0xF2/0xF3 按规范字节长跳过，不影响 running status；含此类消息的文件（DAW/硬件导出常见）解析不错位。

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

游戏接入时按 `audio-core → note-parser → instruments/instruments → synth → sequencer → sfx-player → midi-parser（可选） → audio-manager → instruments/sfx-library（可选音效数据）` 顺序引入。

## 数据流

```text
曲谱数据（music-sheets/ 的 .mid 实时解析，或编辑器构建）
  → MusicManager.playBgm(id) 查 SparrowMusicLibrary
  → Sequencer 按 pattern 逐音符调度（gate 控制发声占时值比例）
  → Synth.noteToFrequency 算频率 → createToneNodes 发声
  → BGM gain → music 总线 → master → destination
```
