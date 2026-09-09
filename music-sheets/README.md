# music-sheets/ 曲谱文件夹详解

曲谱数据文件夹，存放**标准 MIDI 文件（.mid）**。游戏运行时通过 `SparrowMusicManager.loadMidi` 实时解析（几毫秒），解析产物注册到 `SparrowMusicLibrary` 后即可 `playBgm(id)` 播放。

> 原手写 JS 曲谱（IIFE 自注册到曲谱库）方式已**废弃**，曲谱统一使用 .mid 文件。

## 文件清单

| 文件 | 内容 |
|---|---|
| `demo.mid` | 示例曲一：120 BPM，4 小节，钢琴旋律 + chip8 低音 |
| `pixel-parade.mid` | 示例曲二《像素巡游》：100 BPM，8 小节，钢琴主旋律 + 小提琴铺底 + 大号低音 + chip8 琶音（Am-F-C-G 进行） |

## 使用流程

1. 用编辑器（`editor/music-editor.html`）作曲并"保存 MIDI"，或使用任意外部来源的 .mid 文件（DAW 导出均可）。
2. 把 `.mid` 文件放进本文件夹。
3. 游戏中加载播放：

```js
const buffer = await (await fetch("music-sheets/boss.mid")).arrayBuffer();
SparrowMusicManager.loadMidi("boss", buffer); // options 可选：{ name, loop, volume, fadeIn }，volume 缺省 2.5
await SparrowMusicManager.unlock();
SparrowMusicManager.playBgm("boss");
```

`loadMidi` 的 `options`：`{ name, loop, volume, fadeIn }`，其中 `volume` 建议保持默认 2.5（内置音色的逐音符音量较低，1 以下偏轻）。

## 转换规则（摘要，详见 core/README.md）

- 每个 (MIDI 轨, 通道, 音色) 组合 → 一条内部音轨；同轨重叠音符自动拆分声部（和弦保真）。
- GM 音色映射：精确编号优先、未命中按家族区间映射到 17 种内置合成音色；通道 10（索引 9，打击乐）固定 chip8。
- 延音踏板（CC64）生效：踏板期间的音符延长到抬踏板时刻。
- velocity（0-127）→ 逐音符音量覆盖参数。
- 速度取第一个 SetTempo 元事件（缺省 120）；中途变速与弯音表现被忽略。

## 注意

- `fetch` .mid 需 HTTP 环境（file:// 下被浏览器拦截）；本地 file:// 场景用编辑器的"打开 MIDI"按钮加载（FileReader 不受限）。
- 文件夹当前含两首示例：`demo.mid`（120 BPM，4 小节，钢琴 + chip8）与 `pixel-parade.mid`（100 BPM，8 小节《像素巡游》：钢琴主旋律 + 小提琴铺底 + 大号低音 + chip8 琶音，Am-F-C-G 进行），可按上述流程直接加载试听；新曲用编辑器制作后放入此处即可。
