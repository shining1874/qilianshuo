/* ============================================================
   modules.js · 功能模块（工作室核心业务）
   模块注册：window.Modules = { key: { id, title, icon, render(content, term) } }
   render 在每次路由/搜索时被调用，重绘 #content
   ============================================================ */
(function () {
  const { $, $$, el, escapeHtml, fmtDate, platTag, PLATFORMS, modal, toast, confirm } = window.UI;
  const Store = window.Store, StudioDB = window.StudioDB, IMA = window.IMA, Push = window.Push;

  /* ---------- 通用：状态文案 ---------- */
  const ART_STATUS = { draft: "草稿", published: "已发布", archived: "归档" };
  const TASK_STATUS = { todo: "待办", doing: "进行中", done: "已完成" };
  const PRIORITY = { high: "高", mid: "中", low: "低" };
  function statPill(s, map) { return `<span class="status ${s}">${map[s] || s}</span>`; }

  /* ---------- 通用：表单弹窗 ---------- */
  function fieldInput(f, val) {
    if (f.type === "select") {
      const s = el("select", { name: f.key });
      (f.options || []).forEach((o) => { const op = el("option", { value: o.value, text: o.label }); if (o.value === val) op.selected = true; s.appendChild(op); });
      return s;
    }
    if (f.type === "textarea") { const t = el("textarea", { name: f.key, placeholder: f.placeholder || "" }); t.value = val || ""; return t; }
    if (f.type === "tags") { const t = el("input", { name: f.key, placeholder: f.placeholder || "逗号分隔" }); t.value = (val || []).join(", "); return t; }
    const i = el("input", { name: f.key, placeholder: f.placeholder || "" });
    if (f.type === "number") i.type = "number";
    i.value = (val == null ? "" : val);
    return i;
  }
  function collectForm(body, fields) {
    const out = {};
    fields.forEach((f) => {
      const n = body.querySelector(`[name="${f.key}"]`); if (!n) return;
      let v = n.value;
      if (f.type === "number") v = v === "" ? null : Number(v);
      if (f.type === "tags") v = v.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      out[f.key] = v;
    });
    return out;
  }
  function openForm(opts) {
    const { title, store, id, fields, extra, onSaved, width } = opts;
    const isNew = !id;
    let existing = null;
    const body = el("div");
    fields.forEach((f) => {
      const wrap = el("div", { class: "field" });
      wrap.appendChild(el("label", { text: f.label }));
      wrap.appendChild(fieldInput(f, isNew ? (f.default ?? "") : ""));
      body.appendChild(wrap);
    });
    if (extra && extra.build) body.appendChild(extra.build());
    const m = modal({
      title, body, width: width || 560,
      foot: [
        el("button", { class: "btn btn-ghost", text: "取消", onclick: () => m.close() }),
        el("button", { class: "btn btn-primary", text: "保存", onclick: async () => {
          let rec = isNew ? { id: StudioDB.uid(store.slice(0, 2)) } : (await Store.get(store, id));
          if (!rec) rec = { id };
          Object.assign(rec, collectForm(body, fields));
          if (extra && extra.collect) Object.assign(rec, extra.collect(body));
          rec.updatedAt = StudioDB.now();
          await Store.put(store, rec);
          m.close(); toast("已保存 ✓", "ok"); onSaved && onSaved();
        } })
      ]
    });
    if (!isNew) Store.get(store, id).then((r) => {
      if (!r) return; existing = r;
      fields.forEach((f) => {
        const n = body.querySelector(`[name="${f.key}"]`); if (!n) return;
        if (f.type === "tags") n.value = (r[f.key] || []).join(", ");
        else if (f.type === "select") n.value = r[f.key];
        else n.value = (r[f.key] ?? "");
      });
      if (extra && extra.fill) extra.fill(body, r);
    });
    return m;
  }

  /* ============================================================
     ① 工作台 Dashboard
     ============================================================ */
  const dashboard = {
    id: "dashboard", title: "工作台", icon: "🏠",
    async render(c) {
      const [articles, tasks, goals, benchmarks, plans] = await Promise.all([
        Store.all("articles"), Store.all("tasks"), Store.all("goals"), Store.all("benchmarks"), Store.all("plans")
      ]);
      const pub = articles.filter((a) => a.status === "published").length;
      const draft = articles.filter((a) => a.status === "draft").length;
      const doingT = tasks.filter((t) => t.status === "doing").length;
      const todoT = tasks.filter((t) => t.status === "todo").length;
      const goalPct = goals.length ? Math.round(goals.reduce((s, g) => s + Math.min(100, (g.current / g.target) * 100), 0) / goals.length) : 0;

      c.innerHTML = `
        <div class="grid grid-4">
          <div class="card stat"><div class="ico">📝</div><div class="num">${articles.length}</div><div class="lbl">文章总数</div><div class="trend up">已发布 ${pub} · 草稿 ${draft}</div></div>
          <div class="card stat"><div class="ico">✅</div><div class="num">${tasks.length}</div><div class="lbl">任务</div><div class="trend up">进行中 ${doingT} · 待办 ${todoT}</div></div>
          <div class="card stat"><div class="ico">🎯</div><div class="num">${goalPct}%</div><div class="lbl">目标平均完成率</div><div class="trend up">${goals.length} 项目标跟踪中</div></div>
          <div class="card stat"><div class="ico">🔭</div><div class="num">${benchmarks.length}</div><div class="lbl">对标账号</div><div class="trend up">持续追踪</div></div>
        </div>`;

      // 最近文章
      c.appendChild(sectionTitle("📝 最近文章", () => App.go("articles")));
      const recent = articles.slice(-5).reverse();
      const rg = el("div", { class: "grid grid-3" });
      if (recent.length === 0) rg.appendChild(empty("还没有文章，去「文章」新建一篇"));
      recent.forEach((a) => rg.appendChild(artCard(a)));
      c.appendChild(rg);

      // 待办任务
      c.appendChild(sectionTitle("⏳ 待办 / 进行中任务", () => App.go("tasks")));
      const upTasks = tasks.filter((t) => t.status !== "done").slice(0, 5);
      const tg = el("div", { class: "grid grid-2" });
      if (upTasks.length === 0) tg.appendChild(empty("暂无待办任务"));
      upTasks.forEach((t) => {
        tg.appendChild(el("div", { class: "card", html:
          `<div style="display:flex;justify-content:space-between;align-items:center">
            <h4 style="font-size:14.5px">${escapeHtml(t.title)}</h4>${statPill(t.status, TASK_STATUS)}</div>
           <div class="sub" style="margin-top:6px">截止 ${fmtDate(t.due)} ｜ 优先级 ${PRIORITY[t.priority] || "—"}</div>` }));
      });
      c.appendChild(tg);

      // 目标进度
      c.appendChild(sectionTitle("🎯 目标进度", () => App.go("goals")));
      const gg = el("div", { class: "grid grid-2" });
      goals.forEach((g) => {
        const pct = Math.min(100, Math.round((g.current / g.target) * 100));
        const cls = pct >= 100 ? "" : pct >= 60 ? "warn" : "danger";
        gg.appendChild(el("div", { class: "card", html:
          `<div style="display:flex;justify-content:space-between"><h4 style="font-size:14.5px">${escapeHtml(g.title)}</h4><span class="sub">${g.current}/${g.target} ${g.unit}</span></div>
           <div class="progress ${cls}" style="margin-top:10px"><i style="width:${pct}%"></i></div>
           <div class="sub" style="margin-top:6px">截止 ${fmtDate(g.deadline)}</div>` }));
      });
      c.appendChild(gg);
    }
  };

  /* ============================================================
     ② 多平台文章管理
     ============================================================ */
  const articles = {
    id: "articles", title: "文章管理", icon: "📝",
    _filter: { platform: "all", status: "all" },
    async render(c, term) {
      const all = await Store.all("articles");
      const { platform, status } = this._filter;
      let list = all;
      if (platform !== "all") list = list.filter((a) => a.platform === platform);
      if (status !== "all") list = list.filter((a) => a.status === status);
      if (term) { const t = term.toLowerCase(); list = list.filter((a) => (a.title + (a.tags || []).join("") + (a.body || "")).toLowerCase().includes(t)); }

      c.appendChild(buildToolbar([
        segCtl("平台", [["all", "全部"], ...Object.keys(PLATFORMS).map((p) => [p, PLATFORMS[p].name])], platform, (v) => { this._filter.platform = v; this.render(c, term); }),
        segCtl("状态", [["all", "全部"], ["draft", "草稿"], ["published", "已发布"], ["archived", "归档"]], status, (v) => { this._filter.status = v; this.render(c, term); }),
        el("div", { class: "spacer" }),
        el("button", { class: "btn btn-primary", text: "＋ 新建文章", onclick: () => openArticleEditor(c, null, term) })
      ]));

      if (list.length === 0) { c.appendChild(empty("没有匹配的文章")); return; }
      const g = el("div", { class: "grid grid-3" });
      list.reverse().forEach((a) => g.appendChild(artCard(a, () => openArticleEditor(c, a.id, term))));
      c.appendChild(g);
    }
  };

  function artCard(a, onClick) {
    const cover = el("div", { class: "card art-card" });
    cover.appendChild(el("div", { class: "cover", html: `<span class="emoji">${a.cover || "📄"}</span>` }));
    cover.appendChild(el("h4", { text: a.title }));
    cover.appendChild(el("div", { class: "meta", html: platTag(a.platform) + " " + statPill(a.status, ART_STATUS) }));
    const tags = el("div", { html: (a.tags || []).slice(0, 3).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("") });
    cover.appendChild(tags);
    const foot = el("div", { class: "foot", html:
      `<span class="sub">${fmtDate(a.updatedAt || a.createdAt)}</span>
       <span style="display:flex;gap:6px">
         <button class="btn btn-sm btn-ghost" data-act="edit">编辑</button>
         <button class="btn btn-sm btn-teal" data-act="push">推送</button>
       </span>` });
    cover.appendChild(foot);
    foot.querySelector('[data-act="edit"]').onclick = (e) => { e.stopPropagation(); onClick && onClick(); };
    foot.querySelector('[data-act="push"]').onclick = (e) => { e.stopPropagation(); Push.push(a); };
    if (onClick) cover.style.cursor = "pointer", cover.onclick = onClick;
    return cover;
  }

  function openArticleEditor(c, id, term) {
    Promise.all([id ? Store.get("articles", id) : Promise.resolve(null), Store.all("templates")]).then(([rec, tpls]) => {
      const isNew = !rec;
      const a = rec || { id: StudioDB.uid("a"), platform: "wechat", status: "draft", tags: [], tpl: "", cover: "📄", title: "", body: "", seo: "" };
      const body = el("div");

      // 基础字段
      const fTitle = field("标题", el("input", { name: "title", value: a.title || "" }));
      const fPlat = field("平台", sel("platform", Object.keys(PLATFORMS).map((p) => ({ value: p, label: PLATFORMS[p].name })), a.platform));
      const fStatus = field("状态", sel("status", [["draft", "草稿"], ["published", "已发布"], ["archived", "归档"]], a.status));
      const fTpl = field("套用模板", sel("tpl", [{ value: "", label: "不使用" }].concat(tpls.map((t) => ({ value: t.id, label: t.name }))), a.tpl));
      const fCover = field("封面图标(emoji)", el("input", { name: "cover", value: a.cover || "📄" }));
      const fTags = field("标签(逗号分隔)", el("input", { name: "tags", value: (a.tags || []).join(", ") }));
      const fSeo = field("SEO 关键词", el("input", { name: "seo", value: a.seo || "", placeholder: "用于搜索引擎/AI 检索优化" }));

      body.append(fTitle, fPlat, fStatus, fTpl, fCover, fSeo, fTags);

      // 模板套用按钮（放在编辑面板头部）
      const applyBtn = el("button", { class: "btn btn-sm btn-ghost", text: "套用所选模板", onclick: () => {
        const tid = body.querySelector('[name="tpl"]').value;
        const t = tpls.find((x) => x.id === tid);
        const title = body.querySelector('[name="title"]').value;
        if (!t) { toast("请先选择模板", "err"); return; }
        const sample = (t.sample || "").replace(/\{标题\}/g, title || "（请填标题）");
        ta.value = sample; renderPrev(); toast("已套用模板：" + t.name, "ok");
      } });

      // 双栏编辑
      const ta = el("textarea", { class: "markdown-input", name: "body", placeholder: "在此撰写正文（支持 Markdown）" });
      ta.value = a.body || "";
      const preview = el("div", { class: "preview-body", id: "prevBody" });
      const eg = el("div", { class: "editor-grid" }, [
        el("div", { class: "editor-pane" }, [paneHead("✍️ 编辑", [applyBtn]), ta]),
        el("div", { class: "preview-pane" }, [paneHead("👁 预览"), preview])
      ]);
      body.appendChild(eg);
      function renderPrev() { preview.innerHTML = (window.md2html ? window.md2html(ta.value) : escapeHtml(ta.value)); }
      ta.addEventListener("input", renderPrev);
      renderPrev();

      const m = modal({
        title: isNew ? "新建文章" : "编辑文章", body, width: 1040,
        foot: [
          el("button", { class: "btn btn-ghost", text: "关闭", onclick: () => m.close() }),
          el("button", { class: "btn btn-teal", text: "🚀 一键推送", onclick: () => {
            save().then((recSaved) => { if (recSaved) Push.push(recSaved); });
          } }),
          el("button", { class: "btn btn-primary", text: "💾 保存", onclick: () => save() })
        ]
      });
      async function save() {
        const out = {
          title: body.querySelector('[name="title"]').value,
          platform: body.querySelector('[name="platform"]').value,
          status: body.querySelector('[name="status"]').value,
          tpl: body.querySelector('[name="tpl"]').value,
          cover: body.querySelector('[name="cover"]').value,
          seo: body.querySelector('[name="seo"]').value,
          tags: body.querySelector('[name="tags"]').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
          body: ta.value
        };
        Object.assign(a, out);
        a.updatedAt = StudioDB.now();
        if (isNew) a.createdAt = StudioDB.now();
        await Store.put("articles", a);
        toast("已保存 ✓", "ok");
        m.close();
        if (window.App) App.refresh();
        return a;
      }
    });
  }

  /* ============================================================
     ③ 模板库
     ============================================================ */
  const templates = {
    id: "templates", title: "模板库", icon: "🧩",
    async render(c, term) {
      const tpls = await Store.all("templates");
      const list = term ? tpls.filter((t) => (t.name + t.desc + (t.category || "")).toLowerCase().includes(term.toLowerCase())) : tpls;
      c.appendChild(buildToolbar([el("div", { class: "spacer" }), el("button", { class: "btn btn-primary quick-hide", text: "＋ 新建模板", onclick: () => openForm({
        title: "新建模板", store: "templates", fields: [
          { key: "name", label: "模板名称" }, { key: "platform", label: "适用平台", type: "select", options: [{ value: "all", label: "全平台" }].concat(Object.keys(PLATFORMS).map((p) => ({ value: p, label: PLATFORMS[p].name }))) },
          { key: "category", label: "分类" }, { key: "desc", label: "说明", type: "textarea" },
          { key: "structure", label: "结构(逗号分隔)", type: "tags", default: [] }, { key: "sample", label: "模板正文", type: "textarea" }
        ], onSaved: () => App.refresh()
      }) })]));
      const g = el("div", { class: "grid grid-3" });
      if (list.length === 0) g.appendChild(empty("没有模板"));
      list.forEach((t) => {
        const card = el("div", { class: "card" });
        card.appendChild(el("div", { html: `<div style="display:flex;justify-content:space-between;align-items:center"><h3>${t.emoji || "🧩"} ${escapeHtml(t.name)}</h3>${platTag(t.platform === "all" ? "wechat" : t.platform)}</div><div class="sub">${escapeHtml(t.category || "")}</div>` }));
        card.appendChild(el("p", { class: "sub", text: t.desc || "", style: "margin:8px 0" }));
        card.appendChild(el("div", { html: (t.structure || []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("") }));
        card.appendChild(el("div", { style: "margin-top:12px;display:flex;gap:8px", html:
          `<button class="btn btn-sm btn-ghost" data-act="prev">预览</button>
           <button class="btn btn-sm btn-primary" data-act="use">用此模板写</button>` }));
        card.querySelector('[data-act="prev"]').onclick = () => showTplPreview(t);
        card.querySelector('[data-act="use"]').onclick = () => App.go("articles");
        g.appendChild(card);
      });
      c.appendChild(g);
    }
  };
  function showTplPreview(t) {
    modal({ title: t.name + " · 模板预览", width: 680, body: `<div class="preview-body">${(window.md2html ? window.md2html(t.sample || "") : escapeHtml(t.sample || ""))}</div>` });
  }

  /* ============================================================
     ④ 规划 / 方案
     ============================================================ */
  const plans = {
    id: "plans", title: "规划/方案", icon: "🗺️",
    async render(c, term) {
      const list = await Store.all("plans");
      const data = term ? list.filter((p) => (p.title + p.content + (p.type || "")).toLowerCase().includes(term.toLowerCase())) : list;
      c.appendChild(buildToolbar([el("div", { class: "spacer" }), el("button", { class: "btn btn-primary", text: "＋ 新建规划/方案", onclick: () => openForm({
        title: "新建规划/方案", store: "plans", fields: [
          { key: "title", label: "标题" }, { key: "type", label: "类型", type: "select", options: [["规划", "规划"], ["方案", "方案"], ["复盘", "复盘"], ["其他", "其他"]] },
          { key: "status", label: "状态", type: "select", options: [["进行中", "进行中"], ["已定稿", "已定稿"], ["待启动", "待启动"]] },
          { key: "date", label: "日期", placeholder: "2026-09-30" }, { key: "content", label: "内容", type: "textarea" }
        ], onSaved: () => App.refresh()
      }) })]));
      const g = el("div", { class: "grid grid-2" });
      if (data.length === 0) g.appendChild(empty("还没有规划/方案"));
      data.forEach((p) => {
        const card = el("div", { class: "card" });
        card.appendChild(el("div", { html: `<div style="display:flex;justify-content:space-between;align-items:center"><h3>${escapeHtml(p.title)}</h3><span class="tag">${escapeHtml(p.type || "")}</span></div><div class="sub">${fmtDate(p.date)} ｜ ${escapeHtml(p.status || "")}</div>` }));
        card.appendChild(el("p", { class: "sub", style: "margin-top:8px;white-space:pre-wrap", text: p.content || "" }));
        card.appendChild(el("div", { style: "margin-top:10px;display:flex;gap:8px", html:
          `<button class="btn btn-sm btn-ghost" data-act="e">编辑</button>
           <button class="btn btn-sm btn-ghost" data-act="d">删除</button>` }));
        card.querySelector('[data-act="e"]').onclick = () => openForm({ title: "编辑规划/方案", store: "plans", id: p.id, fields: [
          { key: "title", label: "标题" }, { key: "type", label: "类型", type: "select", options: [["规划", "规划"], ["方案", "方案"], ["复盘", "复盘"], ["其他", "其他"]] },
          { key: "status", label: "状态", type: "select", options: [["进行中", "进行中"], ["已定稿", "已定稿"], ["待启动", "待启动"]] },
          { key: "date", label: "日期" }, { key: "content", label: "内容", type: "textarea" }
        ], onSaved: () => App.refresh() });
        card.querySelector('[data-act="d"]').onclick = () => confirm("确认删除该规划/方案？", () => { Store.del("plans", p.id); App.refresh(); });
        g.appendChild(card);
      });
      c.appendChild(g);
    }
  };

  /* ============================================================
     ⑤ 任务看板
     ============================================================ */
  const tasks = {
    id: "tasks", title: "任务", icon: "✅",
    async render(c, term) {
      const list = await Store.all("tasks");
      const data = term ? list.filter((t) => (t.title + (t.module || "")).toLowerCase().includes(term.toLowerCase())) : list;
      c.appendChild(buildToolbar([el("div", { class: "spacer" }), el("button", { class: "btn btn-primary", text: "＋ 新建任务", onclick: () => openForm({
        title: "新建任务", store: "tasks", fields: [
          { key: "title", label: "任务标题" },
          { key: "status", label: "状态", type: "select", options: Object.keys(TASK_STATUS).map((k) => ({ value: k, label: TASK_STATUS[k] })) },
          { key: "priority", label: "优先级", type: "select", options: Object.keys(PRIORITY).map((k) => ({ value: k, label: PRIORITY[k] })) },
          { key: "module", label: "关联模块", placeholder: "article/plan/goal…" },
          { key: "due", label: "截止日期", placeholder: "2026-10-05" }
        ], onSaved: () => App.refresh()
      }) })]));
      const cols = [["todo", "待办"], ["doing", "进行中"], ["done", "已完成"]];
      const kb = el("div", { class: "kanban" });
      cols.forEach(([st, label]) => {
        const items = data.filter((t) => t.status === st);
        const col = el("div", { class: "kcol", html: `<h5>${label}<span class="count">${items.length}</span></h5>` });
        items.forEach((t) => {
          const k = el("div", { class: "ktask", html:
            `<h6>${escapeHtml(t.title)}</h6>
             <div style="font-size:12px;color:var(--q-muted);margin-top:4px">${fmtDate(t.due)} ｜ ${PRIORITY[t.priority] || "—"}</div>` });
          k.onclick = () => openForm({ title: "编辑任务", store: "tasks", id: t.id, fields: [
            { key: "title", label: "任务标题" },
            { key: "status", label: "状态", type: "select", options: Object.keys(TASK_STATUS).map((k) => ({ value: k, label: TASK_STATUS[k] })) },
            { key: "priority", label: "优先级", type: "select", options: Object.keys(PRIORITY).map((k) => ({ value: k, label: PRIORITY[k] })) },
            { key: "module", label: "关联模块" }, { key: "due", label: "截止日期" }
          ], onSaved: () => App.refresh() });
          col.appendChild(k);
        });
        kb.appendChild(col);
      });
      c.appendChild(kb);
    }
  };

  /* ============================================================
     ⑥ 对标账号
     ============================================================ */
  const benchmarks = {
    id: "benchmarks", title: "对标", icon: "🔭",
    async render(c, term) {
      const list = await Store.all("benchmarks");
      const data = term ? list.filter((b) => (b.name + b.note + (b.url || "")).toLowerCase().includes(term.toLowerCase())) : list;
      c.appendChild(buildToolbar([el("div", { class: "spacer" }), el("button", { class: "btn btn-primary", text: "＋ 新增对标", onclick: () => openForm({
        title: "新增对标账号", store: "benchmarks", fields: [
          { key: "name", label: "账号/主体" }, { key: "url", label: "渠道/链接" },
          { key: "fans", label: "粉丝量" }, { key: "read", label: "阅读/互动基准" }, { key: "note", label: "观察笔记", type: "textarea" }
        ], onSaved: () => App.refresh()
      }) })]));
      if (data.length === 0) { c.appendChild(empty("还没有对标账号")); return; }
      const tbl = el("table", { class: "table" });
      tbl.innerHTML = `<thead><tr><th>账号/主体</th><th>渠道</th><th>粉丝量</th><th>阅读基准</th><th>观察笔记</th><th></th></tr></thead>`;
      const tb = el("tbody");
      data.forEach((b) => {
        const tr = el("tr", { html:
          `<td><b>${escapeHtml(b.name)}</b></td><td>${escapeHtml(b.url || "—")}</td><td>${escapeHtml(b.fans || "—")}</td>
           <td>${escapeHtml(b.read || "—")}</td><td style="max-width:280px">${escapeHtml(b.note || "")}</td>` });
        const acts = el("td", { class: "actions", html: `<button class="btn btn-sm btn-ghost" data-act="e">编辑</button><button class="btn btn-sm btn-ghost" data-act="d">删</button>` });
        tr.appendChild(acts);
        acts.querySelector('[data-act="e"]').onclick = () => openForm({ title: "编辑对标", store: "benchmarks", id: b.id, fields: [
          { key: "name", label: "账号/主体" }, { key: "url", label: "渠道/链接" }, { key: "fans", label: "粉丝量" }, { key: "read", label: "阅读/互动基准" }, { key: "note", label: "观察笔记", type: "textarea" }
        ], onSaved: () => App.refresh() });
        acts.querySelector('[data-act="d"]').onclick = () => confirm("确认删除？", () => { Store.del("benchmarks", b.id); App.refresh(); });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      c.appendChild(tbl);
    }
  };

  /* ============================================================
     ⑦ 目标管理
     ============================================================ */
  const goals = {
    id: "goals", title: "目标", icon: "🎯",
    async render(c, term) {
      const list = await Store.all("goals");
      const data = term ? list.filter((g) => g.title.toLowerCase().includes(term.toLowerCase())) : list;
      c.appendChild(buildToolbar([el("div", { class: "spacer" }), el("button", { class: "btn btn-primary", text: "＋ 新建目标", onclick: () => openForm({
        title: "新建目标", store: "goals", fields: [
          { key: "title", label: "目标名称" }, { key: "type", label: "周期", type: "select", options: [["year", "年度"], ["quarter", "季度"], ["month", "月度"]] },
          { key: "target", label: "目标值", type: "number" }, { key: "current", label: "当前值", type: "number" },
          { key: "unit", label: "单位" }, { key: "deadline", label: "截止日期", placeholder: "2026-12-31" }
        ], onSaved: () => App.refresh()
      }) })]));
      const g = el("div", { class: "grid grid-2" });
      if (data.length === 0) g.appendChild(empty("还没有目标"));
      data.forEach((x) => {
        const pct = Math.min(100, Math.round((x.current / x.target) * 100));
        const cls = pct >= 100 ? "" : pct >= 60 ? "warn" : "danger";
        const card = el("div", { class: "card" });
        card.appendChild(el("div", { html: `<div style="display:flex;justify-content:space-between;align-items:center"><h3>${escapeHtml(x.title)}</h3><span class="tag">${x.type === "year" ? "年度" : x.type === "quarter" ? "季度" : "月度"}</span></div>` }));
        card.appendChild(el("div", { style: "margin:10px 0;display:flex;justify-content:space-between;align-items:baseline", html:
          `<div class="num" style="font-size:26px;color:var(--q-teal);font-weight:800">${x.current}<span style="font-size:14px;color:var(--q-muted)"> / ${x.target} ${escapeHtml(x.unit)}</span></div>
           <div style="font-weight:700;color:${cls === "danger" ? "var(--q-vermilion)" : cls === "warn" ? "#B26A00" : "#0a8f5b"}">${pct}%</div>` }));
        card.appendChild(el("div", { class: "progress " + cls, html: `<i style="width:${pct}%"></i>` }));
        card.appendChild(el("div", { style: "margin-top:10px;display:flex;justify-content:space-between;align-items:center", html: `<span class="sub">截止 ${fmtDate(x.deadline)}</span>` }));
        const acts = el("div", { style: "margin-top:8px;display:flex;gap:8px", html: `<button class="btn btn-sm btn-ghost" data-act="e">编辑</button><button class="btn btn-sm btn-ghost" data-act="d">删除</button>` });
        acts.querySelector('[data-act="e"]').onclick = () => openForm({ title: "编辑目标", store: "goals", id: x.id, fields: [
          { key: "title", label: "目标名称" }, { key: "type", label: "周期", type: "select", options: [["year", "年度"], ["quarter", "季度"], ["month", "月度"]] },
          { key: "target", label: "目标值", type: "number" }, { key: "current", label: "当前值", type: "number" }, { key: "unit", label: "单位" }, { key: "deadline", label: "截止日期" }
        ], onSaved: () => App.refresh() });
        acts.querySelector('[data-act="d"]').onclick = () => confirm("确认删除？", () => { Store.del("goals", x.id); App.refresh(); });
        card.appendChild(acts);
        g.appendChild(card);
      });
      c.appendChild(g);
    }
  };

  /* ============================================================
     ⑧ 设置（含 IMA 配置）
     ============================================================ */
  const settings = {
    id: "settings", title: "设置", icon: "⚙️",
    async render(c) {
      const [brand, ima, platforms] = await Promise.all([Store.get("settings", "brand"), Store.get("settings", "ima"), Store.get("settings", "platforms")]);
      const pList = (platforms && platforms.list) || [];
      c.innerHTML = `
        <div class="card" style="max-width:760px;margin-bottom:16px">
          <h3>🏷️ 品牌信息</h3>
          <p class="sub" style="margin-top:6px">品牌名：<b>${escapeHtml(brand ? brand.name : "祁连说")}</b> ｜ 标语：${escapeHtml(brand ? brand.slogan : "")}</p>
          <p class="sub">主色：${brand && brand.theme ? escapeHtml(JSON.stringify(brand.theme)) : "祁连黛青 / 朱砂"}</p>
        </div>`;

      const imaCard = el("div", { class: "card", style: "max-width:760px;margin-bottom:16px" });
      imaCard.appendChild(el("h3", { text: "🔗 IMA 知识库（云数据库）" }));
      imaCard.appendChild(el("p", { class: "sub", style: "margin:6px 0 14px", text: "把本系统数据当作「云数据库」：一键同步至 IMA 知识库；凭证缺失时自动降级为「导出/导入 JSON 备份」。" }));
      const fBase = field("开放接口 base", el("input", { name: "base", value: (ima && ima.base) || "", placeholder: "https://example.com" }));
      const fToken = field("访问令牌 token", el("input", { name: "token", value: (ima && ima.token) || "", placeholder: "Bearer token" }));
      const fKb = field("知识库 ID (kb)", el("input", { name: "kb", value: (ima && ima.kb) || "0019cf0d09c0629d" }));
      const fFolder = field("目标文件夹 ID", el("input", { name: "folder", value: (ima && ima.folder) || "", placeholder: "如 folder_7466665012888612" }));
      imaCard.append(fBase, fToken, fKb, fFolder);
      const syncInfo = el("p", { class: "sub", id: "imaSyncInfo", text: "最近同步：" + ((ima && ima.lastSync) ? fmtDate(ima.lastSync) : "从未") });
      imaCard.appendChild(syncInfo);
      imaCard.appendChild(el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:12px", html:
        `<button class="btn btn-primary" data-act="save">保存配置</button>
         <button class="btn btn-teal" data-act="sync">↻ 立即同步 IMA</button>
         <button class="btn btn-ghost" data-act="export">⬇ 导出备份</button>
         <button class="btn btn-ghost" data-act="import">⬆ 导入备份</button>` }));
      const fileInput = el("input", { type: "file", accept: "application/json", style: "display:none" });
      imaCard.appendChild(fileInput);
      c.appendChild(imaCard);

      imaCard.querySelector('[data-act="save"]').onclick = async () => {
        const cfg = { base: fBase.querySelector("input").value, token: fToken.querySelector("input").value, kb: fKb.querySelector("input").value, folder: fFolder.querySelector("input").value, auto: false };
        await IMA.setCfg(cfg); toast("IMA 配置已保存 ✓", "ok");
      };
      imaCard.querySelector('[data-act="sync"]').onclick = () => IMA.pushToIMA();
      imaCard.querySelector('[data-act="export"]').onclick = () => IMA.exportJSON();
      imaCard.querySelector('[data-act="import"]').onclick = () => fileInput.click();
      fileInput.onchange = () => { if (fileInput.files[0]) IMA.importJSON(fileInput.files[0]); };

      // 关于
      c.appendChild(el("div", { class: "card", style: "max-width:760px", html:
        `<h3>ℹ️ 关于</h3>
         <p class="sub" style="margin-top:8px">祁连说工作室管理系统 · PWA 可安装应用</p>
         <p class="sub">多平台（公众号/小红书/头条/微博/B站）文章管理 ＋ 规划/方案/任务/对标/目标 一体化。数据本地存于 IndexedDB，云同步走 IMA 知识库。支持 PC 与手机响应式，可「添加到主屏幕」当作 APP 使用。</p>` }));
    }
  };

  /* ---------- 共享小组件 ---------- */
  function field(label, input) { const w = el("div", { class: "field" }); w.appendChild(el("label", { text: label })); w.appendChild(input); return w; }
  function sel(name, options, val) { const s = el("select", { name }); options.forEach((o) => { const op = el("option", { value: o.value, text: o.label }); if (o.value === val) op.selected = true; s.appendChild(op); }); return s; }
  function sectionTitle(txt, onClick) { const h = el("div", { class: "toolbar", style: "margin:22px 0 12px" }); h.appendChild(el("h3", { text: txt, style: "font-size:16px" })); const b = el("button", { class: "btn btn-sm btn-ghost", text: "查看全部 →", onclick: onClick }); h.appendChild(b); return h; }
  function buildToolbar(children) { const t = el("div", { class: "toolbar" }); children.forEach((x) => x && t.appendChild(x)); return t; }
  function segCtl(label, opts, cur, onChange) {
    const seg = el("div", { class: "seg" });
    opts.forEach(([v, l]) => { const b = el("button", { text: l, class: v === cur ? "active" : "" }); b.onclick = () => onChange(v); seg.appendChild(b); });
    const wrap = el("div", { style: "display:flex;align-items:center;gap:8px" });
    wrap.appendChild(el("span", { class: "sub", text: label + "：" })); wrap.appendChild(seg);
    return wrap;
  }
  function paneHead(title, extra) { const h = el("div", { class: "pane-head" }); h.appendChild(el("h4", { text: title })); if (extra) { const w = el("div", { style: "margin-left:auto" }); w.appendChild(extra[0] || extra); h.appendChild(w); } return h; }
  function wrapBtn(btn) { const w = el("div", { style: "margin-top:4px" }); w.appendChild(btn); return w; }
  function empty(txt) { return el("div", { class: "empty", html: `<div class="big">📭</div><div>${escapeHtml(txt)}</div>` }); }

  window.Modules = { dashboard, articles, templates, plans, tasks, benchmarks, goals, settings };
})();
