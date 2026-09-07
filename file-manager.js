/**
 * file-manager.js — Web 端与桌面端文件物理持久化管理器
 * 功能：利用 File System Access API 实现浏览器端对本地 HTML 文件的直接原地覆写（In-place Save），并支持安全降级。
 */
(function (global) {
  'use strict';

  /**
   * 将 HTML 内容直接物理写入 FileSystemFileHandle
   */
  async function saveToFileHandle(fileHandle, content) {
    if (!fileHandle) return false;
    try {
      // 检查/请求读写权限
      if (fileHandle.queryPermission) {
        const state = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (state !== 'granted') {
          const req = await fileHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            console.warn('[FileManager] 未获得文件写入授权');
            return false;
          }
        }
      }

      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      console.log(`[FileManager] ✅ 文件已成功物理写回磁盘: ${fileHandle.name}`);
      return true;
    } catch (e) {
      console.error('[FileManager] 物理写回文件失败:', e);
      return false;
    }
  }

  /**
   * 另存为文件 (Save As)
   */
  async function saveFileAs(content, suggestedName = 'prototype.html') {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{
            description: 'HTML Files',
            accept: { 'text/html': ['.html', '.htm'] }
          }]
        });
        const success = await saveToFileHandle(handle, content);
        if (success) return { success: true, handle };
      } catch (e) {
        if (e.name === 'AbortError') return { success: false, aborted: true };
        console.warn('[FileManager] showSaveFilePicker 失败，降级为下载:', e);
      }
    }
    // 降级：浏览器直接下载
    downloadFile(content, suggestedName);
    return { success: true, handle: null, fallback: true };
  }

  /**
   * 纯前端 Blob 方式下载文件
   */
  function downloadFile(content, filename = 'download.html') {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  const FileManager = {
    saveToFileHandle,
    saveFileAs,
    downloadFile
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileManager;
  }
  global.ProtoFileManager = FileManager;
})(typeof window !== 'undefined' ? window : globalThis);
