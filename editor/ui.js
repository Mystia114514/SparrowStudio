/**
 * Sparrow Editor - ui（编辑器通用 UI 组件）
 * 悬浮提示（悬停 2 秒显示参数说明）与自定义确认弹窗（替代原生 confirm）。
 */

/* ===== 悬浮提示：鼠标悬停 2 秒后显示参数名称与作用 ===== */
let tipEl = null;
let tipTimer = null;
function hideTip() {
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    if (tipEl) tipEl.style.display = "none";
}
function bindTooltips(root) {
    if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "tip";
        document.body.appendChild(tipEl);
    }
    root.querySelectorAll("input, select").forEach((el) => {
        if (el._tipBound) return;
        el._tipBound = true;
        const text = el.getAttribute("data-tip") || el.getAttribute("title") || "";
        if (!text) return;
        let mx = 0, my = 0, shown = false;
        const position = () => {
            const pad = 12;
            tipEl.style.left = Math.min(mx + pad, window.innerWidth - tipEl.offsetWidth - 8) + "px";
            const top = my - tipEl.offsetHeight - 8;
            tipEl.style.top = (top > 0 ? top : my + pad) + "px";
        };
        el.addEventListener("mouseenter", () => {
            hideTip();
            shown = false;
            tipTimer = setTimeout(() => {
                tipEl.textContent = text;
                position();
                tipEl.style.display = "block";
                shown = true;
            }, 2000);
        });
        el.addEventListener("mousemove", (e) => {
            mx = e.clientX;
            my = e.clientY;
            if (shown) position();
        });
        el.addEventListener("mouseleave", hideTip);
        el.addEventListener("input", hideTip);
        el.addEventListener("change", hideTip);
        el.addEventListener("focus", hideTip);
    });
}

/* ===== 自定义确认弹窗（替代原生 confirm） ===== */
function customConfirm(title, body) {
    const overlay = document.getElementById("confirm-overlay");
    const titleEl = document.getElementById("confirm-title");
    const bodyEl = document.getElementById("confirm-body");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    titleEl.textContent = title;
    bodyEl.textContent = body;
    overlay.classList.add("visible");

    return new Promise((resolve) => {
        const cleanup = () => {
            overlay.classList.remove("visible");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            overlay.removeEventListener("click", onOverlay);
            document.removeEventListener("keydown", onEsc);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onOverlay = (e) => { if (e.target === overlay) onCancel(); };
        const onEsc = (e) => { if (e.key === "Escape") onCancel(); };

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        overlay.addEventListener("click", onOverlay);
        document.addEventListener("keydown", onEsc);
    });
}
