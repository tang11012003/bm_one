/**
 * ProtoHub 桌面端与 Web 端工作台主逻辑 (100% 官方原生引擎运行时直载)
 */
class WorkbenchApp {
  constructor() {
    this.serverPort = 9000;
    this.apiBase = `http://127.0.0.1:${this.serverPort}`;
    this.currentWorkspace = null;
    this.projectInfo = null;
    this.token = '';
    this.activePage = null;
    this.currentAnnotations = [];
    this.isInspectMode = false;
    this.viewMode = 'mobile'; // 'mobile' | 'pc'

    this.exporter = new Exporter(this.apiBase);
    this.engine = new WebAnnotationEngine();

    this.initDOMElements();
    this.bindEvents();
    this.initApp();
  }

  initDOMElements() {
    this.dom = {
      launcherScreen: document.getElementById('launcher-screen'),
      btnOpenFolder: document.getElementById('btn-open-folder'),
      btnLoadDemo: document.getElementById('btn-load-demo'),
      webFolderInput: document.getElementById('web-folder-input'),
      recentList: document.getElementById('recent-list'),
      
      folderName: document.getElementById('project-folder-name'),
      btnSwitchProject: document.getElementById('btn-switch-project'),
      tabsContainer: document.getElementById('tabs-container'),
      previewIframe: document.getElementById('preview-iframe'),
      frameContainer: document.getElementById('device-frame-container'),
      
      btnToggleInspect: document.getElementById('btn-toggle-inspect'),
      btnManagePages: document.getElementById('btn-manage-pages'),
      btnShareLan: document.getElementById('btn-share-lan'),
      btnExportSingle: document.getElementById('btn-export-single'),
      btnViewMobile: document.getElementById('btn-view-mobile'),
      btnViewPc: document.getElementById('btn-view-pc'),
      
      annotationList: document.getElementById('annotation-list'),
      annotationCount: document.getElementById('annotation-count'),
      sidebar: document.querySelector('.studio-sidebar'),
      docsSidebar: document.getElementById('docs-sidebar'),
      docsSidebarContent: document.getElementById('docs-content-list'),

      // 页面管理弹窗
      modalPages: document.getElementById('modal-pages'),
      pageManageList: document.getElementById('page-manage-list'),
      inputNewPagePath: document.getElementById('new-page-path'),
      inputNewPageName: document.getElementById('new-page-name'),
      btnAddCustomPage: document.getElementById('btn-add-custom-page'),
      btnClosePagesModal: document.getElementById('btn-close-pages-modal'),
      btnSavePagesConfig: document.getElementById('btn-save-pages-config'),

      // 手机扫码与演示弹窗
      modalShare: document.getElementById('modal-share'),
      qrImage: document.getElementById('share-qrcode-img'),
      shareUrlInput: document.getElementById('share-url-input'),
      sharePageTag: document.getElementById('share-page-tag'),
      shareTabDirect: document.getElementById('share-tab-direct'),
      shareTabHub: document.getElementById('share-tab-hub'),
      btnCopyShareUrl: document.getElementById('btn-copy-share-url'),
      btnOpenShareUrl: document.getElementById('btn-open-share-url'),
      btnCloseShareModal: document.getElementById('btn-close-share-modal'),

      // GitHub Pages 弹窗
      btnOpenGithub: document.getElementById('btn-open-github'),
      modalGithub: document.getElementById('modal-github'),
      btnCloseGithubModal: document.getElementById('btn-close-github-modal'),
      ghUser: document.getElementById('gh-user'),
      ghRepoName: document.getElementById('gh-repo-name'),
      ghRepoUrl: document.getElementById('gh-repo-url'),
      btnGhNewRepo: document.getElementById('btn-gh-new-repo'),
      btnGhGetToken: document.getElementById('btn-gh-get-token'),
      ghBranch: document.getElementById('gh-branch'),
      ghSubdir: document.getElementById('gh-subdir'),
      ghToken: document.getElementById('gh-token'),
      ghPageCount: document.getElementById('gh-page-count'),
      ghOpenManagePages: document.getElementById('gh-open-manage-pages'),
      ghDeployStatus: document.getElementById('gh-deploy-status'),
      btnTestGhConfig: document.getElementById('btn-test-gh-config'),
      btnStartGhDeploy: document.getElementById('btn-start-gh-deploy'),

      // 授权与卡密弹窗
      btnLicenseStatus: document.getElementById('btn-license-status'),
      licenseBadgeText: document.getElementById('license-badge-text'),
      modalLicense: document.getElementById('modal-license'),
      btnCloseLicenseModal: document.getElementById('btn-close-license-modal'),
      licenseStatusCard: document.getElementById('license-status-card'),
      inputLicenseKey: document.getElementById('input-license-key'),
      licenseMsgBox: document.getElementById('license-msg-box'),
      btnClearLicense: document.getElementById('btn-clear-license'),
      btnSubmitLicense: document.getElementById('btn-submit-license')
    };
  }

  async initApp() {
    this.initLicenseSystem();
    if (window.electronAPI) {
      this.loadRecentProjects();
    }
  }

  async loadRecentProjects() {
    if (!window.electronAPI) return;
    const recents = await window.electronAPI.getRecentProjects();
    if (!recents || recents.length === 0) {
      if (this.dom.recentList) {
        this.dom.recentList.innerHTML = '<div style="color:#64748b;font-size:12px;padding:8px 0;">暂无历史打开项目</div>';
      }
      return;
    }
    if (this.dom.recentList) {
      this.dom.recentList.innerHTML = recents.map(p => `
        <div class="recent-item" data-path="${p}">
          <span style="font-weight:600;">📁 ${p.split(/[\\/]/).pop()}</span>
          <span style="font-size:11px;color:#94a3b8;">${p}</span>
        </div>
      `).join('');

      this.dom.recentList.querySelectorAll('.recent-item').forEach(el => {
        el.addEventListener('click', () => {
          const p = el.getAttribute('data-path');
          this.openWorkspace(p);
        });
      });
    }
  }

  bindEvents() {
    if (this.dom.btnOpenFolder) {
      this.dom.btnOpenFolder.addEventListener('click', async () => {
        if (window.electronAPI) {
          const res = await window.electronAPI.openDirectoryDialog();
          if (res && res.success) {
            this.serverPort = res.port;
            this.apiBase = `http://127.0.0.1:${this.serverPort}`;
            this.exporter.apiBase = this.apiBase;
            await this.loadProjectInfo();
            if (this.dom.launcherScreen) this.dom.launcherScreen.classList.add('hidden');
          }
        } else {
          this.handleOpenFolderWeb();
        }
      });
    }

    if (this.dom.btnSwitchProject) {
      this.dom.btnSwitchProject.addEventListener('click', async () => {
        if (window.electronAPI) {
          const res = await window.electronAPI.openDirectoryDialog();
          if (res && res.success) {
            this.serverPort = res.port;
            this.apiBase = `http://127.0.0.1:${this.serverPort}`;
            this.exporter.apiBase = this.apiBase;
            await this.loadProjectInfo();
          }
        } else {
          this.handleOpenFolderWeb();
        }
      });
    }

    // 暴露给 iframe 运行时或外部调用的页面切换桥梁
    window.switchPage = (pageIdOrPath) => {
      if (!this.projectInfo || !this.projectInfo.pages) return;
      const target = this.projectInfo.pages.find(p => p.id === pageIdOrPath || p.path === pageIdOrPath || p.path.endsWith(pageIdOrPath));
      if (target) {
        this.switchPage(target);
      }
    };
    window.openModal = () => {
      this.openPagesModal();
    };

    if (this.dom.btnLoadDemo) {
      this.dom.btnLoadDemo.addEventListener('click', () => this.loadDemoProject());
    }

    if (this.dom.webFolderInput) {
      this.dom.webFolderInput.addEventListener('change', (e) => this.handleWebFileInput(e));
    }

    // 设备视图切换
    this.dom.btnViewMobile.addEventListener('click', () => this.setViewMode('mobile'));
    this.dom.btnViewPc.addEventListener('click', () => this.setViewMode('pc'));

    // 标注模式开关
    this.dom.btnToggleInspect.addEventListener('click', () => this.toggleInspectMode());

    // 页面管理弹窗
    this.dom.btnManagePages.addEventListener('click', () => this.openPagesModal());
    this.dom.btnClosePagesModal.addEventListener('click', () => this.dom.modalPages.classList.add('hidden'));
    this.dom.btnAddCustomPage.addEventListener('click', () => this.addCustomPage());
    this.dom.btnSavePagesConfig.addEventListener('click', () => this.savePagesConfig());

    // 手机扫码与演示弹窗
    this.dom.btnShareLan.addEventListener('click', () => this.openShareModal());
    this.dom.btnCloseShareModal.addEventListener('click', () => this.dom.modalShare.classList.add('hidden'));
    this.dom.btnCopyShareUrl.addEventListener('click', () => {
      const val = this.dom.shareUrlInput ? this.dom.shareUrlInput.value.trim() : '';
      if (val) {
        navigator.clipboard.writeText(val);
        alert('🎉 直达链接已复制到剪贴板！');
      }
    });
    if (this.dom.btnOpenShareUrl) {
      this.dom.btnOpenShareUrl.addEventListener('click', () => {
        const val = this.dom.shareUrlInput ? this.dom.shareUrlInput.value.trim() : '';
        if (val) window.open(val, '_blank');
      });
    }

    // 监听 URL Hash 变化实现多页面无刷新同步
    window.addEventListener('hashchange', () => {
      if (this.projectInfo?.pages) {
        const target = this.checkInitialHashPage(this.projectInfo.pages);
        if (target && target.id !== this.activePage?.id) {
          this.switchPage(target, false);
        }
      }
    });

    // GitHub Pages 弹窗
    this.dom.btnOpenGithub.addEventListener('click', () => this.openGithubModal());
    this.dom.btnCloseGithubModal.addEventListener('click', () => this.dom.modalGithub.classList.add('hidden'));
    this.dom.ghOpenManagePages.addEventListener('click', () => {
      this.dom.modalGithub.classList.add('hidden');
      this.openPagesModal();
    });
    this.dom.btnTestGhConfig.addEventListener('click', () => this.testGitEnv());
    this.dom.btnStartGhDeploy.addEventListener('click', () => this.startGithubDeploy());

    // GitHub 快捷创建仓库与获取 Token
    const syncRepoUrl = () => {
      const user = this.dom.ghUser.value.trim();
      const repo = this.dom.ghRepoName.value.trim();
      if (user && repo) {
        this.dom.ghRepoUrl.value = `https://github.com/${user}/${repo}.git`;
      }
    };
    this.dom.ghUser.addEventListener('input', syncRepoUrl);
    this.dom.ghRepoName.addEventListener('input', syncRepoUrl);

    this.dom.ghRepoUrl.addEventListener('input', () => {
      const val = this.dom.ghRepoUrl.value.trim();
      const m = val.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (m) {
        this.dom.ghUser.value = m[1];
        this.dom.ghRepoName.value = m[2];
      }
    });

    this.dom.btnGhNewRepo.addEventListener('click', () => {
      const repo = this.dom.ghRepoName.value.trim();
      const targetUrl = repo ? `https://github.com/new?name=${encodeURIComponent(repo)}` : 'https://github.com/new';
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(targetUrl);
      } else {
        window.open(targetUrl, '_blank');
      }
    });

    this.dom.btnGhGetToken.addEventListener('click', () => {
      const tokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=ProtoHub_Deployer';
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(tokenUrl);
      } else {
        window.open(tokenUrl, '_blank');
      }
    });

    // 授权与卡密弹窗
    this.dom.btnLicenseStatus.addEventListener('click', () => this.openLicenseModal());
    this.dom.btnCloseLicenseModal.addEventListener('click', () => this.dom.modalLicense.classList.add('hidden'));
    this.dom.btnSubmitLicense.addEventListener('click', () => this.submitLicenseKey());
    this.dom.btnClearLicense.addEventListener('click', () => this.clearLicenseKey());

    // 导出单文件 HTML
    this.dom.btnExportSingle.addEventListener('click', () => this.exportSingleHtml());

    // 监听官方标注编辑器与审阅引擎事件
    window.addEventListener('message', (e) => {
      if (!e.data) return;
      if (e.data.type === 'APPLY_ANNOTATIONS') {
        const nextData = e.data.nextData;
        if (this.activePage) {
          this.activePage.annotations = nextData.annotations || [];
          if (nextData.globalSections) this.activePage.globalSections = nextData.globalSections;
          if (nextData.globalDoc) this.activePage.globalDoc = nextData.globalDoc;
          const baseHtml = this.activePage.originalHtml || this.activePage.htmlContent;
          const updatedHtml = this.engine.injectDataOnly(baseHtml, nextData);
          this.activePage.originalHtml = updatedHtml;
          this.activePage.htmlContent = updatedHtml;
        }
        this.currentAnnotations = this.activePage?.annotations || [];
        this.renderGlobalDocs();
        this.renderAnnotations();
        alert('🎉 原型标注与需求说明已成功保存！');
      } else if (e.data.type === 'SYNC_SESSION_DRAFT') {
        const sess = e.data.session;
        if (sess && this.activePage) {
          if (Array.isArray(sess.workingAnnotations)) {
            this.activePage.annotations = sess.workingAnnotations
              .filter(n => n._editState !== 'deleted')
              .map(n => {
                const c = { ...n };
                delete c._editState;
                delete c._contentPolicy;
                delete c._aiContent;
                delete c._aiFormat;
                delete c._route;
                return c;
              });
            this.currentAnnotations = this.activePage.annotations;
            this.renderAnnotations();
          }
          if (Array.isArray(sess.workingGlobalSections)) {
            this.activePage.globalSections = sess.workingGlobalSections
              .filter(s => s._editState !== 'deleted')
              .map(s => {
                const c = { ...s };
                delete c._editState;
                delete c._contentPolicy;
                delete c._aiContent;
                delete c._aiFormat;
                delete c._route;
                return c;
              });
            this.renderGlobalDocs();
          }
        }
      } else if (e.data.type === 'SELECT_PIN') {
        const idx = e.data.index;
        this.highlightAnnotationCard(idx);
      }
    });
  }

  async handleOpenFolderWeb() {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        await this.loadWebDirectoryHandle(dirHandle);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    if (this.dom.webFolderInput) {
      this.dom.webFolderInput.click();
    }
  }

  async handleWebFileInput(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const htmlFiles = files.filter(f => f.name.endsWith('.html'));
    if (htmlFiles.length === 0) {
      alert('所选文件夹中未找到 .html 原型页面文件，请选择包含 HTML 的原型目录。');
      return;
    }

    const rawFiles = [];
    for (const f of htmlFiles) {
      const text = await f.text();
      rawFiles.push({
        filename: f.name,
        name: f.name.replace(/\.html$/, ''),
        htmlContent: text
      });
    }

    const pages = this.processScannedPages(rawFiles);
    const folderName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : '本地原型项目';
    this.initWebProject(folderName, pages);
  }

  async loadWebDirectoryHandle(dirHandle) {
    const rawFiles = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.html')) {
        const file = await entry.getFile();
        const text = await file.text();
        rawFiles.push({
          filename: entry.name,
          name: entry.name.replace(/\.html$/, ''),
          htmlContent: text
        });
      }
    }

    if (rawFiles.length === 0) {
      alert('所选文件夹中未找到 .html 原型页面文件');
      return;
    }

    const pages = this.processScannedPages(rawFiles);
    this.initWebProject(dirHandle.name, pages);
  }

  extractAnnotationsFromHtml(htmlContent) {
    let annotations = [];
    let globalSections = [];
    let globalDoc = { title: '', summary: '', targetAudience: '' };
    let mobile = null;

    const mProtoData = htmlContent.match(/<script\s+id=["']prototypeAnnotationData["'][^>]*>(.*?)<\/script>/s);
    if (mProtoData) {
      try {
        const data = JSON.parse(mProtoData[1]);
        if (Array.isArray(data.annotations)) annotations = data.annotations;
        if (Array.isArray(data.globalSections)) globalSections = data.globalSections;
        if (data.globalDoc) globalDoc = data.globalDoc;
        if (data.mobile) mobile = data.mobile;
        return { annotations, globalSections, globalDoc, mobile, rawData: data };
      } catch (e) {}
    }

    const mDiff = htmlContent.match(/const\s+DIFF_CHANGESET\s*=\s*(\[[^;]+\]);/s)
      || htmlContent.match(/var\s+DIFF_CHANGESET\s*=\s*(\[[^;]+\]);/s);
    if (mDiff) {
      try {
        annotations = new Function(`return ${mDiff[1]};`)();
        return { annotations, globalSections, globalDoc, mobile, rawData: null };
      } catch (e) {}
    }

    const mOld = htmlContent.match(/window\.__PROTOTYPE_ANNOTATIONS__\s*=\s*(\[[^;]+\]);/);
    if (mOld) {
      try {
        annotations = JSON.parse(mOld[1]);
        return { annotations, globalSections, globalDoc, mobile, rawData: null };
      } catch (e) {}
    }

    return { annotations, globalSections, globalDoc, mobile, rawData: null };
  }

  processScannedPages(rawFiles) {
    let defaultPagesFromHub = null;
    const hubFile = rawFiles.find(f => f.filename.toLowerCase() === 'index.html');
    if (hubFile) {
      const match = hubFile.htmlContent.match(/const\s+DEFAULT_PAGES\s*=\s*(\[[^;]+\]);/s);
      if (match) {
        try { defaultPagesFromHub = JSON.parse(match[1]); } catch (e) {}
      }
    }

    const pages = [];
    for (const f of rawFiles) {
      const lowerName = f.filename.toLowerCase();
      const isWrapperHub = lowerName === 'index.html' && (
        f.htmlContent.includes('launcher-screen') ||
        f.htmlContent.includes('DEFAULT_PAGES') ||
        f.htmlContent.includes('ProtoHub')
      );

      const { annotations, globalSections, globalDoc, mobile } = this.extractAnnotationsFromHtml(f.htmlContent);

      let title = f.name;
      const m = f.htmlContent.match(/<title>([^<]+)<\/title>/i);
      if (m && m[1].trim()) {
        title = m[1].trim().split('·')[0].split('-')[0].trim();
      }

      pages.push({
        id: f.filename.replace(/\.html$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_'),
        name: title,
        path: f.filename,
        filename: f.filename,
        originalHtml: f.htmlContent,
        htmlContent: f.htmlContent,
        isWrapperHub: isWrapperHub,
        annotations: annotations || [],
        globalSections: globalSections || [],
        globalDoc: globalDoc || {},
        visible: !isWrapperHub
      });
    }

    if (defaultPagesFromHub && Array.isArray(defaultPagesFromHub) && defaultPagesFromHub.length > 0) {
      const merged = [];
      for (const dp of defaultPagesFromHub) {
        const exists = pages.find(f => f.path === dp.path || f.id === dp.id);
        if (exists) {
          merged.push({
            ...exists,
            id: dp.id,
            name: dp.name || exists.name,
            visible: dp.visible !== false
          });
        }
      }
      for (const f of pages) {
        if (!merged.find(m => m.path === f.path) && !f.isWrapperHub) {
          f.visible = false;
          merged.push(f);
        }
      }
      if (merged.length > 0) return merged;
    }

    pages.sort((a, b) => {
      if (a.isWrapperHub && !b.isWrapperHub) return 1;
      if (!a.isWrapperHub && b.isWrapperHub) return -1;
      if (a.annotations.length && !b.annotations.length) return -1;
      if (!a.annotations.length && b.annotations.length) return 1;
      return 0;
    });

    return pages;
  }

  initWebProject(name, pages) {
    this.isWebMode = true;
    this.currentWorkspace = name;
    this.projectInfo = {
      workspaceDir: name,
      pages: pages
    };

    window.__PRD_PAGES_REGISTRY__ = pages.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      visible: p.visible !== false
    }));

    this.dom.folderName.textContent = name;
    this.dom.folderName.title = name;
    this.renderTabs();
    const targetPage = this.checkInitialHashPage(pages);
    if (targetPage) {
      this.switchPage(targetPage, false);
    }
    if (this.dom.launcherScreen) this.dom.launcherScreen.classList.add('hidden');
  }

  checkInitialHashPage(pages) {
    if (!pages || pages.length === 0) return null;
    const hash = (typeof window !== 'undefined' && window.location.hash) ? window.location.hash.replace(/^#page=/, '').trim() : '';
    if (hash) {
      const decoded = decodeURIComponent(hash);
      const match = pages.find(p => p.id === decoded || p.path === decoded || p.path.endsWith(decoded) || p.name === decoded);
      if (match && match.visible !== false) return match;
    }
    const visible = pages.filter(p => p.visible !== false);
    return visible[0] || pages[0];
  }

  loadDemoProject() {
    const demoPages = [
      {
        id: 'home_page',
        name: '智能选科推荐',
        path: 'home.html',
        htmlContent: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>智能选科推荐</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #0f172a; }
    .card { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px; }
    .hero { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border-radius: 12px; padding: 20px; text-align: center; }
    .btn { background: #22c55e; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; width: 100%; cursor: pointer; font-size: 15px; }
    .tag { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 6px; }
  </style>
</head>
<body>
  <div class="hero">
    <h2 style="margin:0 0 8px 0;">🎯 新高考智能选科测评系统</h2>
    <p style="margin:0; opacity:0.9; font-size:13px;">基于 300+ 院校历年录取大数据精准匹配选科方案</p>
  </div>
  <div class="card" style="margin-top:16px;">
    <div style="font-weight:700; margin-bottom:12px;">🌟 推荐热门组合：</div>
    <div style="margin-bottom:8px;"><span class="tag">物化生</span> 专业覆盖率 96.2% · 理工农医首选</div>
    <div style="margin-bottom:8px;"><span class="tag">物化地</span> 专业覆盖率 93.8% · 赋分优势明显</div>
    <div style="margin-bottom:16px;"><span class="tag">史政地</span> 纯文科经典 · 法学经管强项</div>
    <button class="btn" onclick="alert('进入选科智能测评答题流程')">🚀 开始 3 分钟性格与潜能测评</button>
  </div>
</body>
</html>`,
        globalSections: [
          { id: 'sec_1', title: '1. 业务背景与概述', content: '为新高考改革省份的高一/高二学生提供基于历年高校录取概率与学科兴趣潜能的智能化选科测评工具。' },
          { id: 'sec_2', title: '2. 核心功能目标', content: '1. 提供 3 分钟极速测评与深度潜能评测入口\n2. 动态展示 20 种选科组合在各大高校专业的覆盖率\n3. 联动生成个性化选科建议报告与提分策略' }
        ],
        annotations: [
          {
            type: 'add',
            typeLabel: '新增需求',
            title: '测评入口增加历年专业覆盖率动态标签',
            desc: '根据教育部最新《选考科目指引》，在选科卡片上动态渲染对应专业的最新覆盖率百分比数据。',
            sdd: { blockId: 'SEC-3.1 智能选科算法规格' }
          },
          {
            type: 'modify',
            typeLabel: '交互优化',
            title: '测评答题支持手势滑动与即时赋分预测',
            desc: '移动端评测支持左右滑卡交互，并在每道题目完成后展示即时赋分优势雷达图。',
            sdd: { blockId: 'SEC-4.2 雷达图计算模型' }
          }
        ]
      },
      {
        id: 'detail_page',
        name: '选科方案详情与专业分析',
        path: 'detail.html',
        htmlContent: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>选科方案详情与专业分析</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #0f172a; }
    .header-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .badge { background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight:700; }
    .table-box { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border-radius: 8px; overflow: hidden; }
    .table-box th, .table-box td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
    .table-box th { background: #f1f5f9; }
  </style>
</head>
<body>
  <div class="header-bar">
    <h3 style="margin:0;">📊 物理 + 化学 + 地理 深度分析报告</h3>
    <span class="badge">匹配指数: 98%</span>
  </div>
  <table class="table-box">
    <thead>
      <tr><th>高校类别</th><th>限选要求</th><th>录取概率预测</th></tr>
    </thead>
    <tbody>
      <tr><td>985 / 211 顶尖工科</td><td>必选物理+化学</td><td>🟢 极高 (88%)</td></tr>
      <tr><td>电子信息与计算机类</td><td>必选物理</td><td>🟢 优势明显</td></tr>
      <tr><td>临床医学类</td><td>必选物理+化学</td><td>🟡 适中</td></tr>
    </tbody>
  </table>
</body>
</html>`,
        globalSections: [
          { id: 'sec_1', title: '1. 选科方案分析目的', content: '全面解析指定选科组合（如物化地）在 985/211 顶尖工科及医学类的限选优势与录取门槛。' },
          { id: 'sec_2', title: '2. 核心数据口径', content: '1. 历年投档线位次区间取自省考试院最近 3 年公布的官方投档数据\n2. 专业匹配指数结合用户测评分数与目标院校历史录取偏好' }
        ],
        annotations: [
          {
            type: 'modify',
            typeLabel: '需求变更',
            title: '增加 985/211 院校历年投档线区间浮动展示',
            desc: '在高校列表旁增加最近 3 年最低投档分位次区间，并支持一键收藏意向院校。',
            sdd: { blockId: 'SEC-5.1 高校数据网格' }
          }
        ]
      }
    ];

    this.initWebProject('学习分析', demoPages);
  }

  async openWorkspace(dirPath) {
    if (window.electronAPI) {
      const res = await window.electronAPI.loadWorkspace(dirPath);
      if (res && res.success) {
        this.serverPort = res.port;
        this.apiBase = `http://127.0.0.1:${this.serverPort}`;
        this.exporter.apiBase = this.apiBase;
        await this.loadProjectInfo();
        if (this.dom.launcherScreen) this.dom.launcherScreen.classList.add('hidden');
      }
    }
  }

  async loadProjectInfo() {
    const res = await fetch(`${this.apiBase}/api/project/info`);
    this.projectInfo = await res.json();
    this.currentWorkspace = this.projectInfo.workspaceDir;
    this.token = this.projectInfo.token || '';
    window.__PRD_PAGES_REGISTRY__ = (this.projectInfo.pages || []).map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      visible: p.visible !== false
    }));
    const folderName = this.currentWorkspace.split(/[\\/]/).pop();
    this.dom.folderName.textContent = folderName;
    this.dom.folderName.title = this.currentWorkspace;
    this.renderTabs();
    const targetPage = this.checkInitialHashPage(this.projectInfo.pages);
    if (targetPage) {
      this.switchPage(targetPage, false);
    }
  }

  renderTabs() {
    if (!this.projectInfo || !this.projectInfo.pages) return;
    const visiblePages = this.projectInfo.pages.filter(p => p.visible !== false);
    this.dom.tabsContainer.innerHTML = visiblePages.map((page, idx) => `
      <div class="page-tab-item ${this.activePage?.id === page.id ? 'is-active' : ''}" data-id="${page.id}">
        <span>${page.name}</span>
      </div>
    `).join('');

    this.dom.tabsContainer.querySelectorAll('.page-tab-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const targetPage = this.projectInfo.pages.find(p => p.id === id);
        if (targetPage) {
          this.switchPage(targetPage);
        }
      });
    });
  }

  switchPage(page, updateHash = true) {
    this.activePage = page;
    if (updateHash && typeof window !== 'undefined' && page?.id) {
      try {
        history.replaceState(null, '', '#page=' + encodeURIComponent(page.id));
      } catch (e) {
        window.location.hash = 'page=' + encodeURIComponent(page.id);
      }
    }
    this.renderTabs();
    this.updateIframeSrc();
    this.renderGlobalDocs();
    this.loadAnnotations(page.path);
  }

  updateIframeSrc() {
    if (!this.activePage) return;

    if (this.isWebMode || !window.electronAPI) {
      const sourceHtml = this.activePage.originalHtml || this.activePage.htmlContent;
      if (sourceHtml) {
        if (this.isInspectMode) {
          // 运行官方原生可视化标注编辑器
          this.dom.previewIframe.srcdoc = this.engine.prepareHtmlForEditing(
            sourceHtml,
            this.activePage.path,
            this.activePage.annotations || [],
            this.activePage.globalSections || [],
            this.projectInfo?.pages || [],
            this.viewMode
          );
          this.dom.frameContainer.className = 'device-frame-container pc-view';
          if (this.dom.docsSidebar) this.dom.docsSidebar.style.display = 'none';
          if (this.dom.sidebar) this.dom.sidebar.style.display = 'none';
        } else {
          // 运行官方原生审阅运行时
          this.dom.previewIframe.srcdoc = this.engine.prepareHtmlForReview(
            sourceHtml,
            this.activePage.path,
            this.activePage.annotations || [],
            this.activePage.globalSections || [],
            this.projectInfo?.pages || [],
            this.viewMode
          );
          this.setViewMode(this.viewMode);
          if (this.dom.docsSidebar) this.dom.docsSidebar.style.display = 'flex';
          if (this.dom.sidebar) this.dom.sidebar.style.display = 'flex';
        }
      }
      return;
    }

    // 桌面客户端模式
    if (this.isInspectMode) {
      this.dom.previewIframe.src = `${this.apiBase}/prototype?file=${encodeURIComponent(this.activePage.path)}&protoWeb-mode=edit&protoWeb-token=${this.token}`;
      this.dom.frameContainer.className = 'device-frame-container pc-view';
      if (this.dom.docsSidebar) this.dom.docsSidebar.style.display = 'none';
      if (this.dom.sidebar) this.dom.sidebar.style.display = 'none';
    } else {
      this.dom.previewIframe.src = `${this.apiBase}/${this.activePage.path}`;
      this.setViewMode(this.viewMode);
      if (this.dom.docsSidebar) this.dom.docsSidebar.style.display = 'flex';
      if (this.dom.sidebar) this.dom.sidebar.style.display = 'flex';
    }
  }

  renderGlobalDocs() {
    if (!this.dom.docsSidebarContent) return;
    const sections = this.activePage?.globalSections || [];
    
    if (sections.length === 0) {
      this.dom.docsSidebarContent.innerHTML = `
        <div style="text-align:center; padding: 36px 16px; color: #94a3b8; font-size:12.5px;">
          <div style="font-size: 28px; margin-bottom: 8px;">📖</div>
          <div style="font-weight:600; color:#64748b; margin-bottom:4px;">暂无页面全局业务说明</div>
          <div style="font-size:11.5px; color:#94a3b8; line-height:1.5;">开启上方「🎯 标注模式」可在左侧文档栏编写产品背景、功能目标与业务流程。</div>
        </div>
      `;
      return;
    }

    this.dom.docsSidebarContent.innerHTML = sections.map((sec, idx) => `
      <div class="doc-section-card">
        <div class="doc-section-title">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2563eb;"></span>
          <span>${sec.title || `章节 ${idx + 1}`}</span>
        </div>
        <div class="doc-section-body">${sec.content || '暂无详细描述'}</div>
      </div>
    `).join('');
  }

  async loadAnnotations(pagePath) {
    if (this.isWebMode || !window.electronAPI) {
      this.currentAnnotations = this.activePage?.annotations || [];
      this.renderAnnotations();
      return;
    }

    try {
      const res = await fetch(`${this.apiBase}/api/annotations?file=${encodeURIComponent(pagePath)}`);
      const data = await res.json();
      this.currentAnnotations = data.annotations || [];
    } catch (e) {
      this.currentAnnotations = this.activePage?.annotations || [];
    }
    this.renderAnnotations();
  }

  renderAnnotations() {
    this.dom.annotationCount.textContent = `${this.currentAnnotations.length} 条`;
    if (this.currentAnnotations.length === 0) {
      this.dom.annotationList.innerHTML = `
        <div style="text-align:center; padding: 40px 16px; color: #94a3b8; font-size:13px;">
          <div style="font-size: 32px; margin-bottom: 8px;">📝</div>
          <div>当前页面暂无需求标注</div>
          <div style="font-size:11.5px; margin-top:4px; color:#2563eb;">开启上方「🎯 标注模式」直接点击原型元素即可打点</div>
        </div>
      `;
      return;
    }

    this.dom.annotationList.innerHTML = this.currentAnnotations.map((item, idx) => `
      <div class="annotation-card" data-idx="${idx}" style="cursor:pointer; position:relative;">
        <div class="card-top">
          <span class="card-tag ${item.type || 'modify'}">${item.typeLabel || (item.type === 'add' ? '新增功能' : (item.type === 'rule' ? '业务规则' : '修改逻辑'))}</span>
          <span style="font-size:11px; color:#94a3b8; font-weight:700;">#${idx + 1}</span>
        </div>
        <div class="card-title">${item.title || item.name || '需求项'}</div>
        <div class="card-desc">${item.desc || item.content || item.summary || ''}</div>
        ${item.sdd?.blockId ? `
          <div class="card-sdd-link">
            <span>🔗 SDD: ${item.sdd.blockId}</span>
          </div>
        ` : ''}
      </div>
    `).join('');

    // 点击卡片联动高亮 iframe 内的对应标注点
    this.dom.annotationList.querySelectorAll('.annotation-card').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        this.highlightAnnotationCard(idx);
        this.dom.previewIframe.contentWindow?.postMessage({ type: 'HIGHLIGHT_PIN', index: idx }, '*');
      });
    });
  }

  highlightAnnotationCard(idx) {
    this.dom.annotationList.querySelectorAll('.annotation-card').forEach((c, i) => {
      c.style.borderColor = i === idx ? '#2563eb' : '';
      c.style.backgroundColor = i === idx ? '#eff6ff' : '';
      if (i === idx) {
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  setViewMode(mode) {
    const modeChanged = this.viewMode !== mode;
    this.viewMode = mode;
    this.dom.btnViewMobile.classList.toggle('is-active', mode === 'mobile');
    this.dom.btnViewPc.classList.toggle('is-active', mode === 'pc');
    if (!this.isInspectMode) {
      this.dom.frameContainer.className = `device-frame-container ${mode === 'mobile' ? 'mobile-view' : 'pc-view'}`;
      if (modeChanged) this.updateIframeSrc();
    }
  }

  toggleInspectMode(forceState) {
    if (!this.checkLicenseGuard('标注编辑模式')) return;
    this.isInspectMode = typeof forceState === 'boolean' ? forceState : !this.isInspectMode;
    this.dom.btnToggleInspect.classList.toggle('is-active', this.isInspectMode);
    this.dom.btnToggleInspect.classList.toggle('active', this.isInspectMode);
    this.dom.btnToggleInspect.innerHTML = this.isInspectMode ? '<span>🎯 退出标注模式</span>' : '<span>🎯 标注模式</span>';
    this.updateIframeSrc();
    this.currentAnnotations = this.activePage?.annotations || [];
    this.renderGlobalDocs();
    this.renderAnnotations();
  }

  openPagesModal() {
    if (!this.checkLicenseGuard('页面管理')) return;
    const pages = this.projectInfo?.pages || [];
    this.dom.pageManageList.innerHTML = pages.map((p, idx) => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
          <input type="checkbox" data-idx="${idx}" ${p.visible !== false ? 'checked' : ''}>
          <span>${p.name} <span style="color:#94a3b8; font-size:11.5px;">(${p.path})</span></span>
        </label>
      </div>
    `).join('');
    this.dom.modalPages.classList.remove('hidden');
  }

  addCustomPage() {
    const pathVal = this.dom.inputNewPagePath.value.trim();
    const nameVal = this.dom.inputNewPageName.value.trim() || pathVal;
    if (!pathVal) return;

    if (!this.projectInfo) this.projectInfo = { pages: [] };
    this.projectInfo.pages.push({
      id: pathVal.replace(/\.html$/i, ''),
      name: nameVal,
      path: pathVal.startsWith('/') ? pathVal.slice(1) : pathVal,
      visible: true
    });

    this.dom.inputNewPagePath.value = '';
    this.dom.inputNewPageName.value = '';
    this.openPagesModal();
  }

  async savePagesConfig() {
    const checkboxes = this.dom.pageManageList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      const idx = parseInt(cb.getAttribute('data-idx'), 10);
      if (this.projectInfo.pages[idx]) {
        this.projectInfo.pages[idx].visible = cb.checked;
      }
    });

    window.__PRD_PAGES_REGISTRY__ = this.projectInfo.pages;
    try {
      localStorage.setItem('PRD_PAGES_REGISTRY_UNIFIED', JSON.stringify(this.projectInfo.pages));
      localStorage.setItem('PRD_HUB_PAGES_V2', JSON.stringify(this.projectInfo.pages));
    } catch (e) {}

    // 通知内部 iframe 同步最新页面清单
    try {
      this.dom.previewIframe.contentWindow?.postMessage({
        type: 'PRD_PAGES_UPDATED',
        pages: this.projectInfo.pages
      }, '*');
    } catch (e) {}

    if (window.electronAPI) {
      await fetch(`${this.apiBase}/api/project/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: this.projectInfo.pages })
      });
    }

    this.dom.modalPages.classList.add('hidden');
    this.renderTabs();
    if (this.activePage && this.activePage.visible === false) {
      const firstVisible = this.projectInfo.pages.find(p => p.visible !== false);
      if (firstVisible) this.switchPage(firstVisible);
    } else {
      this.updateIframeSrc();
    }
  }

  updateShareQrCode(url) {
    if (!this.dom.qrImage) return;
    const cleanUrl = url.trim();
    this.dom.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(cleanUrl)}`;
  }

  async openShareModal() {
    if (!this.checkLicenseGuard('手机扫码分享')) return;
    const curOrigin = (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') ? window.location.origin : (this.apiBase || 'http://127.0.0.1:9000');
    const curPath = window.location.pathname || '/';
    const activeId = this.activePage?.id || '';

    let directUrl = '';
    let hubUrl = '';

    if (window.electronAPI) {
      try {
        const idParam = this.activePage ? `?id=${encodeURIComponent(this.activePage.id)}` : '';
        const res = await fetch(`${this.apiBase}/api/share/info${idParam}`);
        const data = await res.json();
        directUrl = data.shareUrl;
        hubUrl = directUrl.split('#')[0];
      } catch (e) {}
    }

    if (!directUrl) {
      directUrl = activeId ? `${curOrigin}${curPath}#page=${encodeURIComponent(activeId)}` : `${curOrigin}${curPath}`;
      hubUrl = `${curOrigin}${curPath}`;
    }

    this.shareMode = 'direct';
    this.shareUrls = {
      direct: directUrl,
      hub: hubUrl
    };

    if (this.dom.sharePageTag) {
      this.dom.sharePageTag.textContent = this.activePage ? `当前: ${this.activePage.name}` : '';
    }

    const setShareTab = (mode) => {
      this.shareMode = mode;
      if (this.dom.shareTabDirect && this.dom.shareTabHub) {
        if (mode === 'direct') {
          this.dom.shareTabDirect.style.background = '#fff';
          this.dom.shareTabDirect.style.color = '#2563eb';
          this.dom.shareTabDirect.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
          this.dom.shareTabHub.style.background = 'transparent';
          this.dom.shareTabHub.style.color = '#64748b';
          this.dom.shareTabHub.style.boxShadow = 'none';
        } else {
          this.dom.shareTabHub.style.background = '#fff';
          this.dom.shareTabHub.style.color = '#2563eb';
          this.dom.shareTabHub.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
          this.dom.shareTabDirect.style.background = 'transparent';
          this.dom.shareTabDirect.style.color = '#64748b';
          this.dom.shareTabDirect.style.boxShadow = 'none';
        }
      }
      const targetUrl = this.shareUrls[mode];
      if (this.dom.shareUrlInput) {
        this.dom.shareUrlInput.value = targetUrl;
      }
      this.updateShareQrCode(targetUrl);
    };

    if (this.dom.shareTabDirect) {
      this.dom.shareTabDirect.onclick = () => setShareTab('direct');
    }
    if (this.dom.shareTabHub) {
      this.dom.shareTabHub.onclick = () => setShareTab('hub');
    }

    if (this.dom.shareUrlInput) {
      this.dom.shareUrlInput.oninput = () => {
        const val = this.dom.shareUrlInput.value.trim();
        if (val) this.updateShareQrCode(val);
      };
    }

    setShareTab('direct');
    this.dom.modalShare.classList.remove('hidden');
  }

  async exportSingleHtml() {
    if (!this.checkLicenseGuard('单文件交付导出')) return;
    if (!this.projectInfo) return;
    const bundleHtml = await this.exporter.generateSingleHtmlBundle(this.projectInfo.pages);
    
    const filename = `${this.dom.folderName.textContent || 'ProtoHub'}_交付原型.html`;
    const blob = new Blob([bundleHtml], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => alert('🎉 独立单文件 HTML 导出成功！研发和业务双击即可直接离线查看。'), 200);
  }

  async openGithubModal() {
    if (!this.checkLicenseGuard('GitHub Pages 部署分享')) return;
    if (!this.projectInfo) return;
    const visibleCount = this.projectInfo.pages.filter(p => p.visible !== false).length;
    this.dom.ghPageCount.textContent = visibleCount;
    this.dom.ghDeployStatus.className = 'hidden';
    this.dom.ghDeployStatus.innerHTML = '';

    if (window.electronAPI) {
      try {
        const res = await fetch(`${this.apiBase}/api/deploy/github/config`);
        const data = await res.json();
        if (data.savedConfig) {
          if (data.savedConfig.repoUrl) {
            this.dom.ghRepoUrl.value = data.savedConfig.repoUrl;
            const m = data.savedConfig.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
            if (m) {
              this.dom.ghUser.value = m[1];
              this.dom.ghRepoName.value = m[2];
            }
          }
          if (data.savedConfig.branch) this.dom.ghBranch.value = data.savedConfig.branch;
          if (data.savedConfig.subDir) this.dom.ghSubdir.value = data.savedConfig.subDir;
          if (data.savedConfig.token) this.dom.ghToken.value = data.savedConfig.token;
        }
      } catch (e) {}
    }

    this.dom.modalGithub.classList.remove('hidden');
  }

  async testGitEnv() {
    this.dom.ghDeployStatus.className = '';
    this.dom.ghDeployStatus.style.background = '#f8fafc';
    this.dom.ghDeployStatus.style.border = '1px solid #cbd5e1';
    this.dom.ghDeployStatus.style.color = '#334155';
    this.dom.ghDeployStatus.innerHTML = '🔍 正在检测系统 Git 环境...';

    if (!window.electronAPI) {
      this.dom.ghDeployStatus.style.background = '#f0fdf4';
      this.dom.ghDeployStatus.style.border = '1px solid #86efac';
      this.dom.ghDeployStatus.style.color = '#15803d';
      this.dom.ghDeployStatus.innerHTML = `✅ GitHub API 在线直连模式正常就绪。<br><span style="font-size:11.5px;color:#166534;">Web 版将通过 GitHub REST API 自动提交文件至 gh-pages 分支。</span>`;
      return;
    }

    try {
      const res = await fetch(`${this.apiBase}/api/deploy/github/config`);
      const data = await res.json();
      if (data.gitAvailable) {
        this.dom.ghDeployStatus.style.background = '#f0fdf4';
        this.dom.ghDeployStatus.style.border = '1px solid #86efac';
        this.dom.ghDeployStatus.style.color = '#15803d';
        this.dom.ghDeployStatus.innerHTML = `✅ Git 环境正常：<b>${data.gitVersion}</b><br><span style="font-size:11.5px;color:#166534;">已具备推送到 GitHub Pages 的原生命令支持。</span>`;
      } else {
        this.dom.ghDeployStatus.style.background = '#fef2f2';
        this.dom.ghDeployStatus.style.border = '1px solid #fca5a5';
        this.dom.ghDeployStatus.style.color = '#991b1b';
        this.dom.ghDeployStatus.innerHTML = '❌ 未检测到系统 Git。请确保电脑已安装 Git 并添加至 PATH 环境变量。';
      }
    } catch (e) {
      this.dom.ghDeployStatus.innerHTML = `⚠️ 检测出错: ${e.message}`;
    }
  }

  async startGithubDeploy() {
    if (!this.checkLicenseGuard('GitHub Pages 部署')) return;
    const repoUrl = this.dom.ghRepoUrl.value.trim();
    const branch = this.dom.ghBranch.value.trim() || 'gh-pages';
    const subDir = this.dom.ghSubdir.value.trim();
    const token = this.dom.ghToken.value.trim();

    if (!repoUrl) {
      alert('请填写 GitHub 用户名与仓库名称或完整仓库地址！');
      this.dom.ghRepoUrl.focus();
      return;
    }

    this.dom.btnStartGhDeploy.disabled = true;
    this.dom.btnStartGhDeploy.innerHTML = '⏳ 正在发布中...';
    this.dom.ghDeployStatus.className = '';
    this.dom.ghDeployStatus.style.background = '#eff6ff';
    this.dom.ghDeployStatus.style.border = '1px solid #93c5fd';
    this.dom.ghDeployStatus.style.color = '#1d4ed8';
    this.dom.ghDeployStatus.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">🚀 正在打包并推送到 GitHub Pages...</div>
      <div style="font-size:11.5px;color:#2563eb;">1. 正在提取已勾选的 ${this.dom.ghPageCount.textContent} 个页面与变更批注<br>2. 正在执行 Git 初始化与自动分支部署...</div>
    `;

    try {
      const res = await fetch(`${this.apiBase}/api/deploy/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          branch,
          subDir,
          token,
          pages: this.projectInfo.pages
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.dom.ghDeployStatus.style.background = '#f0fdf4';
        this.dom.ghDeployStatus.style.border = '1px solid #86efac';
        this.dom.ghDeployStatus.style.color = '#15803d';
        this.dom.ghDeployStatus.innerHTML = `
          <div style="font-weight:700; font-size:14px; margin-bottom:6px;">🎉 代码已成功推送到 ${data.branch} 分支！</div>
          
          <div style="background:#ffffff; border:1px solid #bbf7d0; border-radius:8px; padding:10px; margin-bottom:10px;">
            <div style="font-size:11.5px; color:#166534; font-weight:600; margin-bottom:3px;">🔗 在线公开访问地址：</div>
            <a href="${data.pagesUrl}" target="_blank" style="color:#2563eb; font-weight:700; font-size:13px; word-break:break-all; text-decoration:underline;">${data.pagesUrl}</a>
            
            <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
              <button class="tool-btn" id="btn-copy-gh-url" style="background:#f8fafc; font-size:11.5px; padding:4px 10px;">📋 复制链接</button>
              <button class="tool-btn" id="btn-open-gh-browser" style="background:#f8fafc; font-size:11.5px; padding:4px 10px;">🌐 浏览器打开</button>
              <button class="tool-btn" id="btn-probe-gh-status" style="background:#f8fafc; font-size:11.5px; padding:4px 10px; color:#2563eb;">🔄 检测是否生效 (防404)</button>
            </div>
            <div id="probe-status-text" style="font-size:11px; color:#64748b; margin-top:4px;"></div>
          </div>

          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px; margin-bottom:10px; color:#92400e;">
            <div style="font-size:12px; font-weight:700; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
              <span>⚠️ 首次发布必读（若打开显示 404）</span>
              <button class="tool-btn" id="btn-open-gh-settings" style="font-size:11px; padding:2px 8px; background:#fff; color:#b45309; border-color:#fcd34d;">
                直达 GitHub Pages 设置页 ↗
              </button>
            </div>
            <div style="font-size:11.5px; line-height:1.5;">
              1. 点击上方按钮直达 GitHub 仓库的 <b>Settings -> Pages</b> 页面<br>
              2. 在 <b>Branch</b> 下拉框中选中 <b><code>${data.branch}</code></b> 分支，点击 <b>Save</b><br>
              3. 保存后 GitHub 服务端通常需要 <b>1~2 分钟</b> 部署生效，无需重复推送。
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:12px; padding-top:4px;">
            <img src="${data.qrDataUrl}" style="width:68px; height:68px; border-radius:6px; border:1px solid #86efac; background:#fff;" alt="Online QR">
            <div style="font-size:11.5px; color:#166534; line-height:1.4;">
              <b>📱 手机端扫码体验：</b><br>
              待 GitHub Pages 生效后，团队成员即可直接扫码访问多页面 PRD。
            </div>
          </div>
        `;

        document.getElementById('btn-copy-gh-url')?.addEventListener('click', () => {
          navigator.clipboard.writeText(data.pagesUrl);
          alert('GitHub Pages 在线体验链接已复制！');
        });
        document.getElementById('btn-open-gh-browser')?.addEventListener('click', () => {
          if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(data.pagesUrl);
          } else {
            window.open(data.pagesUrl, '_blank');
          }
        });
        document.getElementById('btn-open-gh-settings')?.addEventListener('click', () => {
          if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(data.settingsPagesUrl);
          } else {
            window.open(data.settingsPagesUrl, '_blank');
          }
        });

        const probeBtn = document.getElementById('btn-probe-gh-status');
        const probeText = document.getElementById('probe-status-text');
        if (probeBtn && probeText) {
          probeBtn.addEventListener('click', async () => {
            probeText.textContent = '⏳ 正在探测 GitHub Pages 服务器状态...';
            try {
              const probeRes = await fetch(`${this.apiBase}/api/deploy/github/check-status?url=${encodeURIComponent(data.pagesUrl)}&owner=${encodeURIComponent(data.owner)}&repo=${encodeURIComponent(data.repo)}&token=${encodeURIComponent(token)}`);
              const probeData = await probeRes.json();
              if (probeData.isReady) {
                probeText.innerHTML = '<span style="color:#15803d;font-weight:600;">✅ GitHub Pages 已成功上线生效 (HTTP 200)！可正常访问。</span>';
              } else {
                probeText.innerHTML = `<span style="color:#b45309;">⏳ 当前状态码 ${probeData.statusCode || '404'}：GitHub 正在构建部署中，或 Pages 服务尚未在设置中开启。请先确认 Settings -> Pages 已选择 ${data.branch} 分支。</span>`;
              }
            } catch (e) {
              probeText.textContent = '探测失败: ' + e.message;
            }
          });
        }
      } else {
        this.dom.ghDeployStatus.style.background = '#fef2f2';
        this.dom.ghDeployStatus.style.border = '1px solid #fca5a5';
        this.dom.ghDeployStatus.style.color = '#991b1b';
        this.dom.ghDeployStatus.innerHTML = `
          <div style="font-weight:700;margin-bottom:4px;">❌ 发布失败</div>
          <div style="font-size:11.5px;line-height:1.4;">${data.error || '推送出错，请检查仓库权限或 Token 配置'}</div>
        `;
      }
    } catch (err) {
      this.dom.ghDeployStatus.style.background = '#fef2f2';
      this.dom.ghDeployStatus.style.border = '1px solid #fca5a5';
      this.dom.ghDeployStatus.style.color = '#991b1b';
      this.dom.ghDeployStatus.innerHTML = `❌ 请求异常: ${err.message}`;
    } finally {
      this.dom.btnStartGhDeploy.disabled = false;
      this.dom.btnStartGhDeploy.innerHTML = '🚀 立即打包并推送到 GitHub';
    }
  }

  // ==================== 授权与卡密系统 ====================
  initLicenseSystem() {
    this.licenseStatus = window.licenseManager ? window.licenseManager.getStatus() : { valid: true };
    this.updateLicenseUI();
    if (this.licenseStatus && !this.licenseStatus.valid) {
      setTimeout(() => this.openLicenseModal(), 600);
    }
  }

  onLicenseRevoked(reason) {
    this.updateLicenseUI();
    this.openLicenseModal(true, reason);
  }

  updateLicenseUI() {
    if (!window.licenseManager) return;
    const lic = window.licenseManager.getStatus();
    this.licenseStatus = lic;
    if (lic.isRevoked) {
      this.dom.licenseBadgeText.textContent = '🚫 授权已作废';
      this.dom.btnLicenseStatus.style.background = '#ef4444';
    } else if (lic.valid) {
      if (lic.isPermanent) {
        this.dom.licenseBadgeText.textContent = '👑 终身专业版';
      } else {
        this.dom.licenseBadgeText.textContent = `👑 VIP (剩余 ${lic.remainingDays} 天)`;
      }
      this.dom.btnLicenseStatus.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    } else {
      this.dom.licenseBadgeText.textContent = lic.isExpired ? '⚠️ 授权已到期' : '👑 激活授权';
      this.dom.btnLicenseStatus.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    }
  }

  openLicenseModal(forceRevoked = false, revokeReason = '') {
    if (!window.licenseManager) return;
    const lic = window.licenseManager.getStatus();
    const card = this.dom.licenseStatusCard;
    this.dom.licenseMsgBox.className = 'hidden';

    if (forceRevoked || lic.isRevoked) {
      card.style.background = '#fef2f2';
      card.style.border = '2px solid #ef4444';
      card.style.color = '#991b1b';
      card.innerHTML = `
        <div style="font-weight:800; font-size:15px; margin-bottom:6px; color:#b91c1c;">🚫 授权卡密已被远程注销 / 作废</div>
        <div style="font-size:12px; line-height:1.5; color:#7f1d1d;">原因：${revokeReason || lic.revokedReason || '该授权已因申请退款或违规被管理员收回，已停止所有功能服务。'}</div>
      `;
      this.dom.inputLicenseKey.value = '';
      this.dom.btnClearLicense.style.display = 'none';
    } else if (lic.valid) {
      card.style.background = '#f0fdf4';
      card.style.border = '1px solid #86efac';
      card.style.color = '#15803d';
      card.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">🎉 会员授权正常生效中</div>
        <div>套餐等级：<b>${lic.plan === 'TEAM' ? '团队商业版 (Team)' : '个人专业版 (Pro)'}</b></div>
        <div>到期时间：<b>${lic.isPermanent ? '终身永久版' : lic.expireDate}</b> (剩余 ${lic.isPermanent ? '永久' : lic.remainingDays + '天'})</div>
        <div style="font-size:11.5px; color:#166534; margin-top:4px; font-family:monospace; word-break:break-all;">当前卡密：${lic.key}</div>
      `;
      this.dom.inputLicenseKey.value = lic.key;
      this.dom.btnClearLicense.style.display = 'block';
    } else {
      card.style.background = '#fef2f2';
      card.style.border = '1px solid #fca5a5';
      card.style.color = '#991b1b';
      card.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">⚠️ 软件尚未激活或已到期</div>
        <div style="font-size:12px; line-height:1.5;">当前功能受限，请输入有效卡密以解锁多页面管理、官方标注编辑、GitHub Pages 一键推送及单文件导出交付。</div>
      `;
      this.dom.btnClearLicense.style.display = 'none';
    }

    this.dom.modalLicense.classList.remove('hidden');
  }

  submitLicenseKey() {
    if (!window.licenseManager) return;
    const key = this.dom.inputLicenseKey.value.trim();
    if (!key) {
      alert('请输入授权卡密！');
      return;
    }

    const res = window.licenseManager.activate(key);
    const msgBox = this.dom.licenseMsgBox;
    msgBox.className = '';

    if (res.valid) {
      msgBox.style.background = '#f0fdf4';
      msgBox.style.border = '1px solid #86efac';
      msgBox.style.color = '#15803d';
      msgBox.innerHTML = `✅ 激活成功！有效期至：<b>${res.isPermanent ? '终身永久' : res.expireDate}</b> (剩余 ${res.remainingDays} 天)`;
      this.updateLicenseUI();
      setTimeout(() => {
        this.dom.modalLicense.classList.add('hidden');
      }, 1200);
    } else {
      msgBox.style.background = '#fef2f2';
      msgBox.style.border = '1px solid #fca5a5';
      msgBox.style.color = '#991b1b';
      msgBox.innerHTML = `❌ 激活失败：${res.error || '卡密无效或已过期'}`;
    }
  }

  clearLicenseKey() {
    if (!window.licenseManager) return;
    if (confirm('确定要注销当前卡密吗？注销后软件将恢复未激活状态。')) {
      window.licenseManager.clear();
      this.updateLicenseUI();
      this.openLicenseModal();
    }
  }

  checkLicenseGuard(actionName = '此功能') {
    if (!window.licenseManager) return true;
    const lic = window.licenseManager.getStatus();
    if (!lic.valid) {
      alert(`⚠️ 您的 ProtoHub 授权已到期或未激活，无法使用【${actionName}】。\n\n请在弹出的授权窗口中输入有效卡密激活使用。`);
      this.openLicenseModal();
      return false;
    }
    return true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new WorkbenchApp();
});
