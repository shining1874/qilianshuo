/* ============================================================
   push.js · 多平台草稿箱推送适配器
   - 一键推送入口：Push.push(article)
   - 微信公众号：自 2026-09-28 起草稿箱 API 暂停，降级为
     「上传 IMA 知识库 + 含图文章包(HTML) 发邮箱」
   - 其他平台：打开对应创作者后台并把排版内容复制到剪贴板，
     由用户在后台粘贴发布（适配层，避免硬编码未公开契约）
   ============================================================ */
(function () {
  const { PLATFORMS, modal, toast, el } = window.UI;
  const { pushToIMA } = window.IMA;

  /* 各平台官方创作者/发布入口（真实可达） */
  const creatorUrls = {
    wechat: "https://mp.weixin.qq.com/",
    xhs: "https://creator.xiaohongshu.com/publish/publish",
    toutiao: "https://mp.toutiao.com/profile_v4/center/publish",
    weibo: "https://weibo.com/publish",
    bili: "https://member.bilibili.com/platform/upload/video/frame"
  };

  /* 把文章排版为适合各平台粘贴的文本 */
  function formatForPlatform(article) {
    const p = article.platform;
    const title = article.title || "";
    const body = article.body || "";
    const tags = (article.tags || []).map((t) => "#" + t).join(" ");
    let head = "";
    if (p === "xhs") head = title + "\n\n";
    else if (p === "weibo") head = title + "\n";
    else head = (title ? "# " + title + "\n\n" : "");
    const foot = tags ? ("\n\n" + tags) : "";
    return head + body + foot;
  }

  /* 复制到剪贴板（兼容 file:// 等非安全上下文） */
  function copyText(text) {
    return new Promise((res) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(() => res(true)).catch(() => fallback());
        } else fallback();
      } catch (e) { fallback(); }
      function fallback() {
        try {
          const ta = document.createElement("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); ta.remove();
          res(true);
        } catch (e2) { res(false); }
      }
    });
  }

  /* 打开创作者后台 + 复制内容（通用适配） */
  async function copyAndOpen(article) {
    const text = formatForPlatform(article);
    const ok = await copyText(text);
    const url = creatorUrls[article.platform];
    if (url) window.open(url, "_blank");
    const name = (PLATFORMS[article.platform] || {}).name || "平台";
    return { ok: true, msg: `${name}：内容已${ok ? "复制" : "生成"}，已打开创作者后台，粘贴即可发布` };
  }

  /* 生成含图文章包 HTML 并下载（用于发邮箱） */
  function buildArticleHTML(article) {
    const md = window.md2html ? window.md2html(article.body || "") : (article.body || "");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${escapeText(article.title || "祁连说文章")}</title>
<style>body{font-family:"Microsoft YaHei",system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 18px;color:#1c2b33;line-height:1.9}
h1{color:#2C5364;border-bottom:3px solid #C0392B;padding-bottom:10px}h2{color:#2C5364;border-left:4px solid #C0392B;padding-left:10px}
blockquote{border-left:3px solid #C9A86A;background:#F7F3EA;padding:8px 14px;color:#6b7a82}
img{max-width:100%;border-radius:10px;margin:12px 0}.meta{color:#94a3ab;font-size:13px;margin-top:18px;border-top:1px solid #eee;padding-top:10px}
.tag{display:inline-block;background:#F7F3EA;border:1px solid #ccc;color:#6b7a82;padding:2px 9px;border-radius:6px;margin:2px 4px 0 0;font-size:12px}</style></head>
<body>
<h1>${escapeText(article.title || "")}</h1>
${md}
<div class="meta">平台：${(PLATFORMS[article.platform] || {}).name || article.platform} ｜ 标签：${(article.tags || []).map(escapeText).join(" ")}<br>本文由「祁连说工作室管理系统」导出，含配图请按需补充后发至 wp1874@qq.com。</div>
</body></html>`;
  }
  function escapeText(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function downloadArticlePkg(article) {
    const blob = new Blob([buildArticleHTML(article)], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (article.title || "祁连说文章") + ".html";
    a.click();
    toast("已导出含图文章包，请发至 wp1874@qq.com", "ok");
  }

  /* 公众号：API 暂停 → 降级流程 */
  function showWechatPaused(article) {
    const m = modal({
      title: "微信公众号 · 草稿箱推送",
      width: 560,
      body: `<div style="font-size:14px;line-height:1.85">
        <p style="margin-bottom:12px">⚠️ <b>公众号草稿箱 API 自 2026-09-28 起暂停使用</b>，一键推送暂不可用。</p>
        <p>按既定交付流程，本文改为：</p>
        <ol style="margin:8px 0 12px 18px;line-height:2">
          <li>① <b>上传 IMA 知识库</b>（公众号版 + 头条版）</li>
          <li>② <b>含配图文章打包发邮箱</b> <code style="background:#F7F3EA;padding:1px 6px;border-radius:5px">wp1874@qq.com</code></li>
        </ol>
        <p class="hint" style="color:#6b7a82;font-size:12.5px">微信端群发仍需在后台手动操作，我会在收到反馈后迭代优化。</p>
      </div>`,
      foot: [
        el("button", { class: "btn btn-ghost", text: "仅关闭", onclick: () => m.close() }),
        el("button", { class: "btn btn-primary", text: "① 上传 IMA 知识库", onclick: async () => { m.close(); await pushToIMA(); } }),
        el("button", { class: "btn btn-teal", text: "② 下载含图包(HTML)", onclick: () => { m.close(); downloadArticlePkg(article); } })
      ]
    });
  }

  const adapters = {
    wechat(article) { showWechatPaused(article); return { ok: true, msg: "已按降级流程处理公众号推送" }; },
    _generic: copyAndOpen
  };

  async function push(article) {
    if (!article) { toast("没有可推送的文章", "err"); return; }
    const fn = adapters[article.platform] || adapters._generic;
    const res = await fn(article);
    if (res && res.msg) toast(res.msg, res.ok ? "ok" : "");
    return res;
  }

  window.Push = { push, formatForPlatform, copyAndOpen, downloadArticlePkg, creatorUrls };
})();
