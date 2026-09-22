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

/* ===== 滚轮快速调节：悬停在控件上滚动即可增减，无需点进输入框 =====
   wheel：数值输入框步进（Shift+滚轮 = 8 倍步长；上滚增、下滚减），
   触发 input + change 事件，复用已有的输入处理与钳制逻辑。 */
function bindWheelAdjust(el, { step = 1, min = 0, max = 100, integer = false, fallback = min } = {}) {
    el.style.cursor = "ns-resize";
    el.addEventListener("wheel", (e) => {
        e.preventDefault();
        const raw = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        const dir = (raw < 0 ? 1 : -1) * (e.shiftKey ? 8 : 1);
        const current = Number(el.value);
        let next = (Number.isFinite(current) ? current : fallback) + dir * step;
        next = Math.max(min, Math.min(max, next));
        if (integer) next = Math.round(next);
        el.value = Math.round(next * 10000) / 10000;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, { passive: false });
}

/* wheel 循环切换选项列表（用于音色下拉等），上滚下一个、下滚上一个 */
function bindWheelSelect(el, values) {
    el.style.cursor = "ns-resize";
    el.addEventListener("wheel", (e) => {
        e.preventDefault();
        const raw = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        const dir = raw < 0 ? 1 : -1;
        const idx = values.indexOf(el.value);
        el.value = values[(idx + dir + values.length) % values.length];
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }, { passive: false });
}

/* ===== 自定义确认弹窗（替代原生 confirm） =====
   并发守卫：同一时刻只允许一个确认弹窗。若上一弹窗尚未处理又触发新的
   确认（如连续改两个参数各弹一窗），新请求直接按"取消"解决——否则两个
   Promise 会同时挂起，点一次按钮同时解决两个，两段处理逻辑重复执行。 */
let confirmPending = false;
function customConfirm(title, body) {
    const overlay = document.getElementById("confirm-overlay");
    const titleEl = document.getElementById("confirm-title");
    const bodyEl = document.getElementById("confirm-body");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (confirmPending) return Promise.resolve(false);
    confirmPending = true;
    titleEl.textContent = title;
    bodyEl.textContent = body;
    overlay.classList.add("visible");

    return new Promise((resolve) => {
        const cleanup = () => {
            confirmPending = false;
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
