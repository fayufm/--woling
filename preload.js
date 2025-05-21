// 预加载脚本，用于暴露Electron API给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

// 输出调试信息
console.log('预加载脚本开始执行');

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 保存历史记录
  saveHistory: (data) => {
    console.log('调用saveHistory API', data ? data.id : 'no data');
    return ipcRenderer.invoke('save-history', data);
  },
  
  // 加载历史记录
  loadHistory: () => {
    console.log('调用loadHistory API');
    return ipcRenderer.invoke('load-history');
  },
  
  // 导出历史记录
  exportHistory: (data) => {
    console.log('调用exportHistory API', data ? data.length : 'no data');
    return ipcRenderer.invoke('export-history', data);
  },
  
  // 删除历史记录
  deleteHistory: (itemIds) => {
    console.log('调用deleteHistory API', itemIds ? itemIds.length : 'no ids');
    return ipcRenderer.invoke('deleteHistory', itemIds);
  },
  
  // 使用AI检测专业领域
  checkFieldWithAI: (data) => {
    console.log('调用checkFieldWithAI API', data ? data.field : 'no data');
    return ipcRenderer.invoke('check-field-with-ai', data);
  },
  
  // 保存设置
  saveSettings: (data) => {
    console.log('调用saveSettings API');
    return ipcRenderer.invoke('save-settings', data);
  },
  
  // 加载设置
  loadSettings: () => {
    console.log('调用loadSettings API');
    return ipcRenderer.invoke('load-settings');
  },
  
  // 在默认浏览器中打开链接
  openExternal: (url) => {
    console.log('调用openExternal API', url);
    return ipcRenderer.invoke('openExternal', url);
  },
  
  // 保存笔记
  saveNotes: (notes) => {
    console.log('调用saveNotes API', notes ? notes.length : 'no notes');
    return ipcRenderer.invoke('saveNotes', notes);
  },
  
  // 加载笔记
  loadNotes: () => {
    console.log('调用loadNotes API');
    return ipcRenderer.invoke('loadNotes');
  },
  
  // 保存文件
  saveToFile: async (data, filename) => {
    try {
      return await ipcRenderer.invoke('save-to-file', data, filename);
    } catch (error) {
      console.error('保存文件失败:', error);
      return { success: false, error: error.message };
    }
  },
  
  // 加载文件
  loadFromFile: async (filename) => {
    try {
      return await ipcRenderer.invoke('load-from-file', filename);
    } catch (error) {
      console.error('加载文件失败:', error);
      return { success: false, error: error.message };
    }
  },
  
  // 加载历史题目记录
  loadUsedQuestions: async () => {
    try {
      return await ipcRenderer.invoke('load-used-questions');
    } catch (error) {
      console.error('加载历史题目记录失败:', error);
      return { success: false, error: error.message };
    }
  },
  
  // 保存历史题目记录
  saveUsedQuestions: async (questions) => {
    try {
      return await ipcRenderer.invoke('save-used-questions', questions);
    } catch (error) {
      console.error('保存历史题目记录失败:', error);
      return { success: false, error: error.message };
    }
  },
  
  // 调用AI API生成题目
  callAI: async (params) => {
    try {
      return await ipcRenderer.invoke('callAI', params);
    } catch (error) {
      console.error('调用AI API失败:', error);
      return { success: false, error: error.message };
    }
  }
});

// 向渲染进程暴露更多信息
contextBridge.exposeInMainWorld('appInfo', {
  isElectron: true,
  version: '1.3.0',
  platform: process.platform,
  nodejsVersion: process.versions.node,
  chromeVersion: process.versions.chrome,
  electronVersion: process.versions.electron
});

// 确保页面加载完成后通知主进程
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM已加载，预加载脚本执行完成');
  
  // 延迟检查是否成功加载页面内容
  setTimeout(() => {
    const hasContent = document.body.innerHTML.trim().length > 0;
    console.log('页面内容检查:', hasContent ? '页面有内容' : '页面内容为空');
    
    const hasPageContent = document.getElementById('page-content');
    console.log('page-content元素:', hasPageContent ? '存在' : '不存在');
    
    const hasTemplates = document.getElementById('generate-template') && document.getElementById('history-template');
    console.log('模板元素:', hasTemplates ? '存在' : '不存在');
    
    if (hasPageContent && !hasPageContent.innerHTML) {
      console.log('page-content元素内容为空');
    }
  }, 1000);
}); 