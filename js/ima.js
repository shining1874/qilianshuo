/* ============================================================
   ima.js · IMA 知识库适配器（把工作室数据当作"云数据库"）
   - 配置项：设置页填写 IMA 开放接口 base / token / folder
   - 上传：snapshot → 聚合为结构化 Markdown → create_media → add_knowledge
   - 兜底：始终可用「导出备份 / 导入备份」(JSON)，由 agent 或人工入库 IMA
   注：IMA 开放接口契约以官方文档为准；凭证错误时会优雅失败并提示改用导出。
   ============================================================ */
(function () {
  const { Store, snapshot, restore } = window.StudioDB;
  const { modal, toast, $ } = window.UI;

  async function getCfg() { const s = await Store.get("settings", "ima"); return s || { base: "", token: "", folder: "", auto: false, lastSync: null }; }
  async function setCfg(c) { await Store.put("settings", Object.assign(await getCfg(), c)); }

  function authHeaders(token) { return { "Content-Type": "application/json", "Authorization": "Bearer " + token }; }

  async function pushToIMA() {
    const cfg = await getCfg();
    if (!cfg.base || !cfg.token) { toast("请先在「设置」填写 IMA 开放接口 base / token", "err"); return false; }
    const snap = await snapshot();
    const md = buildMarkdown(snap);
    try {
      // 1) 申请 media 凭证
      const cm = await fetch(`${cfg.base.replace(/\/$/, "")}/openapi/wiki/v1/create_media`, {
        method: "POST", headers: authHeaders(cfg.token),
        body: JSON.stringify({ knowledge_base_id: cfg.kb || "0019cf0d09c0629d", file_name: "祁连说工作室数据快照.md", file_ext: "md", content_type: "text/markdown", file_size: new Blob([md]).size })
      });
      if (!cm.ok) throw new Error("create_media " + cm.status);
      const cmJson = await cm.json();
      const mediaId = cmJson.media_id || (cmJson.data && cmJson.data.media_id);
      // 2) 入库（文本类可直接随 add_knowledge 提交，具体以官方契约为准）
      const ak = await fetch(`${cfg.base.replace(/\/$/, "")}/openapi/wiki/v1/add_knowledge`, {
        method: "POST", headers: authHeaders(cfg.token),
        body: JSON.stringify({ knowledge_base_id: cfg.kb || "0019cf0d09c0629d", folder_id: cfg.folder || "", media_id: mediaId, file_content: md, duplicate_name_strategy: "REPLACE" })
      });
      if (!ak.ok) throw new Error("add_knowledge " + ak.status);
      await setCfg({ lastSync: new Date().toISOString() });
      toast("已同步至 IMA 知识库 ✓", "ok");
      return true;
    } catch (e) {
      console.error(e);
      toast("IMA 同步失败：" + e.message + "（可改用导出备份）", "err");
      return false;
    }
  }

  async function pullFromIMA() {
    const cfg = await getCfg();
    if (!cfg.base || !cfg.token) { toast("请先在「设置」填写 IMA 开放接口 base / token", "err"); return; }
    try {
      const r = await fetch(`${cfg.base.replace(/\/$/, "")}/openapi/wiki/v1/get_knowledge_list`, {
        method: "POST", headers: authHeaders(cfg.token),
        body: JSON.stringify({ knowledge_base_id: cfg.kb || "0019cf0d09c0629d", folder_id: cfg.folder || "", limit: 50, cursor: "" })
      });
      if (!r.ok) throw new Error("list " + r.status);
      const j = await r.json();
      toast("IMA 列表获取成功，可识别条目 " + ((j.knowledge_list || []).length), "ok");
      // 真实解析需按 IMA 文档取 media 正文再 restore()，此处给出入口与提示
      return j;
    } catch (e) { console.error(e); toast("IMA 拉取失败：" + e.message, "err"); }
  }

  function buildMarkdown(snap) {
    let md = `# 祁连说工作室数据快照\n\n> 导出时间：${snap._meta.exportedAt}\n\n`;
    for (const col of ["goals", "benchmarks", "plans", "tasks", "articles", "templates"]) {
      md += `\n## ${LABEL[col] || col}（${snap[col].length}）\n\n`;
      snap[col].forEach((it) => { md += "- " + JSON.stringify(it) + "\n"; });
    }
    return md;
  }
  const LABEL = { goals: "目标", benchmarks: "对标", plans: "规划/方案", tasks: "任务", articles: "文章", templates: "模板" };

  function exportJSON() {
    snapshot().then((snap) => {
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "祁连说工作室数据_" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      toast("已导出备份 JSON", "ok");
    });
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try { const snap = JSON.parse(reader.result); await restore(snap); toast("已从备份恢复 ✓", "ok"); if (window.App) App.refresh(); }
      catch (e) { toast("备份解析失败：" + e.message, "err"); }
    };
    reader.readAsText(file);
  }

  window.IMA = { getCfg, setCfg, pushToIMA, pullFromIMA, exportJSON, importJSON };
})();
