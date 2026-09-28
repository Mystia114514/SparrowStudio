[English](README.en.md) | [简体中文](README.md)

# SparrowStudio (Sparrow Music Studio)

**Current version**: v1.0.0 · full changelog in [CHANGELOG.md](CHANGELOG.md)

> **Note**: This engine was developed with AI-assisted programming.
>
> **Recommended use cases**: ① personal websites deployed on low-bandwidth servers; ② websites served through CDN/ESA or similar content delivery services with limited available traffic; ③ websites that, for any other reason, cannot serve audio files directly. How it works: music is stored as a few-KB .mid score and synthesized live by the browser, instead of shipping multi-MB audio files — saving significant bandwidth and traffic.

A pure-code Web Audio music studio: built-in synthesis engine, a visual MIDI editor (Sparrow MIDI Editor), and a sample score library. Zero dependencies — drop in the files and it just works. This folder does not affect the original game automatically; it only takes effect after you manually include the scripts in your page and call `SparrowMusicManager`.

> **Naming**: The project/studio is named **SparrowStudio**; the engine code namespaces are aligned with it and all use the `Sparrow` prefix (`SparrowCore`, `SparrowSynth`, `SparrowMusicManager`, etc.). They refer to the same system.

> **Just want to get the engine running quickly?** → See **[QUICKSTART.en.md](QUICKSTART.en.md)** (quick-start tutorial: include `core/` + `instruments/` in order, load and play via `SparrowMusicManager`).

## Folder Structure & Roles

The project is split into 4 layer folders plus 1 tools folder. **This README only describes each folder's role; for a file-by-file breakdown of every folder, see the `README.md` inside that folder (Chinese)**:

| Folder | Layer | Purpose |
|---|---|---|
| [`core/`](core/README.md) | Foundation layer | The engine itself: AudioContext with a master/music/sfx three-bus mixer, note parsing, synthesizer (17 instrument timbres), multi-track looping BGM scheduler, short SFX playback, real-time MIDI parsing, and the unified facade `SparrowMusicManager`. |
| [`instruments/`](instruments/README.md) | Timbre layer | Pure data layer for sound definitions: `instruments.js` defines the 17 built-in instrument timbres, `sfx-library.js` defines 16 built-in game sound effects. No logic code. |
| [`editor/`](editor/README.md) | Editor layer | Visual MIDI editor (Sparrow MIDI Editor): double-click `music-editor.html` to use it (works over file://). Compose in a piano roll, audition, open/save standard .mid. Not used in-game. |
| [`music-sheets/`](music-sheets/README.md) | Score layer | Storage for .mid scores (includes 1 sample song — a Touhou Project fan arrangement), loaded and played at runtime via `fetch` + `loadMidi`. |

## Integrating Into Your Game

> Can't follow the integration steps below? **Then let an AI read them for you** — paste this README (or [QUICKSTART.en.md](QUICKSTART.en.md)) into any AI assistant and have it integrate the engine for you, following the docs.

Copy the `core/` and `instruments/` folders into your project and include the 9 scripts in dependency order (the order *is* the dependency order — don't shuffle it; the editor folder `editor/` is not needed):

```html
<script src="core/audio-core.js"></script>
<script src="core/note-parser.js"></script>
<script src="instruments/instruments.js"></script>
<script src="core/synth.js"></script>
<script src="core/sequencer.js"></script>
<script src="core/sfx-player.js"></script>
<script src="core/midi-parser.js"></script>
<script src="core/audio-manager.js"></script>
<script src="instruments/sfx-library.js"></script> <!-- optional: built-in SFX data -->
```

Once included you have the complete engine, driven through a single facade: `fetch` the score + `SparrowMusicManager.loadMidi(id, buffer)` to register, `playBgm(id)` to play, `playSfx("coin")` for sound effects — see `QUICKSTART.en.md` for details.

For each script's responsibilities and dependency relations, see the file-by-file breakdowns in `core/README.md` and `instruments/README.md` (Chinese).

### Playing MIDI Scores (Recommended Workflow)

Compose a song in the editor → "Save MIDI" produces `xxx.mid` → drop it into `music-sheets/` → load it at runtime in your game:

```js
const buffer = await (await fetch("music-sheets/xxx.mid")).arrayBuffer();
SparrowMusicManager.loadMidi("xxx", buffer); // options: { name, loop, volume, fadeIn }; volume defaults to 2.5
await SparrowMusicManager.unlock();
SparrowMusicManager.playBgm("xxx");
```

Conversion happens in milliseconds right before playback and is transparent to the scheduler. Conversion rules: GM programs map to the 17 built-in timbres by exact number first, then by family ranges; velocity becomes per-note volume; chords are automatically split into voice tracks; tempo changes mid-song and pitch bend/CC are ignored — see `core/README.md` (Chinese) for details.

Note: `fetch`-ing .mid requires HTTP (browsers block it over file://). For local file:// scenarios, use the editor's "Open MIDI" (打开 MIDI) button to load .mid files (FileReader is not restricted).

## Basic Usage

Browsers usually require user interaction before any sound can play, so the recommended pattern is inside a button click handler:

```js
await SparrowMusicManager.unlock();
SparrowMusicManager.playBgm("mySong");
```

Playing sound effects (16 built-in common SFX, callable directly; see instruments/README.md):

```js
SparrowMusicManager.playSfx("click");
```

Controlling volume:

```js
SparrowMusicManager.setMasterVolume(0.7);
SparrowMusicManager.setMusicVolume(0.6);
SparrowMusicManager.setSfxVolume(0.8);
SparrowMusicManager.setMuted(true);
```

Pause menus can duck (temporarily lower) the BGM volume:

```js
SparrowMusicManager.setDucked(true);
SparrowMusicManager.setDucked(false);
```

## Score Format

The engine **only speaks MIDI**: scores are always provided as standard .mid files (produced by the editor's "Save MIDI", or from any MIDI source) and converted into an internal object in real time by `loadMidi` before playback. The internal object structure is generated and maintained automatically by the editor and the parser — it is transparent to users and never hand-written (the old hand-written JS score objects/files are deprecated).

## Built-in Instruments

Defined in `DEFAULT_INSTRUMENTS` inside `instruments/instruments.js` — **17** in total:

- **Basics**: `piano` / `violin` / `tuba` / `trumpet` / `chip8` (retro 8-bit)
- **Extended**: `epiano` (electric piano) / `musicbox` / `organ` / `guitar` / `bass` / `strings` / `choir` / `brass` / `sax` / `flute` / `harp` / `synthPad`

During MIDI parsing, all 128 GM program numbers are mapped onto these timbres via family ranges (exact program numbers take priority) — see `instruments/README.md` (Chinese) for the mapping table.

You can register your own timbre:

```js
SparrowSynth.registerInstrument("myLead", {
    wave: "triangle",
    volume: 0.05,
    attack: 0.02,
    release: 0.18,
    filter: 1600
});
```

## Current Status

A modular draft, split by single responsibility:

- Audio core (audio-core) and note parsing (note-parser)
- Pure-code synthesizer (synth) + default timbre library (instruments)
- Multi-track looping BGM scheduler (sequencer) + SFX playback (sfx-player)
- Unified manager (audio-manager) + real-time MIDI conversion (midi-parser)
- Piano-roll visual MIDI editor (music-editor.html + editor/ modules; open/save standard .mid, undo/redo)

Scores are provided uniformly as .mid files (made in the editor or imported from outside). 16 built-in game sound effects (`instruments/sfx-library.js`). Both engine and editor are feature-complete. Not yet integrated into the original game files.

## Changelog (Abridged)

> The complete, detailed changelog (Chinese) is in [CHANGELOG.md](CHANGELOG.md). Only the latest entry is translated in full below.

### 2026-09-20

- **Fixed final notes of non-looping songs being cut off**: natural-end detection fired the instant the last note entered the 0.45 s lookahead window, and the sequencer immediately faded out (0.3 s) and tore down the node chain (0.35 s) — anything inside the window that hadn't sounded yet was guaranteed to be swallowed. The sequencer now records the latest note-end time (including release) and **waits for the ending to actually finish playing before fading out and cleaning up** (offline simulation: stop time of a 4-note song +1.61 s → +2.49 s; final note intact).
- **Fixed short-note envelopes not conforming to note duration**: when a note's duration was shorter than attack+decay, envelope stages were not compressed — attack peaked after the note had ended and release only started at the end of attack+decay (slow-attack timbres like strings/choir/synthPad smeared a single 16th note across the following 3–4 notes); timbres with short release (bass) even produced out-of-order automation events and end-of-note level jumps (clicks). attack/decay are now **compressed proportionally to note duration**, and release always starts exactly at noteEnd, keeping automation strictly monotonic (long notes unchanged).
- **Fixed gate 0 being treated as "unset"**: with `track.gate: 0`, the sounded duration became 0 and was then treated by downstream `|| 0.25` as a missing value, playing 0.25 s notes instead; invalid gate values (0/negative/non-numeric) now uniformly fall back to 0.88, and a `playTone` duration of 0 is treated as the shortest possible note (0.01 s) rather than the 0.25 s default.
- **Fixed option-carrying playBgm being swallowed by same-id idempotency**: calling `playBgm` with options like `startBeat`/`volume`/`loop` while the same id was playing was silently ignored; now only **bare (argument-less) calls** stay idempotent (game-loop re-calls don't restart), while option-carrying calls are treated as explicit playback intent and take effect.
- **Fixed inconsistent beat↔second conversion (latent)**: `startBeat` seeking and `pause` cursor rewinding computed beat seconds from `song.tempo` while `scheduleTrack` preferred `track.tempo` — songs with per-track tempo had inconsistent beat lengths across code paths; unified into the single `beatSeconds(track, song)` entry point.
- **Empty scores self-stop (defensive)**: with `tracks: []`, the "all voices finished" test was always false and the timer spun forever; empty scores now stop naturally on the first tick.
- **Hardened unlock**: a browser-rejected `ctx.resume()` (missing user gesture) is now caught and returns false instead of producing an unhandled rejection; the silent unlock oscillator plays at most once per session and cleans itself up.
- **Fixed MIDI misparsing caused by system realtime messages**: 0xF8–0xFE (active sensing / MIDI clock etc., common in DAW and hardware exports) were consumed by the fallback branch as 2-data-byte events, eating the following delta — Note Offs went missing, note durations got corrupted, and the rest of the track was abandoned (in one test a 480-tick note parsed as 300 ticks); now handled per spec byte widths (0xF1/0xF3 = 1 data byte, 0xF2 = 2, 0xF8–0xFE = 0), and system realtime messages no longer clear running status.
- **Bar metadata fields aligned with the editor**: parsed `barCount/stepsPerBar` renamed to the `bars/beatsPerBar` the editor's `applySong` actually consumes (the two names previously didn't match, so the metadata was consumed by no one); `beatsPerBar` now reads the first time-signature meta event (0x58, denominator converted to quarter-note beats, default 4) and `bars` is inferred from real beat counts.
- **Scheduler bad-data guards**: `parseStep(null/undefined)` is treated as a rest (a null in a pattern previously threw a TypeError every 35 ms and stalled all later tracks); `play` safely returns false when `tracks` is missing instead of throwing.
- **Fixed NoteParser accepting only single-digit octaves**: `C10` and other multi-digit octaves previously failed silently and returned 0 (silent notes, no error); now parsed correctly (solfège notation fixed in sync).
- **Fixed playBgm restarting repeatedly in the paused state**: idempotency previously only checked `playing`, so during pause (playing=false) every game-loop call yanked the song back to its start; same-id bare calls are now idempotent in both playing and paused states, and the song can be replayed normally after finishing naturally.
- **format 2 docs aligned with behavior**: header comment now says format 0/1 — format 2's sequential tracks are parsed as simultaneous approximation, with an explicit warning at parse time.
- All fixes are covered by offline simulation probes (29 assertions: parse misalignment / pedal / loop alignment / natural end without truncation / pause-resume content preservation / bad-data robustness); `tools/test-roundtrip.js` passes.

### 2026-09-19 (evening series) — summary

- Piano-roll editor overhaul: note-event model `{pitch, start, duration, velocity}`, real musical time axis, dual-canvas rendering, drag to draw/move/resize, marquee selection, zoom, undo/redo (cap 100), clipboard, chords within one track (auto voice splitting on playback/export).
- Engine enhancements (backward compatible): `Sequencer.play` gained `startBeat`; `pause/resume` now shifts each track's time base as a whole; every voice gets its own MIDI channel on export.
- Fixes: non-looping songs no longer crash the scheduler when finished; pause/resume no longer loses ~0.45 s of lookahead content; out-of-range `startBeat` voices stay silent; synth no longer snapshots the timbre table at load time.
- Round-trip fidelity: Track Name meta events written/read (UTF-8); bar counts inferred from real beats.

### 2026-09-08 / 2026-09-09 — summary

- Project named **SparrowStudio**; all engine namespaces unified under the `Sparrow` prefix; API consolidated into the single `SparrowMusicManager` facade.
- Scores switched to .mid-only (hand-written JS scores deprecated); MIDI import/export with GM family mapping to 17 timbres, sustain pedal (CC64) support, loop alignment via tail rests, velocity → per-note volume, `Number.isFinite` volume handling (0 = mute).
- Editor capacity raised to 100 bars / 32 tracks; 16 built-in game SFX added; ducking and pause residual-sound fixes; MIDI export channel pool avoiding GM drum channel 10.

## License

The code is released under the [MIT License](LICENSE). The score in `music-sheets/` is a derivative fan work with separate terms — see [music-sheets/README.md](music-sheets/README.md) (original composition © ZUN / Team Shanghai Alice).
