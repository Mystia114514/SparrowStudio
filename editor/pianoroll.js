/**
 * Sparrow Editor - pianoroll（钢琴卷帘画布）
 * 行 = 音高（C0..B7 可滚动），列 = 拍。当前轨可编辑，其他轨画灰色幽灵音符。
 * 双层 canvas：main（网格+音符，状态变化重绘）+ overlay（播放头/框选，动画帧重绘）。
 *
 * 交互：
 * - 左键空白拖动 = 画音符（时长随拖动变化，松开试听）
 * - 左键音符拖动 = 移动（横向吸附 snap，纵向半音）；拖音符右缘 = 改时值
 * - 右键拖动 / 中键拖动 = 平移画面（水平+垂直）；右键原地点击音符 = 删除
 * - Shift+左键空白拖动 = 框选；Shift+点击 = 加选/减选
 * - 滚轮 = 纵向滚动音高，Shift+滚轮 / 触控板横向 = 时间滚动，Ctrl+滚轮 = 缩放
 * - 点击左侧琴键 = 试听；点击顶部小节标尺 = 从该处播放
 */

const ROLL = {
    KEY_W: 56,          // 左侧琴键列宽
    HEADER_H: 24,       // 顶部小节标尺高
    ROW_H: 14,          // 每半音行高
    PITCH_MIN: 12,      // 可见音高范围 C0..B7
    PITCH_MAX: 107,
    pxPerBeat: 40,
    MIN_PX: 8,
    MAX_PX: 240,
    scrollX: 0,
    scrollY: 0,
    drag: null,         // 当前拖拽会话
    inited: false
};

const BLACK_KEYS = [1, 3, 6, 8, 10];

function isBlackKey(pitch) {
    return BLACK_KEYS.includes(((pitch % 12) + 12) % 12);
}

/* ===== 坐标换算 ===== */
function rollBeatToX(beat) {
    return ROLL.KEY_W + beat * ROLL.pxPerBeat - ROLL.scrollX;
}

function rollXToBeat(x) {
    return (x - ROLL.KEY_W + ROLL.scrollX) / ROLL.pxPerBeat;
}

function rollPitchToY(pitch) {
    return ROLL.HEADER_H + (ROLL.PITCH_MAX - pitch) * ROLL.ROW_H - ROLL.scrollY;
}

function rollYToPitch(y) {
    return ROLL.PITCH_MAX - Math.floor((y - ROLL.HEADER_H + ROLL.scrollY) / ROLL.ROW_H);
}

function rollMaxScrollX() {
    const visible = els.rollWrap.clientWidth - ROLL.KEY_W;
    return Math.max(0, getTotalBeats() * ROLL.pxPerBeat + 120 - visible);
}

function rollMaxScrollY() {
    const visible = els.rollWrap.clientHeight - ROLL.HEADER_H;
    return Math.max(0, (ROLL.PITCH_MAX - ROLL.PITCH_MIN + 1) * ROLL.ROW_H - visible);
}

function clampScroll() {
    ROLL.scrollX = Math.max(0, Math.min(rollMaxScrollX(), ROLL.scrollX));
    ROLL.scrollY = Math.max(0, Math.min(rollMaxScrollY(), ROLL.scrollY));
}

/* ===== 初始化与尺寸 ===== */
function initRoll() {
    if (ROLL.inited) return;
    ROLL.inited = true;
    /* 初始滚动：让 C4~C5 区域居中可见 */
    ROLL.scrollY = (ROLL.PITCH_MAX - 78) * ROLL.ROW_H;
    bindRollEvents();
    window.addEventListener("resize", resizeRoll);
    resizeRoll();
    overlayLoop();
}

function resizeRoll() {
    const wrap = els.rollWrap;
    const dpr = window.devicePixelRatio || 1;
    [els.rollMain, els.rollOverlay].forEach((c) => {
        c.width = Math.max(1, Math.floor(wrap.clientWidth * dpr));
        c.height = Math.max(1, Math.floor(wrap.clientHeight * dpr));
        c.style.width = wrap.clientWidth + "px";
        c.style.height = wrap.clientHeight + "px";
        c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    clampScroll();
    drawRoll();
    drawOverlay();
}

/* ===== 绘制：主层 ===== */
function drawRoll() {
    const ctx = els.rollMain.getContext("2d");
    const w = els.rollWrap.clientWidth;
    const h = els.rollWrap.clientHeight;
    ctx.clearRect(0, 0, w, h);

    /* 音高行底色 */
    const topPitch = rollYToPitch(ROLL.HEADER_H);
    const bottomPitch = rollYToPitch(h);
    for (let p = Math.max(0, bottomPitch); p <= Math.min(127, topPitch); p++) {
        const y = rollPitchToY(p);
        ctx.fillStyle = isBlackKey(p) ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.04)";
        ctx.fillRect(ROLL.KEY_W, y, w - ROLL.KEY_W, ROLL.ROW_H);
        ctx.fillStyle = "rgba(255,255,255,0.045)";
        ctx.fillRect(ROLL.KEY_W, y + ROLL.ROW_H - 1, w - ROLL.KEY_W, 1);
    }

    /* 竖线：拍（细）/ 小节（粗） */
    const total = getTotalBeats();
    const bpb = getBeatsPerBar();
    const firstBeat = Math.max(0, Math.floor(rollXToBeat(ROLL.KEY_W)));
    const lastBeat = Math.ceil(rollXToBeat(w));
    for (let b = firstBeat; b <= Math.min(lastBeat, total); b++) {
        const x = rollBeatToX(b);
        const isBar = b % bpb === 0;
        ctx.fillStyle = isBar ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)";
        ctx.fillRect(x, ROLL.HEADER_H, isBar ? 2 : 1, h - ROLL.HEADER_H);
    }

    /* 曲外区域遮暗 */
    const endX = rollBeatToX(total);
    if (endX < w) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(Math.max(ROLL.KEY_W, endX), ROLL.HEADER_H, w - Math.max(ROLL.KEY_W, endX), h - ROLL.HEADER_H);
    }

    /* 音符（先其他轨幽灵，再当前轨） */
    state.tracks.forEach((track, ti) => {
        if (ti === state.currentTrack) return;
        track.notes.forEach((n) => drawNote(ctx, ti, n, false, w, h));
    });
    const cur = state.tracks[state.currentTrack];
    if (cur) cur.notes.forEach((n) => drawNote(ctx, state.currentTrack, n, true, w, h));

    drawKeys(ctx, h);
    drawHeader(ctx, w, bpb);
}

function drawNote(ctx, ti, n, editable, w, h) {
    const x = rollBeatToX(n.start);
    const wid = Math.max(4, n.dur * ROLL.pxPerBeat - 1);
    const y = rollPitchToY(n.pitch);
    if (x + wid < ROLL.KEY_W || x > w || y + ROLL.ROW_H < ROLL.HEADER_H || y > h) return;
    const sel = editable && isNoteSelected(ti, n);
    if (!editable) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
    } else {
        const alpha = 0.3 + 0.55 * (n.vel / 127);
        ctx.fillStyle = `rgba(79,195,247,${alpha.toFixed(3)})`;
        ctx.strokeStyle = sel ? "#ffd54f" : "rgba(79,195,247,0.9)";
    }
    ctx.fillRect(x, y + 1, wid, ROLL.ROW_H - 2);
    ctx.strokeRect(x + 0.5, y + 1.5, wid - 1, ROLL.ROW_H - 3);
}

function drawKeys(ctx, h) {
    const topPitch = rollYToPitch(ROLL.HEADER_H);
    const bottomPitch = rollYToPitch(h);
    for (let p = Math.max(0, bottomPitch); p <= Math.min(127, topPitch); p++) {
        const y = rollPitchToY(p);
        ctx.fillStyle = isBlackKey(p) ? "#23232e" : "#9a9aa8";
        ctx.fillRect(0, y, ROLL.KEY_W, ROLL.ROW_H);
        if (p % 12 === 0) {
            ctx.fillStyle = "#16161c";
            ctx.font = "10px sans-serif";
            ctx.fillText(pitchToName(p), ROLL.KEY_W - 22, y + ROLL.ROW_H - 3);
        }
    }
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(ROLL.KEY_W - 1, 0, 1, h);
}

function drawHeader(ctx, w, bpb) {
    ctx.fillStyle = "#161620";
    ctx.fillRect(ROLL.KEY_W, 0, w - ROLL.KEY_W, ROLL.HEADER_H);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(ROLL.KEY_W, ROLL.HEADER_H - 1, w - ROLL.KEY_W, 1);
    const total = getTotalBeats();
    const firstBar = Math.max(0, Math.floor(rollXToBeat(ROLL.KEY_W) / bpb));
    const lastBar = Math.ceil(rollXToBeat(w) / bpb);
    ctx.font = "11px sans-serif";
    for (let bi = firstBar; bi <= Math.min(lastBar, Math.ceil(total / bpb)); bi++) {
        const x = rollBeatToX(bi * bpb);
        if (x < ROLL.KEY_W) continue;
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fillText(String(bi + 1), x + 5, 15);
    }
}

/* ===== 绘制：叠加层（播放头 + 框选）===== */
function drawOverlay() {
    const ctx = els.rollOverlay.getContext("2d");
    const w = els.rollWrap.clientWidth;
    const h = els.rollWrap.clientHeight;
    ctx.clearRect(0, 0, w, h);

    if (playheadBeat() >= 0) {
        const x = rollBeatToX(playheadBeat());
        if (x >= ROLL.KEY_W - 1 && x <= w) {
            ctx.fillStyle = "#ffd54f";
            ctx.fillRect(x, ROLL.HEADER_H, 2, h - ROLL.HEADER_H);
            ctx.beginPath();
            ctx.moveTo(x - 4, ROLL.HEADER_H);
            ctx.lineTo(x + 6, ROLL.HEADER_H);
            ctx.lineTo(x + 1, ROLL.HEADER_H + 7);
            ctx.closePath();
            ctx.fill();
        }
    }

    const drag = ROLL.drag;
    if (drag && drag.mode === "marquee" && drag.marquee) {
        const m = drag.marquee;
        const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1);
        const y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
        ctx.fillStyle = "rgba(79,195,247,0.08)";
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeStyle = "rgba(79,195,247,0.7)";
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    }
}

function overlayLoop() {
    tickPlayhead();
    drawOverlay();
    requestAnimationFrame(overlayLoop);
}

/* ===== 命中检测 ===== */
function hitNote(x, y) {
    const track = state.tracks[state.currentTrack];
    if (!track) return null;
    const beat = rollXToBeat(x);
    const pitch = rollYToPitch(y);
    for (let i = track.notes.length - 1; i >= 0; i--) {
        const n = track.notes[i];
        if (n.pitch !== pitch) continue;
        if (beat >= n.start && beat <= n.start + n.dur) {
            return { track: state.currentTrack, note: n };
        }
    }
    return null;
}

/* ===== 试听 ===== */
function auditionPitch(pitch) {
    const track = state.tracks[state.currentTrack];
    SparrowMusicManager.unlock();
    SparrowSynth.playNote(pitchToName(pitch), {
        bus: "sfx",
        duration: 0.35,
        instrument: track ? track.instrument : "piano",
        volume: 0.06
    });
}

function auditionNote(n) {
    const track = state.tracks[state.currentTrack];
    SparrowMusicManager.unlock();
    SparrowSynth.playNote(pitchToName(n.pitch), {
        bus: "sfx",
        duration: Math.min(1.2, Math.max(0.15, n.dur * 0.5)),
        instrument: track ? track.instrument : "piano",
        volume: Math.max(0.001, 0.06 * (n.vel / 127))
    });
}

/* ===== 交互 ===== */
function bindRollEvents() {
    const canvas = els.rollOverlay;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", onRollDown);
    canvas.addEventListener("pointermove", onRollMove);
    canvas.addEventListener("pointerup", onRollUp);
    canvas.addEventListener("pointercancel", onRollUp);
    canvas.addEventListener("wheel", onRollWheel, { passive: false });
}

function rollPointerPos(e) {
    const rect = els.rollOverlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/* 捕获指针：极少数环境下（指针已释放等）会抛 NotFoundError，吞掉即可 */
function capturePointer(e) {
    try { els.rollOverlay.setPointerCapture(e.pointerId); } catch (error) { /* ignore */ }
}

function onRollDown(e) {
    const { x, y } = rollPointerPos(e);
    /* 右键/中键：拖动 = 平移画面；右键原地点击音符（未拖动）= 删除 */
    if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        capturePointer(e);
        ROLL.drag = {
            mode: "pan-possible", button: e.button,
            startX: x, startY: y,
            scrollX0: ROLL.scrollX, scrollY0: ROLL.scrollY,
            hit: e.button === 2 ? hitNote(x, y) : null
        };
        return;
    }
    if (e.button !== 0) return;
    e.preventDefault();

    if (x < ROLL.KEY_W) {
        auditionPitch(rollYToPitch(y));
        return;
    }
    if (y < ROLL.HEADER_H) {
        /* 起播拍钳制在网格内：越界起播会让所有轨标记播完、引擎立即停止，
           而编辑器仍处于播放态（界面在走、无声） */
        const beat = Math.max(0, Math.min(
            snapFloorB(rollXToBeat(x)),
            qBeats(getTotalBeats() - 0.001)
        ));
        state.pasteBeat = beat;
        playFromBeat(beat);
        return;
    }

    const beat = Math.max(0, rollXToBeat(x));
    const pitch = rollYToPitch(y);
    const hit = hitNote(x, y);
    capturePointer(e);

    if (hit) {
        state.pasteBeat = hit.note.start;
        if (e.shiftKey) {
            /* 加选/减选 */
            if (isNoteSelected(hit.track, hit.note)) {
                state.selection = state.selection.filter((s) => !(s.track === hit.track && s.id === hit.note.id));
            } else {
                state.selection.push({ track: hit.track, id: hit.note.id });
            }
            drawRoll();
            updateNoteProps();
            return;
        }
        if (!isNoteSelected(hit.track, hit.note)) setSelection([hit]);
        const noteX = rollBeatToX(hit.note.start);
        const noteW = Math.max(4, hit.note.dur * ROLL.pxPerBeat);
        if (x > noteX + noteW - 6) {
            ROLL.drag = {
                mode: "resize", track: hit.track,
                orig: { ...hit.note }, moved: false
            };
        } else {
            const items = selectedNotes().some((s) => s.track === hit.track && s.note === hit.note)
                ? selectedNotes() : [{ track: hit.track, note: hit.note }];
            ROLL.drag = {
                mode: "move", grabBeat: rollXToBeat(x), grabPitch: pitch,
                items: items.map(({ track, note }) => ({ track, orig: { ...note } })),
                lastDPitch: 0, moved: false
            };
        }
    } else if (e.shiftKey) {
        ROLL.drag = { mode: "marquee", marquee: { x0: x, y0: y, x1: x, y1: y } };
    } else {
        /* 空白拖动：画音符（点击 = 最短音符）。
           曲外暗区（网格结束之后）不绘制——此类音符播放时被跳过、静默不可闻 */
        if (beat >= getTotalBeats()) return;
        const n = newNote(pitch, snapFloorB(beat), state.snap, 96);
        state.tracks[state.currentTrack].notes.push(n);
        ROLL.drag = { mode: "draw", track: state.currentTrack, note: n, moved: false };
        setSelection([{ track: state.currentTrack, note: n }]);
    }
    drawRoll();
    updateNoteProps();
}

function onRollMove(e) {
    const { x, y } = rollPointerPos(e);
    const drag = ROLL.drag;
    if (!drag) {
        updateRollCursor(x, y);
        return;
    }
    /* 平移：按下后移动超过阈值才进入拖动状态，与"右键点击删除"区分 */
    if (drag.mode === "pan-possible") {
        if (Math.abs(x - drag.startX) > 4 || Math.abs(y - drag.startY) > 4) {
            drag.mode = "pan";
            els.rollOverlay.style.cursor = "grabbing";
        }
    }
    if (drag.mode === "pan") {
        ROLL.scrollX = Math.max(0, Math.min(rollMaxScrollX(), drag.scrollX0 - (x - drag.startX)));
        ROLL.scrollY = Math.max(0, Math.min(rollMaxScrollY(), drag.scrollY0 - (y - drag.startY)));
        drawRoll();
        drawOverlay();
        return;
    }
    if (drag.mode === "marquee") {
        drag.marquee.x1 = x;
        drag.marquee.y1 = y;
        drawOverlay();
        return;
    }

    if (drag.mode === "draw") {
        const n = drag.note;
        const dur = snapRoundB(rollXToBeat(x) - n.start);
        n.dur = Math.max(state.snap, Math.min(dur, qBeats(getTotalBeats() - n.start)));
        drag.moved = true;
    } else if (drag.mode === "move") {
        const dBeat = snapRoundB(rollXToBeat(x) - drag.grabBeat);
        const dPitch = rollYToPitch(y) - drag.grabPitch;
        drag.items.forEach((it) => {
            const note = findNote(it.track, it.orig.id);
            if (!note) return;
            const ns = Math.min(Math.max(0, it.orig.start + dBeat), qBeats(getTotalBeats() - state.snap));
            note.start = qBeats(ns);
            note.pitch = Math.max(0, Math.min(127, it.orig.pitch + dPitch));
        });
        if (dPitch !== drag.lastDPitch) {
            drag.lastDPitch = dPitch;
            const first = drag.items[0] && findNote(drag.items[0].track, drag.items[0].orig.id);
            if (first) auditionPitch(first.pitch);
        }
        drag.moved = true;
    } else if (drag.mode === "resize") {
        const note = findNote(drag.track, drag.orig.id);
        if (note) {
            const dur = snapRoundB(rollXToBeat(x) - note.start);
            note.dur = Math.max(state.snap, Math.min(dur, qBeats(getTotalBeats() - note.start)));
            drag.moved = true;
        }
    }
    drawRoll();
    updateNoteProps();
}

function onRollUp() {
    const drag = ROLL.drag;
    if (!drag) return;
    ROLL.drag = null;
    els.rollOverlay.style.cursor = "crosshair";

    if (drag.mode === "pan-possible") {
        /* 未拖动的右键单击：还原"右键删除音符" */
        if (drag.button === 2 && drag.hit) deleteNotes([drag.hit]);
        return;
    }
    if (drag.mode === "draw") {
        commitNotes("添加音符", [{ track: drag.track, id: drag.note.id, before: null, after: { ...drag.note } }]);
        auditionNote(drag.note);
    } else if (drag.mode === "move" && drag.moved) {
        const deltas = drag.items.map((it) => {
            const note = findNote(it.track, it.orig.id);
            return { track: it.track, id: it.orig.id, before: it.orig, after: note ? { ...note } : null };
        });
        commitNotes("移动音符", deltas);
    } else if (drag.mode === "resize" && drag.moved) {
        const note = findNote(drag.track, drag.orig.id);
        if (note) {
            commitNotes("修改时值", [{ track: drag.track, id: drag.orig.id, before: drag.orig, after: { ...note } }]);
        }
    } else if (drag.mode === "marquee") {
        const m = drag.marquee;
        const b0 = Math.min(rollXToBeat(m.x0), rollXToBeat(m.x1));
        const b1 = Math.max(rollXToBeat(m.x0), rollXToBeat(m.x1));
        const pHi = rollYToPitch(Math.min(m.y0, m.y1));
        const pLo = rollYToPitch(Math.max(m.y0, m.y1));
        const track = state.tracks[state.currentTrack];
        const picked = (track ? track.notes : [])
            .filter((n) => n.pitch >= pLo && n.pitch <= pHi && n.start < b1 && n.start + n.dur > b0)
            .map((n) => ({ track: state.currentTrack, note: n }));
        setSelection(picked);
    }
    drawRoll();
    updateNoteProps();
}

function updateRollCursor(x, y) {
    let cursor = "crosshair";
    if (x < ROLL.KEY_W || y < ROLL.HEADER_H) {
        cursor = "pointer";
    } else {
        const hit = hitNote(x, y);
        if (hit) {
            const noteX = rollBeatToX(hit.note.start);
            const noteW = Math.max(4, hit.note.dur * ROLL.pxPerBeat);
            cursor = x > noteX + noteW - 6 ? "ew-resize" : "move";
        }
    }
    els.rollOverlay.style.cursor = cursor;
}

function onRollWheel(e) {
    e.preventDefault();
    if (e.ctrlKey) {
        /* 缩放：以指针下的拍位为锚点 */
        const { x } = rollPointerPos(e);
        const anchorBeat = rollXToBeat(x);
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        ROLL.pxPerBeat = Math.max(ROLL.MIN_PX, Math.min(ROLL.MAX_PX, ROLL.pxPerBeat * factor));
        ROLL.scrollX = Math.max(0, anchorBeat * ROLL.pxPerBeat - (x - ROLL.KEY_W));
    } else {
        const raw = e.deltaY !== 0 ? e.deltaY : 0;
        const rawX = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
        ROLL.scrollX = Math.max(0, ROLL.scrollX + rawX);
        ROLL.scrollY = Math.max(0, ROLL.scrollY + raw);
    }
    clampScroll();
    drawRoll();
    drawOverlay();
}

/* ===== 删除（右键 / Delete 键共用）===== */
function deleteNotes(hits) {
    if (!hits || !hits.length) return;
    const deltas = hits.map(({ track, note }) => ({ track, id: note.id, before: { ...note }, after: null }));
    applyNoteDelta(deltas, "after");
    commitNotes("删除音符", deltas);
    clearSelection();
    drawRoll();
    updateNoteProps();
}

/* ===== 音轨标签与音轨属性 ===== */
function renderTrackTabs() {
    const c = els.trackTabs;
    c.innerHTML = "";
    state.tracks.forEach((t, i) => {
        const tab = document.createElement("div");
        tab.className = "track-tab" + (i === state.currentTrack ? " active" : "");
        tab.textContent = `${i + 1} · ${t.name}`;
        tab.title = `${t.name}（${instrumentLabel(t.instrument)}）`;
        tab.addEventListener("click", () => {
            state.currentTrack = i;
            clearSelection();
            renderTrackTabs();
            renderTrackProps();
            drawRoll();
            updateNoteProps();
        });
        c.appendChild(tab);
    });
}

function renderTrackProps() {
    const t = state.tracks[state.currentTrack];
    if (!t) return;
    els.trackName.value = t.name;
    els.trackInstrument.value = t.instrument;
    els.trackGate.value = t.gate;
}

function bindTrackProps() {
    /* 音色下拉选项（含中文标注） */
    instruments.forEach((inst) => {
        const opt = document.createElement("option");
        opt.value = inst;
        opt.textContent = instrumentLabel(inst);
        els.trackInstrument.appendChild(opt);
    });
    els.trackName.addEventListener("input", () => {
        const t = state.tracks[state.currentTrack];
        if (t) { t.name = els.trackName.value; renderTrackTabs(); }
    });
    els.trackInstrument.addEventListener("change", () => {
        const t = state.tracks[state.currentTrack];
        if (t) t.instrument = els.trackInstrument.value;
    });
    bindWheelSelect(els.trackInstrument, instruments);
    els.trackGate.addEventListener("change", () => {
        const t = state.tracks[state.currentTrack];
        const v = Number(els.trackGate.value);
        if (t) {
            t.gate = Number.isFinite(v) ? Math.max(0.1, Math.min(1, v)) : 0.85;
            els.trackGate.value = t.gate;
        }
    });
    bindWheelAdjust(els.trackGate, { step: 0.05, min: 0.1, max: 1, fallback: 0.85 });
}

/* 复制当前音轨：插入为其后的一条副本（含全部音符）。
   结构性变更：插入点之后的轨索引全部位移，按轨索引记录的撤销历史随之失效清空 */
function duplicateCurrentTrack() {
    if (state.tracks.length >= 32) {
        writeStatus("音轨数量已达上限 32，无法再复制。");
        return;
    }
    const src = state.tracks[state.currentTrack];
    const copy = {
        name: `${src.name} 副本`,
        instrument: src.instrument,
        gate: src.gate,
        notes: src.notes.map((n) => ({ ...n, id: noteSeq++ }))
    };
    state.tracks.splice(state.currentTrack + 1, 0, copy);
    els.trackCount.value = state.tracks.length;
    state.currentTrack += 1;
    clearSelection();
    history.clear();
    renderTrackTabs();
    renderTrackProps();
    drawRoll();
    updateNoteProps();
    writeStatus(`已复制音轨「${src.name}」为「${copy.name}」（结构性变更，撤销历史已重置）。`);
}

/* 删除当前音轨（至少保留一条）；结构性变更使按轨索引记录的撤销历史失效 */
async function deleteCurrentTrack() {
    if (state.tracks.length <= 1) {
        writeStatus("至少需要保留一条音轨，无法删除。");
        return;
    }
    const track = state.tracks[state.currentTrack];
    const ok = await customConfirm(
        "删除音轨",
        `确定删除「${track.name}」（${track.notes.length} 个音符）吗？此操作不可撤销。`
    );
    if (!ok) return;
    state.tracks.splice(state.currentTrack, 1);
    if (state.currentTrack >= state.tracks.length) {
        state.currentTrack = state.tracks.length - 1;
    }
    els.trackCount.value = state.tracks.length;
    clearSelection();
    history.clear();
    renderTrackTabs();
    renderTrackProps();
    drawRoll();
    updateNoteProps();
    writeStatus(`已删除音轨「${track.name}」，剩余 ${state.tracks.length} 条音轨。`);
}

/* ===== 音符属性条 ===== */
function updateNoteProps() {
    const sel = selectedNotes();
    const single = sel.length === 1;
    els.npPitch.disabled = !single;
    els.npStart.disabled = !single;
    els.npDur.disabled = !single;
    els.npVel.disabled = sel.length === 0;
    if (sel.length === 0) {
        els.npPitch.value = ""; els.npStart.value = ""; els.npDur.value = ""; els.npVel.value = "";
        return;
    }
    if (single) {
        const { note } = sel[0];
        els.npPitch.value = pitchToName(note.pitch);
        els.npStart.value = note.start;
        els.npDur.value = note.dur;
    } else {
        els.npPitch.value = ""; els.npStart.value = ""; els.npDur.value = "";
    }
    const vels = sel.map((s) => s.note.vel);
    els.npVel.value = vels.every((v) => v === vels[0]) ? vels[0] : "";
}

function commitProp(field, rawValue) {
    const sel = selectedNotes();
    if (!sel.length) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) { updateNoteProps(); return; }
    const deltas = sel.map(({ track, note }) => ({
        track, id: note.id,
        before: { ...note },
        after: { ...note, [field]: value }
    }));
    deltas.forEach((d) => {
        const note = findNote(d.track, d.id);
        if (note) note[field] = value;
    });
    commitNotes("修改音符属性", deltas);
    if (field === "pitch") auditionPitch(value);
    drawRoll();
    updateNoteProps();
}

function bindNoteProps() {
    els.npPitch.addEventListener("change", () => {
        const p = nameToPitch(els.npPitch.value);
        if (p === null || p < 0 || p > 127) { updateNoteProps(); return; }
        commitProp("pitch", p);
    });
    els.npStart.addEventListener("change", () => {
        /* 起点钳制在网格内（与拖动移动一致）：越界音符播放时静默不可闻 */
        const v = snapRoundB(Math.max(0, Math.min(
            Number(els.npStart.value) || 0,
            qBeats(getTotalBeats() - state.snap)
        )));
        els.npStart.value = v;
        commitProp("start", v);
    });
    els.npDur.addEventListener("change", () => {
        const v = Math.max(state.snap, Math.min(qBeats(getTotalBeats()), Number(els.npDur.value) || state.snap));
        els.npDur.value = v;
        commitProp("dur", v);
    });
    els.npVel.addEventListener("change", () => {
        const v = getVelocityValue(els.npVel.value);
        els.npVel.value = v;
        commitProp("vel", v);
    });
}

/* ===== 汇总渲染（applySong / 撤销重做 / 参数变更后调用）===== */
function renderAll() {
    if (!ROLL.inited) initRoll();
    renderTrackTabs();
    renderTrackProps();
    clampScroll();
    drawRoll();
    updateNoteProps();
    if (typeof updateTransportUI === "function") updateTransportUI();
}
