# SparrowStudio（雀音乐工作室）

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
| [`music-sheets/`](music-sheets/README.md) | 曲谱层 | .mid 曲谱存放处（含 1 首示例曲），游戏运行时经 `fetch` + `loadMidi` 实时加载播放。 |

## 接入游戏的引入方式

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

### 2026-09-20

- **修复非循环曲结尾音符被吞**：自然结束的检测发生在"最后一个音符刚排程进 lookahead（0.45s）窗口"的瞬间，此前立即以 0.3 秒淡出 + 0.35 秒断链收尾，窗口内未发声的内容必然被吞——末音被截断、0.4 秒 release 尾音全丢，短末音（约 0.15s 以内）整颗静音。现在调度器记录最晚音符结束时刻（含 release），**等结尾真正播完后再淡出清理**（离线仿真：4 音曲 stop 时刻 +1.61s → +2.49s，末音完整）。
- **修复短音符包络不按时值收敛**：音符时值小于 attack+decay 时包络阶段不压缩——attack 在音符结束后才爬到全音量、release 从 attack+decay 末尾才起（慢起音音色 strings/choir/synthPad 的 16 分音符单音拖 0.65s，糊过后续 3-4 个音）；release 较短的音色（bass）事件时间还会乱序，结尾电平跳变出咔哒声。现在 attack/decay **按音符时值等比压缩**，release 始终从 noteEnd 精确起振，automation 事件严格单调（长音符行为不变）。
- **修复 gate 0 被当缺省**：`track.gate: 0` 时发声时长归零、被下游 `|| 0.25` 当成缺省值反发 0.25 秒的音；现在 gate 非法（0/负数/非数值）统一回退 0.88，`playTone` 的 duration 0 视为最短音（0.01s）而非缺省 0.25s。
- **修复 playBgm 带选项被同 id 判定吞掉**：同 id 播放中带 `startBeat`/`volume`/`loop` 等选项调用 `playBgm` 会被静默忽略；现在仅**无参调用**保持幂等（游戏循环重复调用不重启），带选项视为明确的播放意图照常生效。
- **修复拍秒换算基准不一致（潜伏）**：`startBeat` 定位与 `pause` 光标回退按 `song.tempo` 算拍秒，`scheduleTrack` 却优先 `track.tempo`——带轨 tempo 的曲子会各处节拍长度不一致导致错位；统一为 `beatSeconds(track, song)` 单一入口。
- **空曲谱自停（防御）**：`tracks: []` 时"全部播完"判定此前永假、定时器空转不清理；现空曲谱首个 tick 即自然停止。
- **加固 unlock**：`ctx.resume()` 被浏览器拒绝（缺少用户手势）时捕获并返回 false，不再产生 unhandled rejection；解锁静音 osc 每会话只播一次并在结束后自清理。
- **修复系统实时消息导致 MIDI 解析错位**：0xF8-0xFE（active sensing / MIDI clock 等，DAW 与硬件导出常见）此前被兜底分支当 2 数据字节事件消费，吞掉后续 delta——Note Off 丢失、音符时值错乱、整轨剩余部分被放弃（实测 480 tick 音符被解析成 300 tick）；现在按规范字节长处理（0xF1/0xF3 为 1 数据字节、0xF2 为 2、0xF8-0xFE 为 0），且系统实时消息不再清除 running status。
- **小节元信息字段与编辑器对齐**：解析产物的 `barCount/stepsPerBar` 改为编辑器 `applySong` 实际消费的 `bars/beatsPerBar`（此前两套名字对不上，元信息实际无人消费）；`beatsPerBar` 现读取第一个拍号元事件（0x58，分母折算四分音符拍数，缺省 4），`bars` 按真实拍数推断。
- **调度器坏数据防护**：`parseStep(null/undefined)` 按休止符处理（此前 pattern 混入 null 会让 tick 每 35ms 抛一次 TypeError 且停摆后续轨）；`play` 缺 `tracks` 字段安全返回 false，不再抛 TypeError。
- **修复 NoteParser 八度只认单个数字**：`C10` 等多位八度此前静默解析失败返回 0（哑音不报错），现在正确解析（唱名记法同步修正）。
- **修复 playBgm 暂停态被反复重启**：幂等保护此前只看 `playing`，暂停态（playing=false）下游戏循环每帧调用会把曲子反复拉回开头；现在同 id 无参调用在播放中与暂停中都保持幂等，曲子自然播完后照常可重新播放。
- **format 2 文档与行为对齐**：头部注释改为 format 0/1——format 2 的顺序式轨被按同时播放近似解析，现于解析时给出明确警告。
- 以上修复经离线仿真探针全量回归（29 项断言：解析错位/踏板/循环对齐/自然结束不剪尾/pause-resume 不丢内容/坏数据健壮性），`tools/test-roundtrip.js` 全过。

### 2026-09-19（晚 11）

- **修复非循环曲播完时调度器崩溃**：`loop: false` 的曲子播到结尾后，调度器每 35ms 对越界的 pattern 事件抛一次 TypeError（直到手动 stop）。现在该轨播完即标记结束，**全部声部播完后调度器自然停止并清理定时器**（淡出 0.3 秒，等效手动 stop）。
- **修复暂停/恢复丢失约 0.45 秒音乐内容**：暂停时被静音的 lookahead 预排音符此前会被跳过，恢复后音乐前跳一截。现在暂停时把各轨光标回退到暂停时刻尚未发声的第一个事件、恢复时重新排程（并新建 bgmGain 节点链防止残留音重叠）——暂停点前后内容无丢失。
- **修复 startBeat 超出音轨长度时该轨末音在起播瞬间立即发声**：越界声部现在保持静音。
- **加固合成器音色表加载顺序**：`SparrowSynth` 不再在脚本加载瞬间快照默认音色表（此前 `instruments.js` 晚于 `synth.js` 加载会导致所有音符静默退化为默认正弦），改为解析时延迟查找 + piano 回退。
- **小节元信息推断修正**：MIDI 解析的 `stepsPerBar/barCount` 改为按真实拍数推断（此前按 pattern 事件条数，与曲长无关）；顺带删除调度器与解析器中两处未使用的局部变量。

### 2026-09-19（晚 10）

- **撤回合并版，接入方式回归并固定为散装引入**：删除 `dist/sparrow.js` 与 `tools/build.js`（及合并版测试页），项目回到 `core/` + `instruments/` 两个文件夹 + 按依赖顺序 9 个 script 标签的唯一接入方式（`all.js` 加载器不恢复）。理由：双轨并行（合并版/散装）带来的目录、文档与心智模型混乱大于其收益；SPA 场景的动态注入需求如未来出现，再评估异步加载方案。

### 2026-09-19（晚 9）

- **引擎合并版发布**：新增 `tools/build.js` 构建脚本（扫描登记校验 + IIFE 格式校验 + 按依赖序拼接），生成单文件产物 `dist/sparrow.js`（64 KB，9 个模块）；接入从"9 个 script 标签"或 `all.js` 加载器简化为真正的一行，且静态/defer/动态注入/SPA 全部安全（不再有 `document.write` 的解析期限制）。`core/all.js` 加载器删除，由合并版取代；QUICKSTART/README 接入说明同步改写。**改引擎源码后须运行 `node tools/build.js` 重新构建。**

### 2026-09-19（晚 8）

- **清理死代码与过时文案**：删除调度器中只写不读的 `nextStepTime` / `currentSongId` 遗留字段；删除样式表中旧步进网格遗留的 `--cell-border` / `--cell-bar` 设计令牌；修正根 README 中"GM 音色映射到 5 种内置音色"的过时描述（现为 17 种）。

### 2026-09-19（晚 7）

- **复制音轨/删除音轨按钮移至左侧控制面板**：与清空/打开/保存并列在按钮区，音轨标签条只保留切换功能；按钮 tooltip 注明"当前音轨在右侧标签条中切换"。

### 2026-09-19（晚 6）

- **新增"删除音轨"按钮**：音轨标签条上与"复制音轨"并列；先切换标签选中要删的音轨再点击，二次确认后删除（弹窗显示轨名与音符数），至少保留一条；删除为结构性变更，会同步音轨数量输入框并清空撤销历史（不可撤销，弹窗中已提示）。

### 2026-09-19（晚 5）

- **播放器式走带控制**：原"播放/暂停/从头开始/停止"四按钮整合为 ⏮/▶⏸/⏹ 三键走带（▶⏸ 单键随状态切换图标），新增**可拖动进度条**与 `m:ss / m:ss` 时间显示——拖动中预览播放头位置，播放中松手从该拍跳播，停止状态定位后下次播放从该处开始；空格键播放/暂停行为不变。

### 2026-09-19（晚 4）

- **控制面板移至页面左侧**：参数/按钮区改为左栏固定宽度（独立滚动），编辑区占满右侧全部空间；窄屏（≤900px）自动回退为顶部横排布局。

### 2026-09-19（晚 3）

- **右键/中键拖动平移画面**：卷帘画布支持按住右键（或中键）拖动平移（水平+垂直），查看曲谱后半部分不再依赖滚轮；右键原地点击音符仍为删除（以 4px 拖动阈值区分）。
- **音符属性并入音轨属性行**：选中音符的音名/起点/时长/力度输入框移至音轨名/音色/gate 同行右侧（分隔线隔开），编辑器纵向空间更紧凑。

### 2026-09-19（晚 2）

- **移除控制面板中 MIDI 不支持的参数**：删除"音量 / 淡入秒数 / 循环播放"三个输入项（均不会写入 .mid）。编辑器内播放使用引擎默认值（音量 2.5、淡入 0.35s、循环开）；游戏侧需要控制时经 `SparrowMusicManager.loadMidi` 的 `{ volume, loop }` 选项（能力未变，只是不再出现在编辑器面板）。

### 2026-09-19（晚）

- **编辑器升级为钢琴卷帘（piano roll）范式**：数据模型从"步进格子"换成音符事件 `{音高, 起点, 时值, 力度}`，时间轴为真实音乐时间（行 = 音高、列 = 拍）。画布为双层 Canvas（网格+音符 / 播放头+框选），支持：左键拖动画音符、拖动移动、拖右缘改时值、右键删除、Shift 框选/加选、滚轮滚动、Ctrl+滚轮缩放、点击琴键试听、点击小节标尺跳播、音符属性条精确键入。
- **同轨和弦**：一条音轨允许多音符叠放，播放/导出时自动拆声部（携带 editorTrack 标记，构建过的曲谱往返不增轨）；每轨单声部的旧约束解除。
- **撤销/重做与剪贴板**：音符差量命令栈（上限 100），Ctrl+Z/Y、Ctrl+C/V（粘贴到最近点击拍位）、Ctrl+A、Delete、Esc、空格播放/暂停。
- **引擎配套增强（向后兼容）**：`Sequencer.play` 新增 `startBeat` 选项（按拍起播，各轨光标定位保持对齐，编辑器从任意小节跳播使用）；`pause/resume` 改为整体平移各轨时间基准（修复各轨 pattern 事件密度不同时恢复错位）；保存 MIDI 时每个声部独立通道（消除同音 Note On/Off 碰撞）。
- **修复外来 MIDI 导入的三类问题**（以 `おてんば恋娘` 实测）：音符不再按"事件序号"落格导致的开头堆叠显示；曲长不再按"事件数×1 拍"填充膨胀（实测 2011 拍 → 400 拍）；导入时按真实拍数推断小节数，超出 100 小节容量的音符丢弃并在状态栏提示。
- 保存 MIDI 改为直接从音符事件序列化（无需 REST 拼装），写入 Track Name 元事件；回归测试重写（tools/test-roundtrip.js：声部拆分/回并、MIDI 往返、撤销重做、startBeat 光标定位）。

### 2026-09-19

- **编辑器操作性改进**：音轨表头新增拖拽把手（⠿），拖到另一条音轨表头即可整条复制（非空目标先弹确认）；音轨列宽改为自适应（轨道少时均分撑满、多时横向滚动）；音色/节拍/力度/gate 全部支持悬停滚轮快速调节（Shift+滚轮大步长）；音色下拉标注中文名（如 `piano · 钢琴`）。
- **修复导出丢音**：编辑器 `noteNameToMidi` 的音名语法与引擎 `SparrowNoteParser` 对齐（此前只认单升降号字母音名，网格里能发声的 `Do5`、`C##4` 等写法保存 MIDI 时会被静默跳过）；仍无法识别的音名（拼写错误、超出 MIDI 音域）保存时在状态栏明确提示清单。
- **修复播放头与音频循环错位**：播放头循环周期改为与 `buildSong` 的循环对齐目标一致（各音轨节拍总和的最大值）；此前只按音轨 0 计算，其他轨更长时播放头比声音提前绕回。
- **暂停改为引擎真暂停**：编辑器暂停/恢复改走 `SparrowSequencer.pause/resume`（保留调度光标，恢复时淡入回目标音量），不再用停止 + 从步重播模拟；暂停期间若编辑了曲谱，恢复时自动退回重建重播（快照比对）。
- **音轨名往返保留**：保存 MIDI 时各轨写入 Track Name 元事件（UTF-8），解析器读回为音轨名（编辑器导入时回显，不再一律变回"音轨 N"）。
- **清理过期文案**：编辑器"淡入秒数"提示中"仅 JS 导出有效"更正为"仅编辑器内播放有效"（JS 导出功能已于 2026-09-09 移除）。
- 新增回归验证脚本 `tools/test-roundtrip.js`（Node 环境跑 buildMidi → SparrowMidiParser → applySong 全链路往返）。

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
