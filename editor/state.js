/**
 * Sparrow Editor - state（数据模型：音符事件 + 选择 + 撤销历史）
 * 每条音轨 { name, instrument, gate, notes[] }；
 * 音符 { id, pitch, start, dur, vel }：pitch 为 MIDI 音号（0-127），
 * start/dur 为拍数（自曲首累计），vel 为 MIDI velocity（0-127）。
 * 一条音轨允许多个音符叠放（和弦），播放时由 buildSong 自动拆声部。
 */

let noteSeq = 1;

function createEmptyTrack(index) {
    return {
        name: `音轨 ${index + 1}`,
        instrument: instruments[index % instruments.length],
        gate: 0.85,
        notes: []
    };
}

function newNote(pitch, start, dur, vel = 96) {
    return { id: noteSeq++, pitch, start, dur, vel };
}

const state = {
    tracks: [],
    currentTrack: 0,
    selection: [],      // [{ track, id }]
    snap: 0.25,         // 吸附粒度（拍）
    pasteBeat: 0,       // 粘贴基准拍（最近一次在卷帘内点击的位置）
    clipboard: null     // 复制的音符（start 已相对化到最小值）
};

/* ===== 参数读取与钳制（与 HTML min/max 双重钳制）===== */
function getBeatsPerBar() {
    return Math.max(1, Math.min(12, Number(els.beatsPerBar.value) || 4));
}

function getBarCount() {
    return Math.max(1, Math.min(512, Number(els.barCount.value) || 16));
}

function getTotalBeats() {
    return getBeatsPerBar() * getBarCount();
}

function getTrackCount() {
    return Math.max(1, Math.min(32, Number(els.trackCount.value) || 1));
}

function getVelocityValue(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 96;
    return Math.max(0, Math.min(127, n));
}

/* 曲长参数最近一次生效值：缩短曲长被取消时回弹用。
   必须与输入框的所有改写路径保持同步（applySong 导入、清空、手动修改后均需快照），
   否则回弹到陈旧值会导致网格与后续确认逻辑错位 */
let lastBars = 16;
let lastBeatsPerBar = 4;
function snapshotSongLength() {
    lastBars = getBarCount();
    lastBeatsPerBar = getBeatsPerBar();
}

function syncTrackCount() {
    const target = getTrackCount();
    let removed = false;
    while (state.tracks.length < target) {
        state.tracks.push(createEmptyTrack(state.tracks.length));
    }
    if (state.tracks.length > target) {
        state.tracks.length = target;
        removed = true;
    }
    if (state.currentTrack >= state.tracks.length) {
        state.currentTrack = Math.max(0, state.tracks.length - 1);
    }
    /* 减轨后轨索引位移/目标轨消失：撤销历史按轨索引记录，必须失效重置 */
    if (removed) {
        history.clear();
        clearSelection();
    }
}

/* ===== 吸附 ===== */
function snapFloorB(beat) {
    return qBeats(Math.floor(beat / state.snap + 1e-6) * state.snap);
}

function snapRoundB(beat) {
    return qBeats(Math.round(beat / state.snap) * state.snap);
}

/* ===== 选择 ===== */
function selectedNotes() {
    const out = [];
    state.selection.forEach(({ track, id }) => {
        const t = state.tracks[track];
        const n = t && t.notes.find((x) => x.id === id);
        if (n) out.push({ track, note: n });
    });
    return out;
}

function setSelection(list) {
    state.selection = list.map(({ track, note }) => ({ track, id: note.id }));
}

function clearSelection() {
    state.selection = [];
}

function isNoteSelected(trackIndex, note) {
    return state.selection.some((s) => s.track === trackIndex && s.id === note.id);
}

function findNote(trackIndex, id) {
    const t = state.tracks[trackIndex];
    return t ? t.notes.find((x) => x.id === id) || null : null;
}

/* ===== 撤销/重做 =====
   历史条目 = 音符差量 [{ track, id, before, after }]，
   before/after 为完整音符克隆（null 表示该侧不存在：新增/删除），
   撤销应用 before、重做应用 after。 */
const history = {
    undoStack: [],
    redoStack: [],
    push(undoFn, redoFn, deltas) {
        this.undoStack.push({ undoFn, redoFn, deltas: deltas || [] });
        this.redoStack = [];
        if (this.undoStack.length > 100) this.undoStack.shift();
    },
    /* 返回被应用的条目（供恢复选中），栈空返回 null */
    undo() {
        const entry = this.undoStack.pop();
        if (!entry) return null;
        entry.undoFn();
        this.redoStack.push(entry);
        return entry;
    },
    redo() {
        const entry = this.redoStack.pop();
        if (!entry) return null;
        entry.redoFn();
        this.undoStack.push(entry);
        return entry;
    },
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
};

/* 判断单个差量是否为实际变更：新增/删除（任一侧为 null）必然是；
   修改则四项属性全等视为无变化（拖动抖动、回车未改值等），不入历史 */
function isNoOpDelta(d) {
    if (!d.before || !d.after) return false;
    return d.before.pitch === d.after.pitch
        && d.before.start === d.after.start
        && d.before.dur === d.after.dur
        && d.before.vel === d.after.vel;
}

function applyNoteDelta(deltas, phase) {
    deltas.forEach((d) => {
        const track = state.tracks[d.track];
        if (!track) return;
        const idx = track.notes.findIndex((n) => n.id === d.id);
        const snap = d[phase];
        if (idx >= 0) {
            /* 就地替换/删除：保持音符数组顺序稳定，避免撤销后叠放层级变化 */
            if (snap) track.notes[idx] = { ...snap };
            else track.notes.splice(idx, 1);
        } else if (snap) {
            track.notes.push({ ...snap });
        }
    });
}

/* 提交一批音符变更（调用方自行先对数据落地）；全为无变化差量时不入历史。
   返回是否实际记录。 */
function commitNotes(label, deltas) {
    const effective = (deltas || []).filter((d) => !isNoOpDelta(d));
    if (!effective.length) return false;
    history.push(
        () => applyNoteDelta(effective, "before"),
        () => applyNoteDelta(effective, "after"),
        effective
    );
    return true;
}

/* 撤销/重做后把受影响的音符恢复为选中，便于连续操作 */
function selectAffectedNotes(deltas, phase) {
    state.selection = (deltas || [])
        .filter((d) => d[phase])
        .map((d) => ({ track: d.track, id: d.id }));
}

function undoNotes() {
    const entry = history.undo();
    if (entry) {
        selectAffectedNotes(entry.deltas, "before");
        renderAll();
        writeStatus("已撤销。");
    } else {
        writeStatus("没有可撤销的操作。");
    }
}

function redoNotes() {
    const entry = history.redo();
    if (entry) {
        selectAffectedNotes(entry.deltas, "after");
        renderAll();
        writeStatus("已重做。");
    } else {
        writeStatus("没有可重做的操作。");
    }
}
