# 快速调用教程 —— 在网页里使用 SparrowStudio 音乐引擎

这个引擎做的事情很简单：你交给它一首 **.mid 曲谱**，它就在玩家的浏览器里现场把音乐"演奏"出来。

接入一共三步：**把引擎放进网站 → 告诉它曲谱在哪 → 用户点击时开始播放**。

## 第 0 步：准备三样东西

1. **引擎**：把项目里的 `core/` 和 `instruments/` 两个文件夹复制到你的网站目录。它们就是引擎的全部，没有任何其他依赖；
2. **曲谱文件夹**：在网站目录里**单独新建一个文件夹**专门放曲谱（名字随意，比如 `music-sheets/`），把 .mid 文件放进去。曲谱和引擎分开存放——以后加曲、换曲、删曲都只动这个文件夹，引擎一概不用碰；
3. **曲谱**：一首 .mid 文件（MIDI 是通用的音乐文件格式，网上到处能找到，也能自己做），放进刚才的曲谱文件夹；
4. **能通过网址访问的页面**：比如用 VS Code 的 Live Server 打开。直接双击 HTML（file:// 方式）时浏览器会拦截曲谱文件，这是浏览器的安全规则，不是引擎的问题。

> 注意：曲谱文件夹的名字可以随意取，但第 2 步代码里 `fetch` 的路径必须和它一致。

## 第 1 步：把引擎"装"进页面

在 HTML 的 `</body>` 前面加上这 9 行（顺序就是它们互相配合的顺序，别打乱）：

```html
<script src="core/audio-core.js"></script>
<script src="core/note-parser.js"></script>
<script src="instruments/instruments.js"></script>
<script src="core/synth.js"></script>
<script src="core/sequencer.js"></script>
<script src="core/sfx-player.js"></script>
<script src="core/midi-parser.js"></script>
<script src="core/audio-manager.js"></script>
<script src="instruments/sfx-library.js"></script> <!-- 内置音效，可省 -->
```

装完怎么确认？打开网页按 F12，在控制台输入 `SparrowMusicManager` 回车，能显示一个对象就说明成功了。

## 第 2 步：把曲谱交给引擎

页面加载时就可以做，不用等玩家操作。想象引擎肚子里有个**歌单**，`loadMidi` 就是把一首歌放进去、并给它起个名字：

```js
fetch("music-sheets/main.mid")                        // ① 把 .mid 文件的内容取回来
    .then((response) => response.arrayBuffer())       // ② 它是二进制文件，要按原始字节读
    .then((buffer) => SparrowMusicManager.loadMidi("main", buffer, { loop: true }));
    //              └ "main" 是你给这首歌起的名字，后面播放就喊这个名字
    //              └ { loop: true } 表示播完从头再播；不写也能播（默认就循环）
```

放错了也没关系：控制台会出现 `Sparrow: MIDI 解析失败` 的警告，没有警告就是成功了。

## 第 3 步：播放（必须发生在玩家点击之后）

浏览器有个规矩：**网页第一次出声，必须由玩家的某次点击或按键引起**（防止你一打开网页就被声音吓到）。所以"播放"要写在一个按钮的点击事件里：

```js
document.getElementById("start").onclick = async () => {
    await SparrowMusicManager.unlock();   // 先"打开音响电源"——只要玩家点过一次，之后就一直有效
    SparrowMusicManager.playBgm("main");  // 再播放第 2 步起好名字的那首歌
};
```

就这么多，音乐已经能循环播放了。

## 日常会用到的操作

```js
// ===== 播放控制 =====
SparrowMusicManager.playBgm("main");   // 播放某首歌（正在播同一首时不会打断重来）
SparrowMusicManager.pauseBgm();        // 暂停（记住进度）
SparrowMusicManager.resumeBgm();       // 从暂停的地方继续
SparrowMusicManager.stopBgm();         // 停止（进度清零）

// ===== 音效 =====
// 内置了 16 个现成音效，直接喊名字就用，不需要加载任何文件：
// click hover confirm back ／ jump coin powerup levelup hurt footstep doorOpen
// ／ laser hit explosion ／ victory gameover
SparrowMusicManager.playSfx("coin");

// ===== 音量（各管各的，范围都是 0–1，改过会自动记住）=====
SparrowMusicManager.setMusicVolume(0.6);   // 音乐的音量
SparrowMusicManager.setSfxVolume(0.9);     // 音效的音量
SparrowMusicManager.setMasterVolume(0.8);  // 总开关：同时压低音乐和音效
SparrowMusicManager.setMuted(true);        // 一键全部静音
```

## 再进一步（用不到可以跳过）

```js
SparrowMusicManager.setDucked(true);   // 打开暂停菜单时，让背景音乐自动变小声，false 恢复
SparrowMusicManager.getState();        // 查看当前状态：有没有解锁、正在播哪首、各音量是多少

// 觉得内置音色不够听？可以自己"捏"一个新音色：
// （波形、音量、起音/衰减/延音/释放、滤波器，写好的参数会覆盖到默认音色上）
SparrowSynth.registerInstrument("myLead", { wave: "triangle", volume: 0.05, attack: 0.02, release: 0.18 });
```

## 出问题了？对号入座

| 现象 | 原因和解决 |
|---|---|
| 点了按钮没声音 | 播放代码没写在点击事件里，或者点击后忘了先 `await unlock()` |
| 控制台报 fetch 相关错误 | 是用双击方式（file://）打开的——换成通过服务器访问 |
| 提示"未找到 BGM" | 加载和播放时用的名字对不上，或者歌还没加载完就想播 |
| 音乐太小声 | 曲谱音量默认 2.5 是正常值；想整体更响就调 `setMasterVolume(1)` |

想深入了解每个模块的细节，看 `core/README.md`。
