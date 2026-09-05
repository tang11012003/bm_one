/**
 * ProtoHub 官方审阅与标注引擎适配器 (浏览器端完整重现桌面 .exe 原生运行时)
 */
class WebAnnotationEngine {
  constructor() {
    this.assets = window.__PROTO_ENGINE_ASSETS__ || {};
  }

  cleanHtml(rawHtml) {
    let html = rawHtml || '';
    
    // 移除历史注入的编辑器资源与拦截器
    html = html.replace(/<style\s+id=["']protoAnnotationEditorCss["'][^>]*>[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<script\s+id=["']protoMockApiInterceptor["'][^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script[^>]*>\s*window\.__PROTOTYPE_ANNOTATION_EDITOR_CONFIG__[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script\s+id=["']protoAnnotationEditorJs["'][^>]*>[\s\S]*?<\/script>/gi, '');

    // 移除历史注入的打点样式与脚本
    html = html.replace(/<style\s+id=["']protoReviewMarkerCss["'][^>]*>[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<script\s+id=["']protoReviewMarkerScript["'][^>]*>[\s\S]*?<\/script>/gi, '');

    // 移除审阅样式与运行时
    html = html.replace(/<style\s+id=["']protoAnnotationCss["'][^>]*>[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<style\s+id=["']protoMobileAnnotationCss["'][^>]*>[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<script\s+id=["']protoAnnotationRuntime["'][^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script\s+id=["']protoMobileMobileAnnotationRuntime["'][^>]*>[\s\S]*?<\/script>/gi, '');

    // 移除审阅 Shell DOM 节点
    html = html.replace(/<div\s+id=["']protoMobileStage["'][^>]*>[\s\S]*?<\/div>\s*<div\s+id=["']prototypeAnnotationRoot["'][^>]*>[\s\S]*?<\/div>/gi, '');
    html = html.replace(/<div\s+id=["']protoWebReviewWorkspace["'][^>]*>[\s\S]*?<\/div>/gi, '');

    // 清理解包 wrapper
    html = html.replace(/<div\s+data-proto-app[^>]*class=["']proto-app-wrapper["'][^>]*>([\s\S]*?)<\/div>/gi, (m, inner) => inner);
    html = html.replace(/\s*data-proto-app(?:="[^"]*")?/gi, '');
    html = html.replace(/\s*data-proto-platform=["'][^"']*["']/gi, '');

    // 清理可能附带在 body/html 上的编辑模式类
    html = html.replace(/\bproto-editor-edit-mode\b/g, '');
    html = html.replace(/\bprotoMobile-ready\b/g, '');

    return html;
  }

  injectDataOnly(rawHtml, data) {
    let html = this.cleanHtml(rawHtml);
    const scriptTag = `\n<script id="prototypeAnnotationData" type="application/json">\n${JSON.stringify(data, null, 2)}\n</script>\n`;
    if (html.includes('id="prototypeAnnotationData"')) {
      html = html.replace(/<script\s+id=["']prototypeAnnotationData["'][^>]*>[\s\S]*?<\/script>/i, () => scriptTag.trim());
    } else if (html.includes('</body>')) {
      html = html.replace('</body>', () => `${scriptTag}</body>`);
    } else {
      html += scriptTag;
    }
    return html;
  }

  buildData(pageFile, annotations = [], globalSections = [], pages = [], isMobile = true, existingRawData = null) {
    const pagesList = Array.isArray(pages) && pages.length > 0 ? pages.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      visible: p.visible !== false
    })) : undefined;

    return {
      prototypeId: pageFile ? pageFile.replace(/\.html$/i, '') : (existingRawData?.prototypeId || 'page'),
      version: Number(existingRawData?.version) || 1,
      pages: pagesList || existingRawData?.pages,
      mobile: isMobile ? { appRoot: "[data-proto-app]", deviceWidth: 390 } : undefined,
      globalMeta: existingRawData?.globalMeta || { name: "原型说明", version: "V1.0", updatedAt: new Date().toISOString().slice(0, 10) },
      globalSections: globalSections && globalSections.length > 0 ? globalSections : (existingRawData?.globalSections && existingRawData.globalSections.length > 0 ? existingRawData.globalSections : [
        { id: "sec_overview", title: "1. 业务背景与概述", content: "请在此处填写该页面的产品背景与功能目标说明。" }
      ]),
      annotations: annotations || existingRawData?.annotations || []
    };
  }

  prepareHtmlForReview(rawHtml, pageFile, annotations = [], globalSections = [], pages = [], requestedPlatform = 'mobile') {
    let html = this.cleanHtml(rawHtml);
    const isMobile = requestedPlatform === 'mobile' || html.includes('id="app"') || html.includes('max-width: 375px') || html.includes('max-width: 390px') || html.includes('viewport');
    const platform = isMobile ? 'mobile' : 'web';

    const data = this.buildData(pageFile, annotations, globalSections, pages, isMobile);
    html = this.injectDataOnly(html, data);

    // 注入审阅打点与高亮联动脚本
    const markerScript = `
      <style id="protoReviewMarkerCss">
        .proto-review-pin {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #2563eb;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4), 0 0 0 2px #ffffff;
          cursor: pointer;
          z-index: 2147483640;
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s;
          pointer-events: auto;
          user-select: none;
        }
        .proto-review-pin:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.6), 0 0 0 3px #ffffff;
        }
        .proto-review-pin.is-active {
          background: #ef4444;
          transform: scale(1.25);
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.3), 0 4px 14px rgba(239, 68, 68, 0.6);
          animation: protoPinPulse 1.5s infinite;
        }
        @keyframes protoPinPulse {
          0%, 100% { transform: scale(1.25); }
          50% { transform: scale(1.38); }
        }
      </style>
      <script id="protoReviewMarkerScript">
        (function() {
          const notes = ${JSON.stringify(annotations || [])};
          let activeIdx = -1;

          function renderPins() {
            document.querySelectorAll('.proto-review-pin').forEach(el => el.remove());
            notes.forEach((note, idx) => {
              if (!note.target) return;
              const el = document.querySelector(note.target);
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const pin = document.createElement('div');
              pin.className = 'proto-review-pin' + (idx === activeIdx ? ' is-active' : '');
              pin.textContent = String(idx + 1);
              pin.title = '#' + (idx + 1) + ' ' + (note.title || '需求项');
              pin.dataset.idx = idx;

              const xRatio = Number(note.x) >= 0 ? Math.min(1, Math.max(0, Number(note.x))) : 0.5;
              const yRatio = Number(note.y) >= 0 ? Math.min(1, Math.max(0, Number(note.y))) : 0.5;

              const pageX = rect.left + window.scrollX + rect.width * xRatio;
              const pageY = rect.top + window.scrollY + rect.height * yRatio;

              pin.style.left = (pageX - 12) + 'px';
              pin.style.top = (pageY - 12) + 'px';

              pin.onclick = (e) => {
                e.stopPropagation();
                activeIdx = idx;
                document.querySelectorAll('.proto-review-pin').forEach((p, i) => p.classList.toggle('is-active', i === idx));
                window.parent.postMessage({ type: 'SELECT_PIN', index: idx }, '*');
              };

              document.body.appendChild(pin);
            });
          }

          window.addEventListener('load', renderPins);
          window.addEventListener('resize', renderPins);
          window.addEventListener('scroll', renderPins, true);
          setTimeout(renderPins, 100);
          setTimeout(renderPins, 400);

          window.addEventListener('message', (e) => {
            if (!e.data) return;
            if (e.data.type === 'HIGHLIGHT_PIN') {
              activeIdx = e.data.index;
              document.querySelectorAll('.proto-review-pin').forEach((p, i) => {
                p.classList.toggle('is-active', i === activeIdx);
                if (i === activeIdx) {
                  p.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              });
            }
          });
        })();
      </script>
    `;

    if (html.includes('</body>')) {
      return html.replace('</body>', () => `${markerScript}\n</body>`);
    }
    return html + markerScript;
  }

  prepareHtmlForEditing(rawHtml, pageFile, annotations = [], globalSections = [], pages = [], requestedPlatform = 'mobile') {
    const isMobile = requestedPlatform === 'mobile' || (rawHtml && (rawHtml.includes('id="app"') || rawHtml.includes('max-width: 375px') || rawHtml.includes('max-width: 390px') || rawHtml.includes('viewport')));
    const platform = isMobile ? 'mobile' : 'web';
    const token = 'mock_token_' + Date.now();

    const data = this.buildData(pageFile, annotations, globalSections, pages, isMobile);
    let html = this.injectDataOnly(rawHtml, data);

    // 确保用户的业务 DOM 节点具备 data-proto-app 根容器
    if (/<div[^>]*\bid=["']app["']/i.test(html)) {
      html = html.replace(/<div([^>]*\bid=["']app["'][^>]*)>/i, (m, g1) => `<div${g1} data-proto-app data-proto-platform="${platform}">`);
    } else if (/<body[^>]*>/i.test(html)) {
      html = html.replace(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i, (m, g1, g2, g3) => `${g1}\n<div data-proto-app id="app" data-proto-platform="${platform}" class="proto-app-wrapper" style="min-height:100%; width:100%;">\n${g2}\n</div>\n${g3}`);
    } else {
      html = `<div data-proto-app id="app" data-proto-platform="${platform}" class="proto-app-wrapper">\n${html}\n</div>`;
    }

    // 注入审阅三栏骨架供编辑器挂载
    const cssContent = isMobile ? this.assets.mobileCss : this.assets.webCss;
    const shellContent = isMobile ? this.assets.mobileShell : this.assets.webShell;
    const runtimeContent = isMobile ? this.assets.mobileRuntime : this.assets.webRuntime;

    if (cssContent && shellContent) {
      const cssBlock = `\n<style id="protoAnnotationCss">\n${cssContent}\n</style>\n`;
      if (html.includes('</head>')) {
        html = html.replace('</head>', () => `${cssBlock}</head>`);
      } else {
        html = cssBlock + html;
      }

      const uiBlock = `\n${shellContent}\n<script id="protoAnnotationRuntime">\n${runtimeContent}\n</script>\n`;
      if (html.includes('</body>')) {
        html = html.replace('</body>', () => `${uiBlock}</body>`);
      } else {
        html += uiBlock;
      }
    }

    // 注入浏览器前端模拟 /api/review 接口拦截器 (100% 官方原生标注编辑器会话处理)
    const mockApiScript = `
      <script id="protoMockApiInterceptor">
        (function() {
          const originalFetch = window.fetch;
          let activeSession = null;

          function getInitData() {
            const dataEl = document.getElementById('prototypeAnnotationData');
            if (dataEl) {
              try { return JSON.parse(dataEl.textContent); } catch (e) {}
            }
            return {
              prototypeId: "${pageFile ? pageFile.replace(/\.html$/i, '') : 'page'}",
              version: 1,
              globalMeta: { name: "原型说明", version: "V1.0", updatedAt: new Date().toISOString().slice(0, 10) },
              globalSections: [
                { id: "sec_overview", title: "1. 业务背景与概述", content: "请在此处填写该页面的产品背景与功能目标说明。" }
              ],
              annotations: []
            };
          }

          window.fetch = async function(url, options = {}) {
            const urlStr = String(url);
            if (urlStr.includes('/api/review/session')) {
              if (options.method === 'PUT') {
                const body = JSON.parse(options.body || '{}');
                body.updatedAt = new Date().toISOString();
                activeSession = body;
                window.parent.postMessage({ type: 'SYNC_SESSION_DRAFT', session: body }, '*');
                return new Response(JSON.stringify({
                  status: 'saved',
                  sessionId: body.sessionId,
                  updatedAt: body.updatedAt,
                  operationCount: body.operations ? body.operations.length : 0
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }

              // GET /session
              const data = getInitData();
              const now = new Date().toISOString();
              activeSession = {
                format: "protoWeb-review-session@1",
                prototypeId: data.prototypeId || "${pageFile ? pageFile.replace(/\.html$/i, '') : 'page'}",
                sessionId: "sess-" + Date.now(),
                dataScriptId: "prototypeAnnotationData",
                sourceHtml: "${pageFile || 'index.html'}",
                baseRevision: Number(data.version) || 1,
                baseHtmlHash: "hash-" + Date.now(),
                status: "draft",
                createdAt: now,
                updatedAt: now,
                operations: [],
                baseAnnotations: data.annotations || [],
                baseGlobalMeta: data.globalMeta || {},
                workingGlobalMeta: data.globalMeta || {},
                baseGlobalSections: data.globalSections || [],
                workingGlobalSections: (data.globalSections || []).map(s => ({ ...s, _editState: "original" })),
                workingAnnotations: (data.annotations || []).map(n => ({ ...n, _editState: "original", _contentPolicy: "direct" }))
              };

              return new Response(JSON.stringify(activeSession), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            if (urlStr.includes('/api/review/apply')) {
              const data = getInitData();
              const session = activeSession;
              if (session) {
                data.globalSections = (session.workingGlobalSections || [])
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

                data.annotations = (session.workingAnnotations || [])
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

                data.version = (Number(data.version) || 1) + 1;
                const dataEl = document.getElementById('prototypeAnnotationData');
                if (dataEl) dataEl.textContent = JSON.stringify(data, null, 2);

                window.parent.postMessage({
                  type: 'APPLY_ANNOTATIONS',
                  nextData: data
                }, '*');

                return new Response(JSON.stringify({
                  status: 'applied',
                  message: '修改已成功保存！',
                  version: data.version
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
            }

            if (urlStr.includes('/api/review/status')) {
              return new Response(JSON.stringify({
                sessionId: activeSession ? activeSession.sessionId : '',
                updatedAt: activeSession ? activeSession.updatedAt : ''
              }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            return originalFetch.apply(this, arguments);
          };
        })();
      </script>
    `;

    const editorConfig = `
      <script>
        window.__PROTOTYPE_ANNOTATION_EDITOR_CONFIG__ = {
          token: "${token}",
          apiBase: "/api/review",
          platform: "${platform}",
          stableUrl: "javascript:void(0)"
        };
      </script>
    `;

    const editorAssets = `
      <style id="protoAnnotationEditorCss">
        ${this.assets.editorCss || ''}
      </style>
      ${mockApiScript}
      ${editorConfig}
      <script id="protoAnnotationEditorJs">
        ${this.assets.editorJs || ''}
      </script>
    `;

    if (html.includes('</body>')) {
      return html.replace('</body>', () => `${editorAssets}\n</body>`);
    }
    return html + editorAssets;
  }
}

window.WebAnnotationEngine = WebAnnotationEngine;
