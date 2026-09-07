/**
 * file-manager.js — Web 端与桌面端文件物理持久化管理器
 * 功能：利用 File System Access API 实现支持自由选择保存位置的物理保存（Save As / In-place Save）
 */
(function (global) {
  'use strict';

  /**
   * 将 HTML 内容直接物理写入 FileSystemFileHandle
   */
  async function saveToFileHandle(fileHandle, content) {
    if (!fileHandle) return false;
    try {
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
      console.log(`[FileManager] ✅ 文件已成功物理写回: ${fileHandle.name}`);
      return true;
    } catch (e) {
      console.error('[FileManager] 物理写回文件失败:', e);
      return false;
    }
  }

  /**
   * 弹出系统保存位置选择框（另存为 / 选定保存位置）
   */
  async function saveFileAsWithPicker(content, suggestedName = 'prototype.html', fileDescription = 'HTML 页面文件') {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{
            description: fileDescription,
            accept: { 'text/html': ['.html', '.htm'] }
          }]
        });
        const success = await saveToFileHandle(handle, content);
        return { success, handle, aborted: false, chosenName: handle.name };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { success: false, aborted: true };
        }
        console.warn('[FileManager] showSaveFilePicker 失败，降级为下载:', e);
      }
    }
    // 降级：通过浏览器直接下载
    downloadFile(content, suggestedName);
    return { success: true, handle: null, fallback: true, chosenName: suggestedName };
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
    saveFileAsWithPicker,
    downloadFile
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileManager;
  }
  global.ProtoFileManager = FileManager;
})(typeof window !== 'undefined' ? window : globalThis);
