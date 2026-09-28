[English](QUICKSTART.en.md) | [简体中文](QUICKSTART.md)

# Quick Start — Using the SparrowStudio Music Engine in a Web Page

This engine does one simple thing: you hand it a **.mid score**, and it performs the music live in the player's browser.

Integration takes three steps: **put the engine into your site → tell it where the scores are → start playback on a player click.**

## Step 0: Prepare three things

1. **The engine**: copy the `core/` and `instruments/` folders from this project into your site directory. They are the entire engine — there are no other dependencies;
2. **A score folder**: create a **separate folder** in your site directory just for scores (name it anything, e.g. `music-sheets/`), and put the .mid files there. Scores and the engine stay separate — adding, swapping, or removing songs later only touches this folder, never the engine;
3. **A score**: one .mid file (MIDI is a universal music format — easy to find online, and you can make your own), placed into the folder from step 2;
4. **A page reachable via a URL**: e.g. VS Code's Live Server. Double-clicking the HTML directly (file://) gets the score file blocked by the browser — that's browser security policy, not an engine problem.

> Note: the score folder's name is up to you, but the `fetch` path in Step 2 must match it.

## Step 1: "Install" the engine into the page

Add these 9 lines before `</body>` (the order is the order in which they cooperate — don't shuffle it):

```html
<script src="core/audio-core.js"></script>
<script src="core/note-parser.js"></script>
<script src="instruments/instruments.js"></script>
<script src="core/synth.js"></script>
<script src="core/sequencer.js"></script>
<script src="core/sfx-player.js"></script>
<script src="core/midi-parser.js"></script>
<script src="core/audio-manager.js"></script>
<script src="instruments/sfx-library.js"></script> <!-- built-in SFX, optional -->
```

How do you know it worked? Open the page, press F12, type `SparrowMusicManager` into the console and hit Enter — if it prints an object, the engine is in.

## Step 2: Hand the score to the engine

This can run on page load; no need to wait for the player. Imagine the engine has a **playlist** inside it — `loadMidi` puts a song into that playlist and gives it a name:

```js
fetch("music-sheets/main.mid")                        // ① fetch the .mid file's content
    .then((response) => response.arrayBuffer())       // ② it's binary — read it as raw bytes
    .then((buffer) => SparrowMusicManager.loadMidi("main", buffer, { loop: true }));
    //              └ "main" is the name you give the song; you'll call it by this name later
    //              └ { loop: true } means "start over when it finishes"; it also plays without it (loops by default)
```

If you got the path wrong, no harm done: the console prints `Sparrow: MIDI 解析失败` ("MIDI parse failed"). No warning means success.

## Step 3: Play (must happen after a player click)

Browsers have a rule: **the first sound a web page makes must be caused by some click or key press from the player** (so you don't get blasted with sound the moment a page opens). So "play" goes inside a button's click event:

```js
document.getElementById("start").onclick = async () => {
    await SparrowMusicManager.unlock();   // first, "power on the speakers" — one click unlocks it for the rest of the session
    SparrowMusicManager.playBgm("main");  // then play the song you named in Step 2
};
```

That's it — the music now loops.

## Everyday Operations

```js
// ===== Playback control =====
SparrowMusicManager.playBgm("main");   // play a song (re-calling while it's already playing won't restart it)
SparrowMusicManager.pauseBgm();        // pause (remembers the position)
SparrowMusicManager.resumeBgm();       // continue from where it paused
SparrowMusicManager.stopBgm();         // stop (position reset to zero)

// ===== Sound effects =====
// 16 ready-made SFX are built in — call them by name, no files to load:
// click hover confirm back ／ jump coin powerup levelup hurt footstep doorOpen
// ／ laser hit explosion ／ victory gameover
SparrowMusicManager.playSfx("coin");

// ===== Volume (independent channels, all 0–1, changes are remembered) =====
SparrowMusicManager.setMusicVolume(0.6);   // music volume
SparrowMusicManager.setSfxVolume(0.9);     // SFX volume
SparrowMusicManager.setMasterVolume(0.8);  // master: scales both music and SFX
SparrowMusicManager.setMuted(true);        // mute everything with one call
```

## Going Further (skip if not needed)

```js
SparrowMusicManager.setDucked(true);   // e.g. while a pause menu is open, duck the BGM automatically; false restores
SparrowMusicManager.getState();        // inspect current state: unlocked? which song? what volumes?

// Not satisfied with the built-in timbres? You can "sculpt" a new one:
// (waveform, volume, attack/decay/sustain/release, filter — provided parameters are merged over the default timbre)
SparrowSynth.registerInstrument("myLead", { wave: "triangle", volume: 0.05, attack: 0.02, release: 0.18 });
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Clicked the button, no sound | The playback code isn't inside a click event, or you forgot `await unlock()` before playing |
| Console shows fetch-related errors | You opened the page by double-clicking (file://) — serve it over HTTP instead |
| "未找到 BGM" ("BGM not found") warning | The load-time and play-time names don't match, or you tried to play before loading finished |
| Music too quiet | The default score volume of 2.5 is normal; for overall loudness call `setMasterVolume(1)` |

For details on every module, see `core/README.md` (Chinese).
