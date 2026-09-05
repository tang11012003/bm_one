/**
 * 单文件打包导出与局域网二维码分发器
 */
class Exporter {
  constructor(apiBase) {
    this.apiBase = apiBase;
  }

  async fetchProjectInfo() {
    const res = await fetch(`${this.apiBase}/api/project/info`);
    return await res.json();
  }

  async fetchPageAnnotations(pageFile) {
    const res = await fetch(`${this.apiBase}/api/annotations?file=${encodeURIComponent(pageFile)}`);
    return await res.json();
  }

  async generateSingleHtmlBundle(selectedPages) {
    const projectInfo = await this.fetchProjectInfo();
    const pages = selectedPages || projectInfo.pages.filter(p => p.visible !== false);

    // 获取所有页面的 HTML 源码和标注
    const pageDataMap = {};
    for (const page of pages) {
      try {
        const htmlRes = await fetch(`${this.apiBase}/${page.path}`);
        const htmlText = await htmlRes.text();
        const annoRes = await this.fetchPageAnnotations(page.path);
        pageDataMap[page.id] = {
          name: page.name,
          path: page.path,
          html: htmlText,
          annotations: annoRes.annotations || []
        };
      } catch (e) {
        console.error('加载页面失败:', page.name, e);
      }
    }

    const bundleTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pages[0]?.name || 'ProtoHub'} · 产品需求与变更评审交付物</title>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<style>
  :root {
    --primary: #2563eb;
    --border: #e2e8f0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #edf0f6;
    color: #0f172a;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .top-hub {
    height: 50px;
    background: #ffffff;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }
  .brand { display: flex; align-items: center; gap: 8px; }
  .badge { background: #2563eb; color: #fff; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
  .title { font-size: 14px; font-weight: 700; color: #1e293b; }
  .tab-chips { display: flex; align-items: center; gap: 6px; flex: 1; margin: 0 16px; overflow-x: auto; scrollbar-width: none; }
  .tab-chip {
    padding: 5px 12px;
    border-radius: 16px;
    font-size: 12.5px;
    font-weight: 500;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s;
  }
  .tab-chip.active { background: #2563eb; color: #fff; border-color: #2563eb; font-weight: 700; }
  .view-toggle { display: flex; background: #f1f5f9; padding: 3px; border-radius: 8px; border: 1px solid var(--border); }
  .view-btn { border: none; background: transparent; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 6px; color: #64748b; }
  .view-btn.active { background: #fff; color: #0f172a; }
  .main-wrap { flex: 1; display: flex; overflow: hidden; }
  .canvas { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; overflow: hidden; background: #edf0f6; }
  .frame-box { width: 100%; height: 100%; transition: all 0.25s; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .frame-box.mobile { width: 390px; height: 844px; border-radius: 44px; box-shadow: 0 0 0 12px #1e293b, 0 25px 50px -12px rgba(0,0,0,0.35); }
  iframe { width: 100%; height: 100%; border: none; }
  .sidebar { width: 360px; background: #fff; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; padding: 16px; gap: 12px; }
  .card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
  .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .tag { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .tag.add { background: #dcfce7; color: #15803d; }
  .tag.modify { background: #dbeafe; color: #1d4ed8; }
  .tag.logic { background: #fef3c7; color: #b45309; }
  .tag.delete { background: #fee2e2; color: #b91c1c; }
  .card-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .card-desc { font-size: 12px; color: #475569; line-height: 1.5; }
</style>
</head>
<body>
  <header class="top-hub">
    <div class="brand">
      <span class="badge">ProtoHub 交付版</span>
      <span class="title">交互原型与需求变更说明</span>
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
        <iframe id="protoIframe"></iframe>
      </div>
    </div>
    <aside class="sidebar" id="annoSidebar">
      <div style="font-size:14px; font-weight:700; padding-bottom:8px; border-bottom:1px solid #eee;">需求与变更导览</div>
      <div id="cardList" style="display:flex; flex-direction:column; gap:10px;"></div>
    </aside>
  </main>

  <script>
    const PAGE_DATA = ${JSON.stringify(pageDataMap, null, 2)};
    let activePageId = Object.keys(PAGE_DATA)[0] || '';

    function renderTabs() {
      const container = document.getElementById('tabContainer');
      container.innerHTML = Object.entries(PAGE_DATA).map(([id, p]) => \`
        <div class="tab-chip \${id === activePageId ? 'active' : ''}" onclick="switchPage('\${id}')">
          \${p.name}
        </div>
      \`).join('');
    }

    function switchPage(pageId) {
      activePageId = pageId;
      renderTabs();
      const page = PAGE_DATA[pageId];
      if (!page) return;

      const iframe = document.getElementById('protoIframe');
      const blob = new Blob([page.html], { type: 'text/html;charset=utf-8' });
      iframe.src = URL.createObjectURL(blob);

      const cardList = document.getElementById('cardList');
      if (!page.annotations || page.annotations.length === 0) {
        cardList.innerHTML = '<div style="color:#94a3b8; font-size:13px; text-align:center; padding:30px 0;">当前页面暂无变更批注</div>';
      } else {
        cardList.innerHTML = page.annotations.map(a => \`
          <div class="card">
            <div class="card-top">
              <span class="tag \${a.type || 'modify'}">\${a.typeLabel || a.type || '变更'}</span>
              <span style="font-size:11px; color:#94a3b8;">#\${a.id || ''}</span>
            </div>
            <div class="card-title">\${a.title || a.name || '变更项'}</div>
            <div class="card-desc">\${a.desc || a.summary || a.rule || ''}</div>
          </div>
        \`).join('');
      }
    }

    function setViewMode(mode) {
      const box = document.getElementById('frameBox');
      document.getElementById('btnMobile').className = 'view-btn ' + (mode === 'mobile' ? 'active' : '');
      document.getElementById('btnPc').className = 'view-btn ' + (mode === 'pc' ? 'active' : '');
      box.className = 'frame-box ' + (mode === 'mobile' ? 'mobile' : 'pc');
    }

    renderTabs();
    if (activePageId) switchPage(activePageId);
  </script>
</body>
</html>`;

    return bundleTemplate;
  }
}

window.Exporter = Exporter;
