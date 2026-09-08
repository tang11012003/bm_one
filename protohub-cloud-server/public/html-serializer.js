/**
 * html-serializer.js — PRD 工作台纯净 DOM 序列化与数据注入引擎
 * 完全遵循 html-visual-editor-main 原则：仅清除编辑器/审阅器自身注入的私有标签与脚本，绝对不破坏或删除用户的任何原型 DOM 与样式。
 */
(function (global) {
  'use strict';

  /**
   * 清除 DOM 树上由工作台注入的临时辅助标记与脚本
   */
  function cleanNode(node) {
    if (!node) return node;

    // 1. 移除编辑器自身创建的独立 UI 浮层
    const editorSelectors = [
      '[data-hve-editor]',
      '.proto-editor-toolbar',
      '.proto-review-pin',
      '#protoSelectionOverlay',
      '#protoAnnotationGuideLines'
    ];
    editorSelectors.forEach(sel => {
      try {
        const els = node.querySelectorAll(sel);
        els.forEach(el => el.remove());
      } catch (e) {}
    });

    // 2. 移除注入的辅助样式与脚本
    const injectedStylesAndScripts = [
      'style[data-hve-injected]',
      'style#protoReviewMarkerCss',
      'style#protoAnnotationEditorCss',
      'script#protoReviewMarkerScript',
      'script#protoAnnotationEditorJs',
      'script#protoMockApiInterceptor'
    ];
    injectedStylesAndScripts.forEach(sel => {
      try {
        const els = node.querySelectorAll(sel);
        els.forEach(el => el.remove());
      } catch (e) {}
    });

    // 3. 移除临时添加的编辑属性
    const allElements = node.querySelectorAll('*');
    allElements.forEach(el => {
      if (el.hasAttribute('data-hve-contenteditable') || el.hasAttribute('data-proto-editable')) {
        el.removeAttribute('contenteditable');
      }
      const attrs = Array.from(el.attributes || []);
      attrs.forEach(attr => {
        if (attr.name.startsWith('data-hve-')) {
          el.removeAttribute(attr.name);
        }
      });
      if (el.classList) {
        el.classList.remove('proto-editor-edit-mode', 'hve-selected', 'hve-hovered');
        if (el.classList.length === 0 && el.getAttribute('class') === '') {
          el.removeAttribute('class');
        }
      }
    });

    return node;
  }

  /**
   * 序列化 DOM Document 为干净的 HTML 字符串
   */
  function serializeDocument(targetDoc) {
    if (!targetDoc || !targetDoc.documentElement) return '';
    const docClone = targetDoc.documentElement.cloneNode(true);
    cleanNode(docClone);
    return '<!DOCTYPE html>\n' + docClone.outerHTML;
  }

  /**
   * 净化已有 HTML 字符串（仅剔除注入的 script/style，保留全部页面内容）
   */
  function cleanHtmlString(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return '';
    return htmlStr
      .replace(/<style\s+id=["']protoAnnotationEditorCss["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\s+id=["']protoMockApiInterceptor["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script\s+id=["']protoAnnotationEditorJs["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\s+id=["']protoReviewMarkerCss["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\s+id=["']protoReviewMarkerScript["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\s+id=["']protoAnnotationCss["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\s+id=["']protoAnnotationRuntime["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\s*data-proto-editable(=["'][^"']*["'])?/gi, '')
      .replace(/\s*data-hve-[a-zA-Z0-9_-]+(=["'][^"']*["'])?/gi, '')
      .replace(/\bproto-editor-edit-mode\b/g, '');
  }

  /**
   * 将标注数据 (annotations, globalSections, globalDoc) 无损注入/更新到原始 HTML 中
   */
  function injectAnnotationData(htmlStr, data) {
    if (!htmlStr || !htmlStr.trim()) {
      htmlStr = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>原型页面</title></head><body></body></html>';
    }
    
    let clean = cleanHtmlString(htmlStr);

    const cleanData = {
      prototypeId: data.prototypeId || 'page',
      version: 2,
      updatedAt: new Date().toISOString(),
      globalDoc: data.globalDoc || {},
      globalSections: Array.isArray(data.globalSections) ? data.globalSections : [],
      annotations: Array.isArray(data.annotations) ? data.annotations : [],
      mobile: data.mobile || { appRoot: "[data-proto-app]", deviceWidth: 390 }
    };

    const safeJson = JSON.stringify(cleanData, null, 2)
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');

    const scriptTag = `\n<script id="prototypeAnnotationData" type="application/json">\n${safeJson}\n</script>`;

    // 如果原 HTML 中已存在 prototypeAnnotationData 标签，直接无损替换
    if (/<script\s+id=["']prototypeAnnotationData["'][^>]*>[\s\S]*?<\/script>/i.test(clean)) {
      return clean.replace(/<script\s+id=["']prototypeAnnotationData["'][^>]*>[\s\S]*?<\/script>/i, () => scriptTag.trim());
    }

    // 优先注入在 </body> 之前，次选 </head> 之前，末尾兜底
    if (/<\/body>/i.test(clean)) {
      return clean.replace(/<\/body>/i, () => `${scriptTag}\n</body>`);
    } else if (/<\/head>/i.test(clean)) {
      return clean.replace(/<\/head>/i, () => `${scriptTag}\n</head>`);
    } else {
      return clean + scriptTag;
    }
  }

  const Serializer = {
    cleanNode,
    serializeDocument,
    cleanHtmlString,
    injectAnnotationData
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Serializer;
  }
  global.HtmlSerializer = Serializer;
})(typeof window !== 'undefined' ? window : globalThis);
