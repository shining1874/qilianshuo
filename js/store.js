/* ============================================================
   store.js · 本地数据层（IndexedDB）+ 种子数据
   运营库在本机 IndexedDB；IMA 适配器见 ima.js
   ============================================================ */
(function () {
  const DB_NAME = "qilian_studio";
  const DB_VERSION = 1;
  const STORES = ["articles", "templates", "plans", "tasks", "benchmarks", "goals", "settings", "meta"];
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" }); });
      };
      req.onsuccess = () => { _db = req.result; res(_db); };
      req.onerror = () => rej(req.error);
    });
  }

  function tx(store, mode) { return open().then((db) => db.transaction(store, mode).objectStore(store)); }

  const Store = {
    async all(store) { const o = await tx(store, "readonly"); return new Promise((res, rej) => { const r = o.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async get(store, id) { const o = await tx(store, "readonly"); return new Promise((res, rej) => { const r = o.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async put(store, val) { const o = await tx(store, "readwrite"); return new Promise((res, rej) => { const r = o.put(val); r.onsuccess = () => res(val); r.onerror = () => rej(r.error); }); },
    async del(store, id) { const o = await tx(store, "readwrite"); return new Promise((res, rej) => { const r = o.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
    async clear(store) { const o = await tx(store, "readwrite"); return new Promise((res, rej) => { const r = o.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
  };

  const uid = (p = "id") => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();

  /* ---------- 种子数据 ---------- */
  const SEED = {
    settings: [
      { id: "brand", name: "祁连说", slogan: "祁连山下，说出河西每一寸变化", theme: { teal: "#2C5364", vermilion: "#C0392B" } },
      { id: "ima", base: "", token: "", folder: "", auto: false, lastSync: null },
      { id: "platforms", list: ["wechat", "xhs", "toutiao", "weibo", "bili"] }
    ],
    templates: [
      { id: "tpl_project", name: "深度项目篇", platform: "all", category: "公众号/头条", emoji: "🏗️",
        desc: "产业纵深长文：事实切入→数据→民生→环保→展望",
        structure: ["标题", "事实切入", "背景与数据", "民生视角", "环保举措", "深度观察"],
        sample: "# 祁连说 | {标题}\n\n（事实切入：用具体场景开篇）\n\n## 背景梳理\n（数据说话）\n\n## 民生视角\n（就业/出行/生活成本）\n\n## 环保举措\n（节水/减碳/生态修复，给硬数据）\n\n## 深度观察\n（真诚展望）" },
      { id: "tpl_xhs", name: "小红书种草", platform: "xhs", category: "小红书", emoji: "📕",
        desc: "第一人称体验 + 情绪钩子 + 多图",
        structure: ["吸睛标题", "真实体验", "干货清单", "避坑提示", "互动引导"],
        sample: "# {地名}攻略｜本地人都不一定知道的{n}个宝藏\n\n📍 今天带大家走进…\n\n✅ 必看清单\n1. …\n2. …\n\n⚠️ 避坑：…\n\n#河西走廊 #旅行攻略" },
      { id: "tpl_weibo", name: "微博话题", platform: "weibo", category: "微博", emoji: "🔥",
        desc: "短平快 + 强观点 + 话题标签",
        structure: ["核心观点", "一句爆点", "话题标签"],
        sample: "{一句话观点}。#{地名}# #{话题}#" },
      { id: "tpl_bili", name: "B站脚本", platform: "bili", category: "B站", emoji: "📺",
        desc: "分镜脚本：开场钩子→正文→结尾互动",
        structure: ["开场钩子", "正文分镜", "结尾互动"],
        sample: "【开场】你绝对想不到，在{地名}…\n【正文】分镜1：… 分镜2：…\n【结尾】点赞关注，下期带你…" },
      { id: "tpl_toutiao", name: "头条快讯", platform: "toutiao", category: "今日头条", emoji: "⚡",
        desc: "数据前置 + 客观冷静",
        structure: ["数据钩子标题", "核心事实", "影响解读"],
        sample: "# {地名}砸{X}亿建{项目}：意味着什么\n\n（核心事实）\n\n（影响解读）" }
    ],
    goals: [
      { id: "g1", title: "年度文章发布", type: "year", target: 300, current: 214, unit: "篇", deadline: "2026-12-31" },
      { id: "g2", title: "公众号粉丝", type: "year", target: 50000, current: 38200, unit: "人", deadline: "2026-12-31" },
      { id: "g3", title: "多平台矩阵开通", type: "quarter", target: 5, current: 3, unit: "平台", deadline: "2026-12-31" },
      { id: "g4", title: "月度爆款(过万阅读)", type: "month", target: 8, current: 5, unit: "篇", deadline: "2026-10-31" }
    ],
    benchmarks: [
      { id: "b1", name: "大贺频道", url: "参考对标", fans: "—", read: "深度长文标杆", note: "卖公信力不卖流量；B端项目制。" },
      { id: "b2", name: "嘉峪关圈子", url: "公众号", fans: "8.1万", read: "头条均阅6279", note: "区域头部号。" },
      { id: "b3", name: "我家在酒泉", url: "公众号", fans: "—", read: "头条均阅2322", note: "本地生活向。" },
      { id: "b4", name: "金昌发布", url: "公众号", fans: "—", read: "头条均阅1020", note: "政务权威源。" }
    ],
    tasks: [
      { id: "k1", title: "玉门410亿超级工厂 项目篇成稿", module: "article", status: "doing", priority: "high", due: "2026-09-30" },
      { id: "k2", title: "河西走廊Q4选题雷达复盘", module: "plan", status: "todo", priority: "mid", due: "2026-10-05" },
      { id: "k3", title: "小红书矩阵账号开通", module: "goal", status: "todo", priority: "mid", due: "2026-10-15" },
      { id: "k4", title: "张掖抽水蓄能 数据卡配图", module: "article", status: "done", priority: "low", due: "2026-09-26" }
    ],
    plans: [
      { id: "p1", title: "祁连说 2026 Q4 内容方阵", type: "规划", status: "进行中", date: "2026-09-20",
        content: "主线1 能源5 : 主线2 交通3 : 支线2。\n每月不少于 8 篇产业纵深稿，覆盖制造转移/数字经济/低空/文旅。" },
      { id: "p2", title: "公众号→多平台分发方案", type: "方案", status: "已定稿", date: "2026-09-22",
        content: "公众号+头条双版本自动拆分；小红书/B站/微博按模板二次创作。环境议题作底层逻辑嵌入。" }
    ],
    articles: [
      { id: "a1", title: "永昌抽水蓄能下水库开工：河西建绿色充电宝", platform: "wechat", status: "published",
        tpl: "tpl_project", tags: ["抽水蓄能", "永昌", "双碳"], seo: "永昌 抽水蓄能 绿色充电宝",
        cover: "⚡", body: "# 祁连说 | 95亿、120万千瓦：永昌抽水蓄能电站下水库开工\n\n9月16日，金昌市永昌县…", createdAt: now(), updatedAt: now() },
      { id: "a2", title: "临泽：戈壁滩上建成国内首条GWh级钠电产线", platform: "toutiao", status: "draft",
        tpl: "tpl_toutiao", tags: ["钠电", "临泽", "储能"], seo: "临泽 钠电 GWh", cover: "🔋",
        body: "# 临泽砸XX亿建钠电产线：意味着什么\n\n（核心事实）", createdAt: now(), updatedAt: now() }
    ]
  };

  async function seedIfEmpty() {
    const meta = await Store.get("meta", "seeded").catch(() => null);
    if (meta && meta.value) return false;
    for (const store of Object.keys(SEED)) {
      const exist = await Store.all(store);
      if (exist.length === 0) { for (const it of SEED[store]) await Store.put(store, it); }
    }
    await Store.put("meta", { id: "seeded", value: true, at: now() });
    return true;
  }

  /* 序列化为可同步到 IMA 的快照 */
  async function snapshot() {
    const out = {};
    for (const s of ["articles", "templates", "plans", "tasks", "benchmarks", "goals", "settings"]) out[s] = await Store.all(s);
    out._meta = { exportedAt: now(), app: "祁连说工作室管理系统", version: DB_VERSION };
    return out;
  }
  async function restore(snap) {
    for (const s of ["articles", "templates", "plans", "tasks", "benchmarks", "goals", "settings"]) {
      if (!snap[s]) continue;
      await Store.clear(s);
      for (const it of snap[s]) await Store.put(s, it);
    }
    await Store.put("meta", { id: "seeded", value: true, at: now() });
  }

  window.Store = Store;
  window.StudioDB = { open, seedIfEmpty, snapshot, restore, uid, now };
})();
