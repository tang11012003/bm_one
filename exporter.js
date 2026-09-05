/**
 * ProtoHub 单文件离线交付包导出器 (100% 独立自包含，无跨域及脚本截断问题)
 */
class Exporter {
  constructor(apiBase) {
    this.apiBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:9000');
  }

  async fetchProjectInfo() {
    try {
      const res = await fetch(`${this.apiBase}/api/project/info`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  async fetchPageAnnotations(pageFile) {
    try {
      const res = await fetch(`${this.apiBase}/api/annotations?file=${encodeURIComponent(pageFile)}`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  async generateSingleHtmlBundle(selectedPages) {
    let pages = selectedPages;
    if (!pages || pages.length === 0) {
      const info = await this.fetchProjectInfo();
      pages = info?.pages?.filter(p => p.visible !== false) || [];
    }

    // 获取所有页面的 HTML 源码和标注数据
    const pageDataMap = {};
    for (const page of pages) {
      try {
        let htmlText = page.originalHtml || page.htmlContent || '';
        let annotations = page.annotations || [];
        let globalSections = page.globalSections || [];
        let globalDoc = page.globalDoc || {};

        if (!htmlText && this.apiBase) {
          try {
            const htmlRes = await fetch(`${this.apiBase}/${page.path}`);
            if (htmlRes.ok) htmlText = await htmlRes.text();
            const annoRes = await this.fetchPageAnnotations(page.path);
            if (annoRes) {
              annotations = annoRes.annotations || annotations;
              globalSections = annoRes.globalSections || globalSections;
              globalDoc = annoRes.globalDoc || globalDoc;
            }
          } catch (fetchErr) {}
        }

        pageDataMap[page.id] = {
          id: page.id,
          name: page.name || page.id,
          path: page.path || `${page.id}.html`,
          html: htmlText,
          annotations: annotations,
          globalSections: globalSections,
          globalDoc: globalDoc
        };
      } catch (e) {
        console.error('加载页面数据失败:', page.name, e);
      }
    }

    // 关键：对 JSON 进行防 HTML 解析截断安全转义
    const safeDataJson = JSON.stringify(pageDataMap)
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');

    const firstPageName = pages[0]?.name || 'ProtoHub';

    const bundleTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${firstPageName} · 产品需求与原型交付评审物</title>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<style>
  :root {
    --primary: #2563eb;
    --primary-light: #eff6ff;
    --border: #e2e8f0;
    --bg-page: #f1f5f9;
    --text-main: #0f172a;
    --text-muted: #64748b;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, sans-serif;
    background: var(--bg-page);
    color: var(--text-main);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .top-hub {
    height: 52px;
    background: #ffffff;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
    z-index: 100;
  }
  .brand-box { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .badge { background: var(--primary); color: #fff; font-size: 11px; font-weight: 800; padding: 3px 7px; border-radius: 4px; letter-spacing: 0.5px; }
  .brand-title { font-size: 14px; font-weight: 700; color: #1e293b; }
  .tab-chips { display: flex; align-items: center; gap: 6px; flex: 1; margin: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .tab-chips::-webkit-scrollbar { display: none; }
  .tab-chip {
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 12.5px;
    font-weight: 500;
    background: #f8fafc;
    color: var(--text-muted);
    border: 1px solid #cbd5e1;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .tab-chip:hover { background: #e2e8f0; color: #1e293b; }
  .tab-chip.active { background: var(--primary); color: #ffffff; border-color: var(--primary); font-weight: 700; box-shadow: 0 2px 8px rgba(37,99,235,0.25); }
  .view-toggle { display: flex; background: #f1f5f9; padding: 3px; border-radius: 8px; border: 1px solid var(--border); flex-shrink: 0; }
  .view-btn { border: none; background: transparent; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 6px; color: var(--text-muted); transition: all 0.15s; }
  .view-btn.active { background: #ffffff; color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.06); font-weight: 700; }
  .main-wrap { flex: 1; display: flex; overflow: hidden; }
  .canvas { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; overflow: hidden; background: var(--bg-page); }
  .frame-box { width: 100%; height: 100%; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 8px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .frame-box.mobile { width: 390px; height: 844px; border-radius: 44px; box-shadow: 0 0 0 12px #1e293b, 0 25px 50px -12px rgba(0,0,0,0.35); }
  iframe { width: 100%; height: 100%; border: none; display: block; }
  .sidebar { width: 380px; background: #ffffff; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .sidebar-header { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .sidebar-title { font-size: 13.5px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 6px; }
  .sidebar-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .doc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 6px; }
  .doc-title { font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .doc-content { font-size: 12px; color: #475569; line-height: 1.6; white-space: pre-wrap; }
  .card { background: #ffffff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
  .card:hover { border-color: #93c5fd; box-shadow: 0 3px 10px rgba(37,99,235,0.08); }
  .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .tag { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
  .tag.add { background: #dcfce7; color: #15803d; }
  .tag.modify { background: #dbeafe; color: #1d4ed8; }
  .tag.rule { background: #fef3c7; color: #b45309; }
  .tag.delete { background: #fee2e2; color: #b91c1c; }
  .card-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .card-desc { font-size: 12px; color: #475569; line-height: 1.5; white-space: pre-wrap; }
  .card-sdd { font-size: 11px; color: #2563eb; background: #eff6ff; padding: 2px 6px; border-radius: 4px; margin-top: 6px; display: inline-block; }
</style>
</head>
<body>
  <header class="top-hub">
    <div class="brand-box">
      <span class="badge">ProtoHub 交付版</span>
      <span class="brand-title">需求与原型交互工作台</span>
    </div>
    <div class="tab-chips" id="tabContainer"></div>
    <div class="view-toggle">
      <button class="view-btn active" id="btnMobile" onclick="setViewMode('mobile')">📱 移动端 (390px)</button>
      <button class="view-btn" id="btnPc" onclick="setViewMode('pc')">💻 PC 宽屏</button>
    </div>
  </header>
  <main class="main-wrap">
    <div class="canvas">
      <div class="frame-box mobile" id="frameBox">
        <iframe id="protoIframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>
    </div>
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title">
          <span class="material-icons" style="font-size: 18px; color: #2563eb;">description</span>
          <span>需求变更与业务说明</span>
        </div>
        <span id="annoBadge" style="font-size: 11px; font-weight: 700; background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 12px;">0 条</span>
      </div>
      <div class="sidebar-body" id="sidebarContent"></div>
    </aside>
  </main>

  <script id="protoPageBundleData" type="application/json">
${safeDataJson}
  </script>

  <script>
    let PAGE_DATA = {};
    try {
      const dataEl = document.getElementById('protoPageBundleData');
      PAGE_DATA = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error('解析离线数据包异常:', e);
    }

    let activePageId = Object.keys(PAGE_DATA)[0] || '';

    function renderTabs() {
      const container = document.getElementById('tabContainer');
      const entries = Object.entries(PAGE_DATA);
      if (entries.length <= 1) {
        container.style.display = 'none';
        return;
      }
      container.style.display = 'flex';
      container.innerHTML = entries.map(([id, p]) => \`
        <div class="tab-chip \${id === activePageId ? 'active' : ''}" onclick="switchPage('\${id}')">
          \${p.name || id}
        </div>
      \`).join('');
    }

    function switchPage(pageId) {
      activePageId = pageId;
      renderTabs();
      const page = PAGE_DATA[pageId];
      if (!page) return;

      const iframe = document.getElementById('protoIframe');
      iframe.srcdoc = page.html || '<div style="padding:20px;">页面内容为空</div>';

      const sidebarContent = document.getElementById('sidebarContent');
      const annoBadge = document.getElementById('annoBadge');
      
      let html = '';

      // 1. 渲染全局业务文档
      const docs = page.globalSections || [];
      if (docs.length > 0) {
        html += '<div style="font-size:12px; font-weight:700; color:#94a3b8; margin-bottom:4px; text-transform:uppercase;">📖 全局业务需求</div>';
        docs.forEach((d, i) => {
          html += \`
            <div class="doc-box">
              <div class="doc-title">
                <span style="width:6px; height:6px; border-radius:50%; background:#2563eb; display:inline-block;"></span>
                <span>\${d.title || ('章节 ' + (i + 1))}</span>
              </div>
              <div class="doc-content">\${d.content || '暂无描述'}</div>
            </div>
          \`;
        });
        html += '<div style="height:1px; background:#e2e8f0; margin:8px 0 12px 0;"></div>';
      }

      // 2. 渲染元素打点标注
      const annos = page.annotations || [];
      annoBadge.textContent = annos.length + ' 条';

      if (annos.length > 0) {
        html += '<div style="font-size:12px; font-weight:700; color:#94a3b8; margin-bottom:4px; text-transform:uppercase;">🎯 界面打点需求变更</div>';
        annos.forEach((a, i) => {
          const typeClass = a.type || 'modify';
          const typeName = a.typeLabel || (a.type === 'add' ? '新增功能' : (a.type === 'rule' ? '业务规则' : (a.type === 'delete' ? '删除功能' : '修改逻辑')));
          html += \`
            <div class="card">
              <div class="card-top">
                <span class="tag \${typeClass}">\${typeName}</span>
                <span style="font-size:11px; font-weight:700; color:#94a3b8;">#\${i + 1}</span>
              </div>
              <div class="card-title">\${a.title || a.name || '需求项'}</div>
              <div class="card-desc">\${a.desc || a.summary || a.content || '暂无详细描述'}</div>
              \${a.sdd?.blockId ? \`<div class="card-sdd">🔗 SDD: \${a.sdd.blockId}</div>\` : ''}
            </div>
          \`;
        });
      } else if (docs.length === 0) {
        html = '<div style="color:#94a3b8; font-size:13px; text-align:center; padding:40px 0;">当前页面暂无需求变更批注</div>';
      }

      sidebarContent.innerHTML = html;
    }

    function setViewMode(mode) {
      const box = document.getElementById('frameBox');
      document.getElementById('btnMobile').className = 'view-btn ' + (mode === 'mobile' ? 'active' : '');
      document.getElementById('btnPc').className = 'view-btn ' + (mode === 'pc' ? 'active' : '');
      box.className = 'frame-box ' + (mode === 'mobile' ? 'mobile' : 'pc');
    }

    window.addEventListener('DOMContentLoaded', () => {
      renderTabs();
      if (activePageId) switchPage(activePageId);
    });
  </script>
</body>
</html>`;

    return bundleTemplate;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Exporter;
}
if (typeof window !== 'undefined') {
  window.Exporter = Exporter;
}