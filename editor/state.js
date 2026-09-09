/**
 * Sparrow Editor - state（编辑器数据模型与参数约束）
 * 音轨/单元格状态、小节与步数参数读取（含范围钳制）、
 * 音轨数量同步与 1D 平铺 cells 的小步数二维重组。
 */

function emptyCell() {
    return { note: "", beats: 1, volume: "" };
}

function createEmptyTrack(index) {
    return {
        name: `音轨 ${index + 1}`,
        instrument: instruments[index % instruments.length],
        gate: 0.85,
        cells: Array.from({ length: getTotalSteps() }, () => emptyCell())
    };
}

const state = {
    tracks: [],
    currentBar: 0,
    /* 网格当前布局（小节步数 × 小节数量）：normalizeCells 重组时的旧布局依据，
       避免两个参数同时修改时按当前输入反推旧布局导致数据错位 */
    layout: null
};

function getStepCount() {
    return Math.max(4, Math.min(64, Number(els.stepCount.value) || 16));
}

function getBarCount() {
    return Math.max(1, Math.min(100, Number(els.barCount.value) || 1));
}

function getTotalSteps() {
    return getStepCount() * getBarCount();
}

function getTrackCount() {
    return Math.max(1, Math.min(32, Number(els.trackCount.value) || 1));
}

function getVolumeValue(value, fallback = 2.5) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(2000, n));
}

/* 力度格（MIDI velocity，0-127 整数）专用钳制。
   注意与曲谱音量（0-2000）是两个刻度，勿混用 getVolumeValue。 */
function getVelocityValue(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 96;
    return Math.max(0, Math.min(127, n));
}

function syncTrackCount() {
    const target = getTrackCount();
    while (state.tracks.length < target) {
        state.tracks.push(createEmptyTrack(state.tracks.length));
    }
    if (state.tracks.length > target) {
        state.tracks.length = target;
    }
}

function normalizeCells() {
    syncTrackCount();
    const newStepsPerBar = getStepCount();
    const newBarCount = getBarCount();
    const newTotal = newStepsPerBar * newBarCount;
    /* 旧布局取自上次记录的 state.layout（首次为空时按当前输入） */
    const oldStepsPerBar = state.layout ? state.layout.stepsPerBar : newStepsPerBar;
    const oldBarCount = state.layout ? state.layout.barCount : newBarCount;
    state.tracks.forEach((track) => {
        if (!track.cells || track.cells.length === 0) {
            track.cells = Array.from({ length: newTotal }, () => emptyCell());
            return;
        }
        if (oldStepsPerBar === newStepsPerBar) {
            /* 步数没变，只补齐/截断到 newTotal */
            while (track.cells.length < newTotal) track.cells.push(emptyCell());
            if (track.cells.length > newTotal) track.cells.length = newTotal;
        } else {
            /* 步数变了：按旧布局展开二维 [bar][step]，再收拢到新布局 */
            const grid = [];
            for (let b = 0; b < oldBarCount; b++) {
                const bar = [];
                for (let s = 0; s < oldStepsPerBar; s++) {
                    bar.push(track.cells[b * oldStepsPerBar + s] || emptyCell());
                }
                grid.push(bar);
            }
            const newCells = [];
            for (let b = 0; b < newBarCount; b++) {
                const bar = grid[b] || [];
                for (let s = 0; s < newStepsPerBar; s++) {
                    newCells.push(bar[s] || emptyCell());
                }
            }
            track.cells = newCells;
        }
        track.cells = track.cells.map((cell) => (cell && typeof cell === "object" ? cell : emptyCell()));
    });
    state.layout = { stepsPerBar: newStepsPerBar, barCount: newBarCount };
}
