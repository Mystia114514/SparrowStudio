# instruments/ 音色层详解

声音定义的纯数据层。本层不含任何逻辑代码，只定义"每种声音长什么样"，由 `core/` 的合成器消费。本层共 2 个文件，逐一详解如下。

| 文件 | 内容 |
|---|---|
| `instruments.js` | 内置乐器音色库：17 种音色的波形/包络/滤波参数 |
| `sfx-library.js` | 内置音效库：16 个游戏常用音效的事件序列 |

## instruments.js — 乐器音色库

暴露全局 `SparrowDefaultInstruments`（5 种内置音色），供 `SparrowSynth` 初始化音色表。**必须先于 `core/synth.js` 加载**。

### 音色字段详解

| 字段 | 说明 |
|---|---|
| `wave` | 基础波形：`sine` / `square` / `triangle` / `sawtooth` |
| `volume` | 该音色的基础响度（合成器包络的峰值） |
| `attack` / `decay` / `sustain` / `release` | ADSR 包络四段（秒；sustain 为 0–1 电平比例） |
| `filter` | 低通滤波器起始频率（Hz） |
| `filterEnd` | 可选，滤波器随音符推进滑向的目标频率（扫弦/拨弦感） |
| `q` | 滤波器谐振强度 |
| `detune` | 基础失谐（音分） |
| `oscillators` | 可选，多振荡器叠加数组；缺省为单振荡器 |
| `oscillators[].wave/gain/octave/detune/ratio` | 各振荡器的波形、混音比、八度偏移、失谐、频率倍率 |

### 内置音色一览（17 种）

- **基础 5 种**：`piano`（钢琴）、`violin`（小提琴）、`tuba`（大号）、`trumpet`（小号）、`chip8`（8bit 古早风格）
- **GM 兼容扩展 12 种**：`epiano`（电钢琴）、`musicbox`（八音盒/钟类）、`organ`（管风琴）、`guitar`（木吉他）、`bass`（贝斯）、`strings`（弦乐合奏）、`choir`（人声合唱）、`brass`（铜管合奏）、`sax`（萨克斯）、`flute`（长笛）、`harp`（竖琴）、`synthPad`（合成垫）

`core/midi-parser.js` 按这套音色对 GM 全部 128 个音色号做了**家族区间映射**（精确编号优先，未命中按所属乐器家族归入近似音色），因此任意 GM MIDI 文件的音色都会落到一个合理近似上，不再"全员钢琴"。

### 注册自定义音色

```js
SparrowSynth.registerInstrument("myLead", {
    wave: "triangle",
    volume: 0.05,
    attack: 0.02,
    release: 0.18,
    filter: 1600
});
```

在音轨 `instrument` 字段或音符覆盖参数中直接使用 `"myLead"`。新音色建议直接加进本文件的 `DEFAULT_INSTRUMENTS` 对象。

## sfx-library.js — 内置音效库（16 个）

`SparrowSfxLibrary` 当前由 `sfx-library.js` 填充，覆盖游戏常用场景，引入本文件后 `SparrowMusicManager.playSfx("...")` 即可直接播放：

| 分类 | 音效 ID |
|---|---|
| UI | `click`、`hover`、`confirm`、`back` |
| 角色 | `jump`、`coin`、`powerup`、`levelup`、`hurt`、`footstep`、`doorOpen` |
| 战斗 | `laser`、`hit`、`explosion` |
| 剧情 | `victory`、`gameover` |

新增音效可直接向该文件追加（也可另建数据文件并同样 `Object.assign` 进 `SparrowSfxLibrary`）：

```js
(function(global) {
    "use strict";
    global.SparrowSfxLibrary = {
        click: [
            { type: "tone", note: "C5", duration: 0.04, instrument: "chip8", volume: 0.035 },
            { type: "noise", delay: 0.04, duration: 0.05, volume: 0.02, filter: 2000 }
        ]
    };
})(window);
```

### 事件字段

| 字段 | 说明 |
|---|---|
| `type` | `tone`（音符）/ `noise`（噪声）/ `kick`（鼓） |
| `delay` | 相对播放时刻的延迟（秒），默认 0 |
| `duration` | 持续时间（秒） |
| `note` / `freq` | tone 类型：音名或直接频率 |
| `volume` | 响度 |
| `instrument` | tone 类型使用的音色（默认 `chip8`） |
| `filter` / `filterType` | 滤波频率与类型（noise 默认 highpass） |
| `from` / `to` | kick 类型的频率下扫起止（Hz） |

在页面中引入后，`SparrowMusicManager.playSfx("click")` 即可播放。
