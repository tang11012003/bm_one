/**
 * html-serializer.js — PRD 工作台 DOM 序列化与净化引擎
 * 功能：将编辑/运行时的 DOM 或 HTML 源码净化为干净、标准、无污染的独立 HTML，同时支持无损注入标注元数据。
 */
(function (global) {
  'use strict';

  function cleanDocumentNode(docClone) {
    if (!docClone) return;

    // 1. 移除所有工作台与编辑器注入的 UI / 辅助 DOM 元素
    const editorSelectors = [
      '[data-hve-editor]',
      '[data-proto-editor]',
      '#prototypeAnnotationRoot',
      '#protoMobileStage',
      '#protoWebReviewWorkspace',
      '#protoAnnotationGuideLines',
      '#protoSelectionOverlay',
      '.proto-editor-toolbar',
      '.proto-pin-marker',
      '.hve-editor-element'
    ];
    editorSelectors.forEach(sel => {
      try {
        const els = docClone.querySelectorAll(sel);
        els.forEach(el => el.remove());
      } catch (e) {}
    });

    // 2. 移除所有注入的临时 style 与 script
    const injectedScriptsAndStyles = [
      'style[data-hve-injected]',
      'style[data-proto-injected]',
      'style#protoAnnotationEditorCss',
      'style#protoReviewMarkerCss',
      'style#protoAnnotationCss',
      'style#protoMobileAnnotationCss',
      'script#protoMockApiInterceptor',
      'script#protoAnnotationEditorJs',
      'script#protoReviewMarkerScript',
      'script#protoAnnotationRuntime',
      'script#protoMobileMobileAnnotationRuntime',
      'script[id^="protoAnnotation"]'
    ];
    injectedScriptsAndStyles.forEach(sel => {
      try {
        const els = docClone.querySelectorAll(sel);
        els.forEach(el => el.remove());
      } catch (e) {}
    });

    // 3. 递归清洗所有元素的编辑属性与临时 class
    const allElements = docClone.querySelectorAll('*');
    allElements.forEach(el => {
      // 检查并移除 contenteditable（仅移除编辑态临时加上的）
      if (el.hasAttribute('data-hve-contenteditable') || el.hasAttribute('data-proto-editable')) {
        el.removeAttribute('contenteditable');
      }

      // 移除所有 data-hve-* 和 data-proto-* 属性
      const attrs = Array.from(el.attributes || []);
      attrs.forEach(attr => {
        if (
          attr.name.startsWith('data-hve-') ||
          attr.name.startsWith('data-proto-') ||
          attr.name === 'data-proto-app' ||
          attr.name === 'data-proto-platform'
        ) {
          el.removeAttribute(attr.name);
        }
      });

      // 移除编辑态注入的 class
      if (el.classList) {
        el.classList.remove('proto-editor-edit-mode', 'protoMobile-ready', 'hve-selected', 'hve-hovered');
        if (el.classList.length === 0 && el.getAttribute('class') === '') {
          el.removeAttribute('class');
        }
      }
    });

    // 4. 解包外层 wrapper（如果存在）
    const wrappers = docClone.querySelectorAll('div[class*="proto-app-wrapper"]');
    wrappers.forEach(wrap => {
      const parent = wrap.parentNode;
      if (parent) {
        while (wrap.firstChild) {
          parent.insertBefore(wrap.firstChild, wrap);
        }
        wrap.remove();
      }
    });

    return docClone;
  }

  /**
   * 序列化 DOM Document 为纯净标准 HTML 字符串
   */
  function serializeDocument(targetDoc) {
    if (!targetDoc || !targetDoc.documentElement) return '';
    const docClone = targetDoc.documentElement.cloneNode(true);
    cleanDocumentNode(docClone);
    return '<!DOCTYPE html>\n' + docClone.outerHTML;
  }

  /**
   * 净化已有的 HTML 字符串，移除所有注入代码
   */
  function cleanHtmlString(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return '';
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlStr, 'text/html');
        return serializeDocument(doc);
      } catch (e) {}
    }
    
    // 降级正则清洗
    return htmlStr
      .replace(/<style\s+id=["']protoAnnotationEditorCss["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\s+id=["']protoMockApiInterceptor["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script\s+id=["']protoAnnotationEditorJs["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\s+id=["']protoReviewMarkerCss["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\s+id=["']protoReviewMarkerScript["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\s+id=["']protoAnnotationCss["'][^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\s+id=["']protoAnnotationRuntime["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<div\s+id=["']protoMobileStage["'][^>]*>[\s\S]*?<\/div>\s*<div\s+id=["']prototypeAnnotationRoot["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div\s+id=["']prototypeAnnotationRoot["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div\s+id=["']protoWebReviewWorkspace["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class=["'][^"']*proto-app-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, '$1')
      .replace(/\s*data-proto-[a-zA-Z0-9_-]+(=["'][^"']*["'])?/gi, '')
      .replace(/\s*data-hve-[a-zA-Z0-9_-]+(=["'][^"']*["'])?/gi, '')
      .replace(/\bproto-editor-edit-mode\b/g, '')
      .replace(/\bprotoMobile-ready\b/g, '');
  }

  /**
   * 将标注数据 (annotations, globalSections, globalDoc) 无损注入/更新到 HTML 字符串中
   */
  function injectAnnotationData(htmlStr, data) {
    if (!htmlStr) htmlStr = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body></body></html>';
    
    // 准备纯净数据结构
    const cleanData = {
      version: '2.0.0',
      updatedAt: new Date().toISOString(),
      globalDoc: data.globalDoc || {},
      globalSections: Array.isArray(data.globalSections) ? data.globalSections : [],
      annotations: Array.isArray(data.annotations) ? data.annotations : [],
      mobile: data.mobile || null
    };

    const safeJson = JSON.stringify(cleanData, null, 2)
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');

    const dataScriptTag = `\n  <script id="prototypeAnnotationData" type="application/json">\n${safeJson}\n  </script>`;

    if (/<script\s+id=["']prototypeAnnotationData["'][^>]*>[\s\S]*?<\/script>/i.test(htmlStr)) {
      return htmlStr.replace(/<script\s+id=["']prototypeAnnotationData["'][^>]*>[\s\S]*?<\/script>/i, dataScriptTag.trim());
    }

    if (/<\/head>/i.test(htmlStr)) {
      return htmlStr.replace(/<\/head>/i, `${dataScriptTag}\n</head>`);
    } else if (/<\/body>/i.test(htmlStr)) {
      return htmlStr.replace(/<\/body>/i, `${dataScriptTag}\n</body>`);
    } else {
      return htmlStr + dataScriptTag;
    }
  }

  const Serializer = {
    cleanDocumentNode,
    serializeDocument,
    cleanHtmlString,
    injectAnnotationData
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Serializer;
  }
  global.HtmlSerializer = Serializer;
})(typeof window !== 'undefined' ? window : globalThis);
