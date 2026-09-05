const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const qrcode = require('qrcode');
const { spawn } = require('child_process');

function runCmd(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      shell: true,
      windowsHide: true,
      ...options
    });
    let stdout = '';
    let stderr = '';
    proc.stdout && proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr && proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`命令执行失败 (退出码 ${code}): ${cmd} ${args.join(' ')}\n${stderr || stdout}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
    proc.on('error', err => reject(err));
  });
}

function parseGitHubUrl(repoUrl) {
  if (!repoUrl) return null;
  const cleaned = repoUrl.trim();
  const httpsMatch = cleaned.match(/https?:\/\/(?:[^@]+@)?github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const sshMatch = cleaned.match(/git@github\.com:([^\/]+)\/([^\/\.]+)(?:\.git)?/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== '.prototype-review') {
        copyDirRecursive(srcPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function createSessionId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${stamp}-${crypto.randomUUID().slice(0, 8)}`;
}

class ProtoServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = 9000;
    this.workspaceDir = null;
    this.activeEditFile = null;
    this.token = crypto.randomBytes(16).toString('hex');
    this.activeSessions = new Map(); // fullPath -> session
    this.editorDir = path.join(__dirname, 'assets', 'annotation-editor');
    this.engineDir = path.join(__dirname, 'engine');

    this.setupMiddlewares();
    this.setupRoutes();
  }

  setupMiddlewares() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // 禁用缓存
    this.app.use((req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
  }

  setWorkspace(dir) {
    if (!fs.existsSync(dir)) {
      throw new Error(`目录不存在: ${dir}`);
    }
    this.workspaceDir = path.resolve(dir);
  }

  getLanIp() {
    const interfaces = os.networkInterfaces();
    const validIps = [];

    for (const devName in interfaces) {
      const lowerName = devName.toLowerCase();
      if (lowerName.includes('tun') || lowerName.includes('tap') || lowerName.includes('mihomo') || lowerName.includes('clash') || lowerName.includes('vethernet') || lowerName.includes('wsl') || lowerName.includes('hyper-v')) {
        continue;
      }

      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && !alias.internal) {
          const ip = alias.address;
          if (ip.startsWith('198.18.') || ip.startsWith('169.254.') || ip.startsWith('127.')) {
            continue;
          }
          if (ip.startsWith('192.168.')) {
            return ip;
          }
          if (ip.startsWith('10.') || ip.startsWith('172.')) {
            validIps.push(ip);
          }
        }
      }
    }
    return validIps[0] || '192.168.110.75';
  }

  scanHtmlFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    const rawFiles = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    let defaultPagesFromHub = null;
    const hubPath = path.join(dir, 'index.html');
    if (fs.existsSync(hubPath)) {
      try {
        const hubContent = fs.readFileSync(hubPath, 'utf8');
        const match = hubContent.match(/const\s+DEFAULT_PAGES\s*=\s*(\[[^;]+\]);/s);
        if (match) {
          defaultPagesFromHub = JSON.parse(match[1]);
        }
      } catch (e) {}
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.workspaceDir, fullPath).replace(/\\/g, '/');
        const filename = entry.name;
        const lowerName = filename.toLowerCase();

        const isWrapperHub = lowerName === 'index.html' || lowerName === 'chanpin_wendang.html' || lowerName.includes('recover');

        let title = entry.name.replace(/\.html$/i, '');
        let hasAnnotations = false;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const m = content.match(/<title>([^<]+)<\/title>/i);
          if (m && m[1].trim()) {
            title = m[1].trim().split('·')[0].split('-')[0].trim();
          }
          if (content.includes('prototypeAnnotationData') || content.includes('DIFF_CHANGESET') || content.includes('diff-annotator')) {
            hasAnnotations = true;
          }
        } catch (e) {}

        rawFiles.push({
          id: entry.name.replace(/\.html$/i, ''),
          name: title,
          path: relPath,
          filename: entry.name,
          isWrapperHub,
          hasAnnotations,
          visible: !isWrapperHub
        });
      }
    }

    if (defaultPagesFromHub && Array.isArray(defaultPagesFromHub) && defaultPagesFromHub.length > 0) {
      const merged = [];
      for (const dp of defaultPagesFromHub) {
        const exists = rawFiles.find(f => f.path === dp.path || f.id === dp.id);
        merged.push({
          id: dp.id,
          name: dp.name || exists?.name || dp.id,
          path: dp.path,
          filename: dp.path,
          isWrapperHub: false,
          hasAnnotations: exists?.hasAnnotations || false,
          visible: dp.visible !== false
        });
      }
      for (const f of rawFiles) {
        if (!merged.find(m => m.path === f.path) && !f.isWrapperHub) {
          f.visible = false;
          merged.push(f);
        }
      }
      return merged;
    }

    rawFiles.sort((a, b) => {
      if (a.isWrapperHub && !b.isWrapperHub) return 1;
      if (!a.isWrapperHub && b.isWrapperHub) return -1;
      if (a.hasAnnotations && !b.hasAnnotations) return -1;
      if (!a.hasAnnotations && b.hasAnnotations) return 1;
      return 0;
    });

    return rawFiles;
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

    return { annotations, globalSections, globalDoc, mobile, rawData: null };
  }

  prepareHtmlForEditing(rawHtml, pageFile) {
    let html = rawHtml;
    const isMobile = html.includes('id="app"') || html.includes('max-width: 375px') || html.includes('max-width: 390px') || html.includes('viewport');
    const platform = isMobile ? 'mobile' : 'web';

    if (!html.includes('data-proto-app')) {
      if (html.includes('id="app"')) {
        html = html.replace(/<div([^>]*\bid=["']app["'][^>]*)>/i, `<div$1 data-proto-app data-proto-platform="${platform}">`);
      } else if (/<body/i.test(html)) {
        html = html.replace(/<body([^>]*)>/i, `<body$1 data-proto-app data-proto-platform="${platform}">`);
      }
    }

    if (!html.includes('id="prototypeAnnotationData"')) {
      const baseData = {
        prototypeId: path.basename(pageFile, '.html'),
        version: 1,
        mobile: isMobile ? { appRoot: "[data-proto-app]", deviceWidth: 390 } : undefined,
        globalMeta: { name: "原型说明", version: "V1.0", updatedAt: new Date().toISOString().slice(0, 10) },
        globalSections: [
          { id: "sec_overview", title: "1. 业务背景与概述", content: "请在此处填写该页面的产品背景与功能目标说明。" }
        ],
        annotations: []
      };
      const scriptTag = `\n<script id="prototypeAnnotationData" type="application/json">\n${JSON.stringify(baseData, null, 2)}\n</script>\n`;
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${scriptTag}</body>`);
      } else {
        html += scriptTag;
      }
    }

    const hasStage = html.includes('id="protoMobileStage"') || html.includes('id="protoWebReviewWorkspace"');
    if (!hasStage) {
      const mobileAssetDir = path.join(this.engineDir, 'assets', 'mobile-annotation');
      let cssContent = '';
      let shellContent = '';
      let runtimeContent = '';

      try {
        if (fs.existsSync(path.join(mobileAssetDir, 'mobile-annotation.css'))) {
          cssContent = fs.readFileSync(path.join(mobileAssetDir, 'mobile-annotation.css'), 'utf8');
        }
        if (fs.existsSync(path.join(mobileAssetDir, 'mobile-annotation-shell.html'))) {
          shellContent = fs.readFileSync(path.join(mobileAssetDir, 'mobile-annotation-shell.html'), 'utf8');
        }
        if (fs.existsSync(path.join(mobileAssetDir, 'mobile-annotation-runtime.js'))) {
          runtimeContent = fs.readFileSync(path.join(mobileAssetDir, 'mobile-annotation-runtime.js'), 'utf8');
        }
      } catch (e) {}

      if (cssContent && shellContent) {
        const cssBlock = `\n<style id="protoMobileAnnotationCss">\n${cssContent}\n</style>\n`;
        if (html.includes('</head>')) {
          html = html.replace('</head>', `${cssBlock}</head>`);
        } else {
          html = cssBlock + html;
        }

        const uiBlock = `\n${shellContent}\n<script id="protoMobileMobileAnnotationRuntime">\n${runtimeContent}\n</script>\n`;
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${uiBlock}</body>`);
        } else {
          html += uiBlock;
        }
      }
    }

    return html;
  }

  injectEditor(html, token, pageFile) {
    const { rawData, mobile } = this.extractAnnotationsFromHtml(html);
    const platform = mobile || rawData?.mobile ? "mobile" : "web";
    
    const config = JSON.stringify({
      token,
      apiBase: "/api/review",
      platform,
      stableUrl: `/prototype?file=${encodeURIComponent(pageFile)}&protoWeb-mode=edit&protoWeb-token=${token}`
    }).replace(/</g, "\\u003c");

    const headAssets = '<link rel="stylesheet" href="/annotation-editor/editor.css">';
    const bodyAssets = `<script>window.__PROTOTYPE_ANNOTATION_EDITOR_CONFIG__=${config};</script><script src="/annotation-editor/editor.js"></script>`;
    
    const bodyOpenIndex = html.search(/<body\b/i);
    const headCloseIndex = bodyOpenIndex >= 0 ? html.toLowerCase().lastIndexOf("</head>", bodyOpenIndex) : -1;
    const withStyles = headCloseIndex >= 0
      ? `${html.slice(0, headCloseIndex)}${headAssets}\n${html.slice(headCloseIndex)}`
      : `${headAssets}\n${html}`;
    const bodyCloseIndex = withStyles.toLowerCase().lastIndexOf("</body>");
    return bodyCloseIndex >= 0
      ? `${withStyles.slice(0, bodyCloseIndex)}${bodyAssets}\n${withStyles.slice(bodyCloseIndex)}`
      : `${withStyles}\n${bodyAssets}`;
  }

  ensureSession(fullPath, html) {
    const baseHash = sha256(html);
    const existing = this.activeSessions.get(fullPath);
    if (existing && existing.baseHtmlHash === baseHash && existing.status === 'draft') {
      return existing;
    }

    const { annotations, globalSections, rawData } = this.extractAnnotationsFromHtml(html);
    const sessionId = createSessionId();
    const now = new Date().toISOString();

    const session = {
      format: "protoWeb-review-session@1",
      prototypeId: rawData?.prototypeId || path.basename(fullPath, '.html'),
      sessionId,
      dataScriptId: "prototypeAnnotationData",
      sourceHtml: path.basename(fullPath),
      baseRevision: Number(rawData?.version) || 1,
      baseHtmlHash: baseHash,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      operations: [],
      baseAnnotations: annotations,
      baseGlobalMeta: rawData?.globalMeta || {},
      workingGlobalMeta: rawData?.globalMeta || {},
      baseGlobalSections: globalSections,
      workingGlobalSections: globalSections.map(s => ({ ...s, _editState: "original" })),
      workingAnnotations: annotations.map(n => ({ ...n, _editState: "original", _contentPolicy: "direct" }))
    };

    this.activeSessions.set(fullPath, session);
    return session;
  }

  resolveActiveFilePath(req) {
    const pageFile = req.query.file || (req.body && req.body.file);
    if (pageFile && this.workspaceDir) {
      return path.isAbsolute(pageFile) ? pageFile : path.resolve(this.workspaceDir, pageFile);
    }
    return this.activeEditFile;
  }

  setupRoutes() {
    // 0. 根路由直接访问统一多页面 PRD 总控工作台 (图二)
    this.app.get('/', (req, res) => {
      if (!this.workspaceDir) return res.send('ProtoHub Server Ready');
      const hubPath = path.join(this.workspaceDir, 'index.html');
      if (fs.existsSync(hubPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.sendFile(hubPath);
      }
      const scanned = this.scanHtmlFiles(this.workspaceDir);
      const visible = scanned.filter(p => p.visible !== false && !p.isWrapperHub);
      const target = visible[0] || scanned[0];
      if (target) {
        return res.redirect(`/${target.path}`);
      }
      res.send('ProtoHub: 未扫描到 HTML 原型页面');
    });

    // 0.1 静态提供官方标注编辑器前端资源
    this.app.get('/annotation-editor/editor.css', (req, res) => {
      const cssPath = path.join(this.editorDir, 'prototype-annotation-editor.css');
      if (fs.existsSync(cssPath)) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        return res.sendFile(cssPath);
      }
      res.status(404).send('Not Found');
    });

    this.app.get('/annotation-editor/editor.js', (req, res) => {
      const jsPath = path.join(this.editorDir, 'prototype-annotation-editor.js');
      if (fs.existsSync(jsPath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        return res.sendFile(jsPath);
      }
      res.status(404).send('Not Found');
    });

    // 1. 获取项目信息
    this.app.get('/api/project/info', (req, res) => {
      if (!this.workspaceDir) return res.status(400).json({ error: '未选择项目目录' });

      const scanned = this.scanHtmlFiles(this.workspaceDir);
      const configPath = path.join(this.workspaceDir, '.protohub.json');
      let customPages = null;
      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (cfg.pages && Array.isArray(cfg.pages)) customPages = cfg.pages;
        } catch (e) {}
      }

      res.json({
        workspaceDir: this.workspaceDir,
        lanIp: this.getLanIp(),
        port: this.port,
        token: this.token,
        pages: customPages || scanned,
        rawScanned: scanned
      });
    });

    // 2. 页面管理
    this.app.post('/api/project/pages', (req, res) => {
      if (!this.workspaceDir) return res.status(400).json({ error: '未选择工作区' });
      const { pages } = req.body;
      const configPath = path.join(this.workspaceDir, '.protohub.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      config.pages = pages;
      config.updatedAt = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      res.json({ success: true, pages });
    });

    // 3. 官方标准编辑接口
    this.app.get('/api/review/session', (req, res) => {
      const targetPath = this.resolveActiveFilePath(req);
      if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ message: '未找到待编辑的 HTML 页面' });
      }

      let html = fs.readFileSync(targetPath, 'utf8');
      html = this.prepareHtmlForEditing(html, targetPath);
      const session = this.ensureSession(targetPath, html);
      res.json(session);
    });

    this.app.put('/api/review/session', (req, res) => {
      const targetPath = this.resolveActiveFilePath(req);
      if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ message: '未找到待编辑的 HTML 页面' });
      }

      const incoming = req.body;
      incoming.updatedAt = new Date().toISOString();
      incoming.status = 'draft';
      this.activeSessions.set(targetPath, incoming);
      res.json({
        status: "saved",
        sessionId: incoming.sessionId,
        updatedAt: incoming.updatedAt,
        operationCount: incoming.operations ? incoming.operations.length : 0
      });
    });

    this.app.post('/api/review/apply', (req, res) => {
      const targetPath = this.resolveActiveFilePath(req);
      if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ message: '未找到待应用的 HTML 页面' });
      }

      const session = this.activeSessions.get(targetPath);
      if (!session) return res.status(404).json({ message: '找不到当前编辑会话' });

      try {
        let currentHtml = fs.readFileSync(targetPath, 'utf8');
        currentHtml = this.prepareHtmlForEditing(currentHtml, targetPath);
        const { rawData } = this.extractAnnotationsFromHtml(currentHtml);
        const nextData = rawData || { prototypeId: path.basename(targetPath, '.html') };

        nextData.globalSections = (session.workingGlobalSections || [])
          .filter(item => item._editState !== 'deleted')
          .map(item => {
            const copy = { ...item };
            delete copy._editState;
            delete copy._contentPolicy;
            delete copy._aiContent;
            delete copy._aiFormat;
            delete copy._route;
            return copy;
          });

        nextData.annotations = (session.workingAnnotations || [])
          .filter(item => item._editState !== 'deleted')
          .map(item => {
            const copy = { ...item };
            delete copy._editState;
            delete copy._contentPolicy;
            delete copy._aiContent;
            delete copy._aiFormat;
            delete copy._route;
            return copy;
          });

        nextData.version = (Number(nextData.version) || 1) + 1;

        const dataRegex = /(<script\b[^>]*\bid=["']prototypeAnnotationData["'][^>]*>)[\s\S]*?(<\/script>)/i;
        if (dataRegex.test(currentHtml)) {
          currentHtml = currentHtml.replace(dataRegex, `$1\n${JSON.stringify(nextData, null, 2)}\n$2`);
        } else {
          currentHtml = currentHtml.replace('</body>', `\n<script id="prototypeAnnotationData" type="application/json">\n${JSON.stringify(nextData, null, 2)}\n</script>\n</body>`);
        }

        fs.writeFileSync(targetPath, currentHtml, 'utf8');

        const baseName = path.basename(targetPath, '.html');
        const siblingJson = path.join(path.dirname(targetPath), `${baseName}-annotation.json`);
        if (fs.existsSync(siblingJson)) {
          fs.writeFileSync(siblingJson, JSON.stringify(nextData, null, 2), 'utf8');
        }

        session.status = 'applied';
        session.updatedAt = new Date().toISOString();
        this.activeSessions.delete(targetPath);

        res.json({
          status: 'applied',
          message: '修改已成功持久化写入原文件！',
          version: nextData.version
        });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // 4. 读取指定页面标注
    this.app.get('/api/annotations', (req, res) => {
      const pageFile = req.query.file;
      if (!pageFile || !this.workspaceDir) return res.status(400).json({ error: '参数缺失' });
      const fullPath = path.resolve(this.workspaceDir, pageFile);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: '页面不存在' });

      const html = fs.readFileSync(fullPath, 'utf8');
      const { annotations, globalSections, globalDoc } = this.extractAnnotationsFromHtml(html);
      res.json({ annotations, globalSections, globalDoc });
    });

    // 5. 核心 Prototype 预览与编辑路由
    this.app.get('/prototype', (req, res) => {
      const pageFile = req.query.file;
      if (!pageFile || !this.workspaceDir) return res.status(400).send('缺少页面参数');
      const fullPath = path.resolve(this.workspaceDir, pageFile);
      if (!fs.existsSync(fullPath)) return res.status(404).send('页面文件不存在');
      
      this.activeEditFile = fullPath;

      let html = fs.readFileSync(fullPath, 'utf8');
      const isEditMode = req.query['protoWeb-mode'] === 'edit';

      if (isEditMode) {
        html = this.prepareHtmlForEditing(html, fullPath);
        this.ensureSession(fullPath, html);
        const injectedHtml = this.injectEditor(html, this.token, pageFile);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(injectedHtml);
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    });

    // 6. 局域网分享与二维码 (直达包含顶部多页面 Tab 的统一总控工作台 - 图二)
    this.app.get('/api/share/info', async (req, res) => {
      const lanIp = this.getLanIp();
      const pageId = req.query.id || (this.activeEditFile ? path.basename(this.activeEditFile, '.html') : '');
      const hubExists = fs.existsSync(path.join(this.workspaceDir, 'index.html'));
      
      // 统一跳转到带顶部 Tab 总控工作台
      const shareUrl = hubExists
        ? (pageId ? `http://${lanIp}:${this.port}/index.html#page=${encodeURIComponent(pageId)}` : `http://${lanIp}:${this.port}/index.html`)
        : `http://${lanIp}:${this.port}/`;
      
      const qrDataUrl = await qrcode.toDataURL(shareUrl, { width: 260, margin: 1 });
      res.json({
        lanIp,
        port: this.port,
        shareUrl,
        qrDataUrl,
        pageId
      });
    });

    // 7. GitHub Pages 配置读取
    this.app.get('/api/deploy/github/config', async (req, res) => {
      if (!this.workspaceDir) return res.status(400).json({ error: '未选择项目目录' });
      let gitAvailable = false;
      let gitVersion = '';
      try {
        const { stdout } = await runCmd('git', ['--version']);
        gitAvailable = true;
        gitVersion = stdout.trim();
      } catch (e) {}

      const configPath = path.join(this.workspaceDir, '.protohub.json');
      let savedConfig = {};
      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (cfg.github) savedConfig = cfg.github;
        } catch (e) {}
      }

      res.json({
        gitAvailable,
        gitVersion,
        savedConfig: {
          repoUrl: savedConfig.repoUrl || '',
          branch: savedConfig.branch || 'gh-pages',
          subDir: savedConfig.subDir || '',
          token: savedConfig.token || ''
        }
      });
    });

    // 8. 执行 GitHub Pages 发布
    this.app.post('/api/deploy/github', async (req, res) => {
      if (!this.workspaceDir) return res.status(400).json({ error: '未选择工作区' });
      const { repoUrl, branch = 'gh-pages', subDir = '', token = '', commitMessage, pages } = req.body;
      if (!repoUrl || !repoUrl.trim()) {
        return res.status(400).json({ error: '请提供 GitHub 仓库地址' });
      }

      const parsed = parseGitHubUrl(repoUrl);
      if (!parsed) {
        return res.status(400).json({ error: '无法解析 GitHub 仓库地址，请检查格式 (如 https://github.com/用户名/仓库名)' });
      }

      // 保存配置到 .protohub.json
      const configPath = path.join(this.workspaceDir, '.protohub.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      config.github = {
        repoUrl: repoUrl.trim(),
        branch: (branch || 'gh-pages').trim(),
        subDir: (subDir || '').trim(),
        token: (token || '').trim(),
        lastDeployedAt: new Date().toISOString()
      };
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      } catch (e) {}

      const stagingDir = path.join(os.tmpdir(), `protohub-gh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
      try {
        fs.mkdirSync(stagingDir, { recursive: true });

        // 确定放置静态原型的目标子目录
        const targetDir = subDir && subDir.trim() ? path.join(stagingDir, subDir.trim()) : stagingDir;
        fs.mkdirSync(targetDir, { recursive: true });

        // 获取要发布的页面清单
        let exportPages = pages;
        if (!exportPages || !Array.isArray(exportPages) || exportPages.length === 0) {
          const scanned = this.scanHtmlFiles(this.workspaceDir);
          exportPages = config.pages || scanned;
        }
        const visiblePages = exportPages.filter(p => p.visible !== false && !p.isWrapperHub);

        // 1. 复制所有选中的 HTML 原型文件及标注 JSON
        for (const pg of visiblePages) {
          const srcHtml = path.join(this.workspaceDir, pg.path);
          if (fs.existsSync(srcHtml)) {
            const destHtml = path.join(targetDir, pg.path);
            fs.mkdirSync(path.dirname(destHtml), { recursive: true });
            fs.copyFileSync(srcHtml, destHtml);

            // 检查同名标注 json
            const baseName = path.basename(pg.path, '.html');
            const siblingJson = path.join(path.dirname(srcHtml), `${baseName}-annotation.json`);
            if (fs.existsSync(siblingJson)) {
              fs.copyFileSync(siblingJson, path.join(path.dirname(destHtml), `${baseName}-annotation.json`));
            }
          }
        }

        // 2. 复制工作区中的公共辅助文件/资源
        const workspaceEntries = fs.readdirSync(this.workspaceDir, { withFileTypes: true });
        for (const entry of workspaceEntries) {
          if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.prototype-review' || entry.name === '.protohub.json') continue;
          const srcPath = path.join(this.workspaceDir, entry.name);
          const destPath = path.join(targetDir, entry.name);
          if (entry.isFile()) {
            if (entry.name !== 'index.html' && (entry.name.endsWith('.js') || entry.name.endsWith('.json') || entry.name.endsWith('.css') || entry.name.endsWith('.md') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg') || entry.name.endsWith('.svg'))) {
              fs.copyFileSync(srcPath, destPath);
            }
          } else if (entry.isDirectory() && ['assets', 'images', 'img', 'css', 'js', 'static'].includes(entry.name.toLowerCase())) {
            copyDirRecursive(srcPath, destPath);
          }
        }

        // 3. 构建统一多页面 PRD 总控 Hub targetDir/index.html
        const srcHubPath = path.join(this.workspaceDir, 'index.html');
        const destHubPath = path.join(targetDir, 'index.html');
        const pagesJsonStr = JSON.stringify(visiblePages, null, 2);

        if (fs.existsSync(srcHubPath)) {
          let hubHtml = fs.readFileSync(srcHubPath, 'utf8');
          if (hubHtml.includes('DEFAULT_PAGES')) {
            hubHtml = hubHtml.replace(/const\s+DEFAULT_PAGES\s*=\s*\[[\s\S]*?\];/m, `const DEFAULT_PAGES = ${pagesJsonStr};`);
          }
          fs.writeFileSync(destHubPath, hubHtml, 'utf8');
        } else {
          const defaultHubHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>产品需求与原型交互工作台 (PRD)</title>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, sans-serif; background: #edf0f6; color: #1e293b; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.top-hub-header { height: 48px; background: #ffffff; border-bottom: 1px solid #dde1eb; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; flex-shrink: 0; z-index: 100; }
.hub-brand { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #1e293b; }
.hub-tag { background: #3388ff; color: #ffffff; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
.hub-tabs-container { display: flex; align-items: center; gap: 6px; flex: 1; margin: 0 16px; overflow-x: auto; scrollbar-width: none; }
.hub-tabs-container::-webkit-scrollbar { display: none; }
.hub-tab-chip { padding: 4px 12px; border-radius: 16px; font-size: 12.5px; font-weight: 500; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
.hub-tab-chip.is-active { background: #3388ff; color: #ffffff; border-color: #3388ff; font-weight: 700; box-shadow: 0 2px 6px rgba(51, 136, 255, 0.3); }
.hub-controls { display: flex; align-items: center; gap: 8px; }
.hub-ctrl-btn { border: 1px solid #cbd5e1; background: #ffffff; color: #475569; border-radius: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.hub-ctrl-btn.active { background: #1e293b; color: #fff; border-color: #1e293b; }
.hub-body { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #edf0f6; padding: 12px; }
.hub-frame-wrapper { width: 100%; height: 100%; transition: all 0.25s ease; border-radius: 8px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
.hub-frame-wrapper.is-mobile { width: 390px; height: 844px; border-radius: 44px; box-shadow: 0 0 0 12px #1e293b, 0 25px 50px -12px rgba(0,0,0,0.35); }
iframe { width: 100%; height: 100%; border: none; }
</style>
</head>
<body>
<header class="top-hub-header">
  <div class="hub-brand">
    <span class="hub-tag">PRD Hub</span>
    <span>需求与原型总控</span>
  </div>
  <div class="hub-tabs-container" id="tabsBar"></div>
  <div class="hub-controls">
    <button class="hub-ctrl-btn active" id="btnMobile" onclick="setViewMode('mobile')">📱 移动端 (390px)</button>
    <button class="hub-ctrl-btn" id="btnPc" onclick="setViewMode('pc')">💻 PC 宽屏</button>
  </div>
</header>
<main class="hub-body">
  <div class="hub-frame-wrapper is-mobile" id="frameWrapper">
    <iframe id="mainFrame"></iframe>
  </div>
</main>
<script>
const DEFAULT_PAGES = ${pagesJsonStr};
let activeId = DEFAULT_PAGES[0]?.id || '';

function renderTabs() {
  const bar = document.getElementById('tabsBar');
  bar.innerHTML = DEFAULT_PAGES.map(p => \`
    <button class="hub-tab-chip \${p.id === activeId ? 'is-active' : ''}" onclick="switchPage('\${p.id}')">\${p.name}</button>
  \`).join('');
}

function switchPage(id) {
  const pg = DEFAULT_PAGES.find(p => p.id === id);
  if (!pg) return;
  activeId = pg.id;
  window.location.hash = 'page=' + pg.id;
  renderTabs();
  const frame = document.getElementById('mainFrame');
  if (!frame.src.endsWith(pg.path)) {
    frame.src = pg.path;
  }
}

function setViewMode(mode) {
  const wrap = document.getElementById('frameWrapper');
  document.getElementById('btnMobile').className = 'hub-ctrl-btn ' + (mode === 'mobile' ? 'active' : '');
  document.getElementById('btnPc').className = 'hub-ctrl-btn ' + (mode === 'pc' ? 'active' : '');
  wrap.className = 'hub-frame-wrapper ' + (mode === 'mobile' ? 'is-mobile' : 'is-pc');
}

window.addEventListener('DOMContentLoaded', () => {
  renderTabs();
  const hash = window.location.hash.replace('#page=', '').toLowerCase();
  const match = DEFAULT_PAGES.find(p => p.id.toLowerCase() === hash || p.path.toLowerCase().includes(hash));
  if (match) switchPage(match.id);
  else if (DEFAULT_PAGES.length) switchPage(DEFAULT_PAGES[0].id);
});
</script>
</body>
</html>`;
          fs.writeFileSync(destHubPath, defaultHubHtml, 'utf8');
        }

        // 4. 创建 .nojekyll (必须，确保 GitHub Pages 不忽略特殊文件)
        fs.writeFileSync(path.join(stagingDir, '.nojekyll'), '', 'utf8');

        // 如果配置了子目录且根目录没有 index.html，创建根目录跳转页
        if (subDir && subDir.trim() && !fs.existsSync(path.join(stagingDir, 'index.html'))) {
          const rootRedirect = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=./${subDir.trim()}/index.html">
  <title>Redirecting to ${subDir.trim()}...</title>
</head>
<body>
  <p>Redirecting to <a href="./${subDir.trim()}/index.html">${subDir.trim()}</a>...</p>
</body>
</html>`;
          fs.writeFileSync(path.join(stagingDir, 'index.html'), rootRedirect, 'utf8');
        }

        // 5. 准备 Git 认证远程地址
        let pushRemoteUrl = repoUrl.trim();
        if (token && token.trim() && pushRemoteUrl.startsWith('https://')) {
          const rawUrl = pushRemoteUrl.replace(/^https?:\/\/(?:[^@]+@)?/, '');
          pushRemoteUrl = `https://x-access-token:${encodeURIComponent(token.trim())}@${rawUrl}`;
        }

        const targetBranch = (branch || 'gh-pages').trim();
        const msg = commitMessage || `Deploy prototypes via ProtoHub (${new Date().toLocaleString()})`;

        // 6. 执行 Git 初始化并推送
        await runCmd('git', ['init'], { cwd: stagingDir });
        await runCmd('git', ['config', 'user.name', 'ProtoHub Deployer'], { cwd: stagingDir });
        await runCmd('git', ['config', 'user.email', 'protohub@noreply.github.com'], { cwd: stagingDir });
        await runCmd('git', ['checkout', '-B', targetBranch], { cwd: stagingDir });
        await runCmd('git', ['add', '-A'], { cwd: stagingDir });
        await runCmd('git', ['commit', '-m', `"${msg.replace(/"/g, '\\"')}"`], { cwd: stagingDir });
        await runCmd('git', ['remote', 'add', 'origin', pushRemoteUrl], { cwd: stagingDir });
        await runCmd('git', ['push', '--force', 'origin', targetBranch], { cwd: stagingDir });

        // 7. 计算 GitHub Pages 在线访问地址与设置页地址
        const { owner, repo } = parsed;
        let baseUrl = '';
        if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
          baseUrl = `https://${owner.toLowerCase()}.github.io`;
        } else {
          baseUrl = `https://${owner.toLowerCase()}.github.io/${repo}`;
        }

        if (subDir && subDir.trim()) {
          baseUrl = `${baseUrl}/${subDir.trim()}`;
        }

        const activeId = visiblePages[0]?.id || '';
        const pagesUrl = `${baseUrl}/index.html${activeId ? `#page=${encodeURIComponent(activeId)}` : ''}`;
        const settingsPagesUrl = `https://github.com/${owner}/${repo}/settings/pages`;
        const deploymentsUrl = `https://github.com/${owner}/${repo}/deployments`;
        const qrDataUrl = await qrcode.toDataURL(pagesUrl, { width: 260, margin: 1 });

        // 如果用户提供了 Token，尝试通过 GitHub API 自动开启 Pages 服务
        let autoEnabledPages = false;
        if (token && token.trim()) {
          try {
            const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token.trim()}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'ProtoHub-Deployer'
              },
              body: JSON.stringify({
                source: { branch: targetBranch, path: '/' }
              })
            });
            if (apiRes.status === 201 || apiRes.status === 409) {
              autoEnabledPages = true;
            }
          } catch (apiErr) {
            console.warn('自动开启 GitHub Pages API 响应:', apiErr.message);
          }
        }

        // 清理临时目录
        try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}

        res.json({
          success: true,
          message: '🎉 成功发布到 GitHub Pages！',
          pagesUrl,
          baseUrl,
          settingsPagesUrl,
          deploymentsUrl,
          autoEnabledPages,
          qrDataUrl,
          pageCount: visiblePages.length,
          branch: targetBranch,
          owner,
          repo
        });
      } catch (err) {
        // 清理临时目录
        try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}
        console.error('GitHub Pages 发布失败:', err);
        res.status(500).json({
          success: false,
          error: err.message || '发布失败'
        });
      }
    });

    // 8.1 检测 GitHub Pages 在线状态与构建进度
    this.app.get('/api/deploy/github/check-status', async (req, res) => {
      const { url, owner, repo, token } = req.query;
      if (!url) return res.status(400).json({ error: '缺少 url 参数' });

      let isReady = false;
      let statusCode = 0;
      let buildStatus = 'unknown';

      try {
        const probeRes = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'ProtoHub-StatusChecker' } });
        statusCode = probeRes.status;
        if (statusCode === 200) {
          isReady = true;
        }
      } catch (e) {}

      if (owner && repo && token) {
        try {
          const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'ProtoHub-StatusChecker'
            }
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            buildStatus = apiData.status || 'built';
          }
        } catch (e) {}
      }

      res.json({
        isReady,
        statusCode,
        buildStatus
      });
    });

    // 9. 静态文件兜底托管
    this.app.use((req, res, next) => {
      if (!this.workspaceDir) return next();
      const safePath = path.resolve(this.workspaceDir, decodeURIComponent(req.path.slice(1)));
      if (safePath.startsWith(this.workspaceDir) && fs.existsSync(safePath)) {
        if (fs.statSync(safePath).isFile()) {
          return res.sendFile(safePath);
        }
      }
      next();
    });
  }

  async start(preferredPort = 9000) {
    let port = preferredPort;
    return new Promise((resolve, reject) => {
      const tryListen = () => {
        this.server = this.app.listen(port, '0.0.0.0', () => {
          this.port = port;
          console.log(`ProtoHub Review Server running at http://0.0.0.0:${port}`);
          resolve(this.port);
        });

        this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            port += 1;
            tryListen();
          } else {
            reject(err);
          }
        });
      };
      tryListen();
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

if (require.main === module) {
  const server = new ProtoServer();
  const port = process.env.PORT || parseInt(process.argv[2], 10) || 9000;
  const workspaceDir = process.argv[3] || path.join(__dirname, 'demo');
  
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
    // 创建示例文件
    const sampleHtml = `<!DOCTYPE html>
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
</html>`;
    fs.writeFileSync(path.join(workspaceDir, 'home.html'), sampleHtml, 'utf8');
  }

  server.setWorkspace(workspaceDir);
  server.start(port).then((actualPort) => {
    console.log(`\n=================================================`);
    console.log(`🎉 ProtoHub 独立后端服务启动成功！`);
    console.log(`📍 服务端口: ${actualPort}`);
    console.log(`📁 原型工作区目录: ${workspaceDir}`);
    console.log(`🌐 本地访问地址: http://localhost:${actualPort}`);
    console.log(`=================================================\n`);
  }).catch((err) => {
    console.error(`❌ 服务启动失败:`, err);
  });
}

module.exports = ProtoServer;
