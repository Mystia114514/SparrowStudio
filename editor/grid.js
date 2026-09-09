/**
 * Sparrow Editor - grid（网格与小节导航渲染）
 * 竖向音轨网格：列 = 音轨，行 = 步骤（仅当前小节）。
 * 小节卡片导航 + 音轨表头 + 可编辑单元格。
 */

function updateBarNav() {
    const total = getBarCount();
    if (state.currentBar >= total) state.currentBar = total - 1;
    if (state.currentBar < 0) state.currentBar = 0;

    const container = els.barTabs;
    container.innerHTML = "";
    for (let i = 0; i < total; i++) {
        const tab = document.createElement("div");
        tab.className = "bar-tab" + (i === state.currentBar ? " active" : "");
        tab.textContent = i + 1;
        tab.addEventListener("click", () => {
            state.currentBar = i;
            updateBarNav();
            renderTracks();
        });
        container.appendChild(tab);
    }
}

function renderAll() {
    normalizeCells();
    updateBarNav();
    renderTracks();
}

/* ===== 竖向音轨渲染：列 = 音轨，行 = 步骤（仅当前小节） ===== */
function renderTracks() {
    const stepsPerBar = getStepCount();
    const trackCount = state.tracks.length;
    const barOffset = state.currentBar * stepsPerBar;
    const body = els.editorBody;
    body.style.setProperty("--track-count", trackCount);
    body.innerHTML = "";

    /* 行 0：左上角 + 各音轨表头（粘顶） */
    const corner = document.createElement("div");
    corner.className = "corner";
    corner.textContent = "步";
    body.appendChild(corner);

    state.tracks.forEach((track) => {
        const header = document.createElement("div");
        header.className = "track-header";

        const nameInput = document.createElement("input");
        nameInput.className = "th-name";
        nameInput.type = "text";
        nameInput.value = track.name;
        nameInput.dataset.tip = "音轨名称：这条音轨的显示名";
        nameInput.addEventListener("input", () => { track.name = nameInput.value; });

        const instSelect = document.createElement("select");
        instSelect.dataset.tip = "音色：这条音轨使用的发声器类型，所有音符共用";
        instruments.forEach((inst) => {
            const opt = document.createElement("option");
            opt.value = inst;
            opt.textContent = inst;
            instSelect.appendChild(opt);
        });
        instSelect.value = track.instrument;
        instSelect.addEventListener("change", () => { track.instrument = instSelect.value; });

        const gateInput = document.createElement("input");
        gateInput.type = "number";
        gateInput.min = "0.1";
        gateInput.max = "1";
        gateInput.step = "0.05";
        gateInput.value = track.gate;
        gateInput.dataset.tip = "gate：音符实际发声占时值的比例（0.1-1）";
        gateInput.addEventListener("change", () => {
            const v = Number(gateInput.value);
            track.gate = Number.isFinite(v) ? Math.max(0.1, Math.min(1, v)) : 0.85;
            gateInput.value = track.gate;
        });

        header.appendChild(nameInput);
        header.appendChild(instSelect);
        header.appendChild(gateInput);
        body.appendChild(header);
    });

    /* 行 1..stepsPerBar：步数列 + 每音轨的方格（当前小节） */
    for (let step = 0; step < stepsPerBar; step++) {
        const isBar = step % 4 === 0;
        const absStep = barOffset + step;

        const stepNum = document.createElement("div");
        stepNum.className = "step-num" + (isBar ? " bar" : "");
        stepNum.textContent = step + 1;
        stepNum.title = `跳转到第 ${step + 1} 步并播放`;
        /* 读取点击时刻的 currentBar，避免播放跨小节后闭包里的旧小节偏移失效 */
        stepNum.addEventListener("click", () => jumpToStep(state.currentBar * getStepCount() + step));
        body.appendChild(stepNum);

        state.tracks.forEach((track, trackIndex) => {
            const cellData = track.cells[absStep] || emptyCell();

            const cell = document.createElement("div");
            cell.className = "cell" + (isBar ? " bar" : "");
            cell.dataset.track = trackIndex;
            cell.dataset.step = step;

            const note = document.createElement("input");
            note.className = "c-note";
            note.type = "text";
            note.placeholder = "音名";
            note.value = cellData.note;
            note.dataset.tip = "音名：这个音的音高，如 C5、F#4、Do；留空为休止";
            note.addEventListener("input", () => { cellData.note = note.value; });

            const beats = document.createElement("input");
            beats.className = "c-beats";
            beats.type = "number";
            beats.min = "0.25";
            beats.step = "0.25";
            beats.dataset.tip = "节拍：这个音持续几拍，如 1、0.5";
            beats.value = cellData.beats;
            beats.addEventListener("change", () => {
                const v = Number(beats.value);
                cellData.beats = v > 0 ? v : 1;
                beats.value = cellData.beats;
            });

            const vol = document.createElement("input");
            vol.className = "c-vol";
            vol.type = "number";
            vol.min = "0";
            vol.max = "127";
            vol.step = "1";
            vol.dataset.tip = "力度：MIDI velocity（0-127 整数，96 为默认，0 为静音），留空用默认力度";
            vol.placeholder = "力度";
            vol.value = cellData.volume;
            vol.addEventListener("input", () => {
                cellData.volume = vol.value.trim() === "" ? "" : getVelocityValue(vol.value);
            });

            cell.appendChild(note);
            cell.appendChild(beats);
            cell.appendChild(vol);
            body.appendChild(cell);
        });
    }

    bindTooltips(body);
}
