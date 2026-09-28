/* ============================================================
   app.js · 应用编排：路由 / 导航 / 搜索 / 移动端抽屉 / IMA 同步 / PWA
   ============================================================ */
(function () {
  const { $, $$, el, escapeHtml, fmtDate, modal, toast } = window.UI;
  const Store = window.Store, StudioDB = window.StudioDB, IMA = window.IMA, Modules = window.Modules;

  /* ---------- Markdown → HTML（轻量，用于文章预览/导出） ---------- */
  function md2html(md) {
    if (!md) return "";
    const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^\s*][^*]*?)\*/g, "$1<i>$2</i>")
      .replace(/`([^`]+?)`/g, '<code style="background:#F7F3EA;padding:1px 5px;border-radius:4px;font-size:.92em">$1</code>');
    const lines = String(md).split(/\r?\n/);
    let html = "", i = 0, listOpen = false, listTag = "";
    const openList = (t) => { if (listOpen && listTag === t) return; closeList(); listTag = t; html += `<${t} style="padding-left:22px;margin:8px 0">`; listOpen = true; };
    const closeList = () => { if (listOpen) { html += `</${listTag}>`; listOpen = false; } };
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }
      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { closeList(); const lv = m[1].length; html += `<h${lv}>${inline(m[2])}</h${lv}>`; i++; continue; }
      if (/^---+$/.test(line.trim())) { closeList(); html += '<hr style="border:none;border-top:1px solid var(--q-line-2);margin:14px 0">'; i++; continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; i++; continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { openList("ul"); html += `<li>${inline(m[1])}</li>`; i++; continue; }
      if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { openList("ol"); html += `<li>${inline(m[1])}</li>`; i++; continue; }
      closeList(); html += `<p>${inline(line)}</p>`; i++;
    }
    closeList();
    return html;
  }
  window.md2html = md2html;

  /* ---------- App 状态机 ---------- */
  const App = {
    current: "dashboard",
    searchTerm: "",
    go(key) {
      if (!Modules[key]) return;
      this.current = key;
      this.searchTerm = "";
      const s = $("#globalSearch"); if (s) s.value = "";
      this.updateNav();
      this.renderCurrent();
      closeDrawer();
    },
    updateNav() {
      $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.key === this.current));
      const m = Modules[this.current];
      if (m) $("#pageTitle").textContent = m.title;
    },
    async renderCurrent() {
      const c = $("#content");
      c.innerHTML = "";
      const m = Modules[this.current];
      if (m) {
        try { await m.render(c, this.searchTerm); }
        catch (e) { console.error(e); c.innerHTML = `<div class="empty"><div class="big">⚠️</div><div>模块渲染出错：${escapeHtml(e.message)}</div></div>`; }
      }
      if (window.scrollTo) window.scrollTo(0, 0);
    },
    refresh() { this.renderCurrent(); updateSyncState(); }
  };
  window.App = App;

  /* ---------- 导航 / 抽屉 / 事件 ---------- */
  function buildNav() {
    const nav = $("#nav"); nav.innerHTML = "";
    Object.values(Modules).forEach((m) => {
      const item = el("div", { class: "nav-item" + (m.id === App.current ? " active" : ""), "data-key": m.id });
      item.innerHTML = `<span class="ico">${m.icon}</span><span>${m.title}</span>`;
      item.onclick = () => App.go(m.id);
      nav.appendChild(item);
    });
  }
  function openDrawer() { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); }
  function closeDrawer() { $("#sidebar").classList.remove("open"); $("#scrim").classList.remove("show"); }

  function quickCreate() {
    const items = [
      { k: "articles", t: "📝 新建文章", d: "多平台稿件 + 模板套用 + 一键推送" },
      { k: "plans", t: "🗺️ 新建规划/方案", d: "工作室方向与落地方案" },
      { k: "tasks", t: "✅ 新建任务", d: "看板任务跟进" },
      { k: "goals", t: "🎯 新建目标", d: "量化目标进度跟踪" },
      { k: "benchmarks", t: "🔭 新增对标", d: "竞品/标杆账号追踪" }
    ];
    const body = el("div");
    items.forEach((it) => {
      const b = el("button", { class: "btn btn-ghost btn-block", style: "justify-content:flex-start;margin-bottom:8px;text-align:left", html: `<b>${it.t}</b><div class="sub" style="font-weight:400">${it.d}</div>` });
      b.onclick = () => { m.close(); App.go(it.k); };
      body.appendChild(b);
    });
    const m = modal({ title: "＋ 快速新建", body, width: 460 });
  }

  function attachEvents() {
    $("#menuBtn").onclick = openDrawer;
    $("#scrim").onclick = closeDrawer;
    $("#imaSyncBtn").onclick = () => { IMA.pushToIMA(); updateSyncState(); };
    $("#quickCreateBtn").onclick = quickCreate;
    let t;
    $("#globalSearch").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { App.searchTerm = e.target.value.trim(); App.renderCurrent(); }, 180);
    });
  }

  async function updateSyncState() {
    const cfg = await Store.get("settings", "ima");
    const s = $("#syncState");
    if (cfg && cfg.lastSync) { s.textContent = "已同步 " + fmtDate(cfg.lastSync); s.className = "sync-state ok"; }
    else { s.textContent = "未连接 IMA"; s.className = "sync-state"; }
  }

  async function init() {
    buildNav();
    await StudioDB.seedIfEmpty();
    attachEvents();
    await updateSyncState();
    App.renderCurrent();
    if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW 注册失败：", e)); }
    toast("祁连说工作室管理系统已就绪", "ok");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
