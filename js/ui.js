/* ============================================================
   ui.js · 通用 UI 工具：DOM、模态、toast、平台元数据
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  const PLATFORMS = {
    wechat: { name: "微信公众号", cls: "wechat", icon: "💬" },
    xhs: { name: "小红书", cls: "xhs", icon: "📕" },
    toutiao: { name: "今日头条", cls: "toutiao", icon: "⚡" },
    weibo: { name: "微博", cls: "weibo", icon: "🔥" },
    bili: { name: "B站", cls: "bili", icon: "📺" }
  };
  function platTag(p) { const m = PLATFORMS[p] || { name: p, cls: "", icon: "📄" }; return `<span class="plat ${m.cls}">${m.icon} ${m.name}</span>`; }

  /* ---------- 模态 ---------- */
  function modal({ title, body, foot, width }) {
    const root = $("#modalRoot");
    const mask = el("div", { class: "modal-mask" });
    const box = el("div", { class: "modal" });
    if (width) box.style.maxWidth = width;
    const head = el("div", { class: "modal-head" }, [
      el("h3", { text: title || "" }),
      el("button", { class: "x-btn", text: "×", onclick: close })
    ]);
    const b = el("div", { class: "modal-body" });
    if (typeof body === "string") b.innerHTML = body; else if (body) b.appendChild(body);
    box.append(head, b);
    if (foot) { const f = el("div", { class: "modal-foot" }); (Array.isArray(foot) ? foot : [foot]).forEach((x) => f.appendChild(x)); box.appendChild(f); }
    mask.appendChild(box);
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    root.appendChild(mask);
    function close() { mask.remove(); }
    return { close, body: b, box };
  }

  /* ---------- toast ---------- */
  function toast(msg, type = "") {
    const t = el("div", { class: "toast " + type, text: msg });
    $("#toastRoot").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 2400);
  }

  /* ---------- 确认框 ---------- */
  function confirm(msg, onYes, onNo) {
    const m = modal({
      title: "请确认",
      body: `<p style="font-size:15px;line-height:1.7">${escapeHtml(msg)}</p>`,
      foot: [
        el("button", { class: "btn btn-ghost", text: "取消", onclick: () => { m.close(); onNo && onNo(); } }),
        el("button", { class: "btn btn-primary", text: "确定", onclick: () => { m.close(); onYes && onYes(); } })
      ]
    });
  }

  window.UI = { $, $$, el, escapeHtml, fmtDate, platTag, PLATFORMS, modal, toast, confirm };
})();
