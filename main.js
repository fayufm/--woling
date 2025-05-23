const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { initialize, enable } = require('@electron/remote/main');

// 添加日志记录
function log(...args) {
  console.log('[主进程]', ...args);
}

log('应用启动');

// 初始化@electron/remote
initialize();

// 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('已有一个实例在运行，退出');
  app.quit();
  return;
}

let mainWindow;

function createWindow() {
  log('创建主窗口');
  
  // 获取应用路径
  const appPath = app.getAppPath();
  log('应用路径:', appPath);
  
  // 确保脚本文件存在
  ensureScriptFiles();
  
  // 设置图标路径
  let iconPath = path.join(__dirname, '22-ico.ico');
  if (!fs.existsSync(iconPath)) {
    log('根目录图标不存在，尝试从资源目录加载:', iconPath);
    // 尝试从资源目录加载
    iconPath = path.join(process.resourcesPath, '22-ico.ico');
    if (!fs.existsSync(iconPath)) {
      log('资源目录图标不存在，尝试使用备选图标');
      // 尝试使用备选图标
      iconPath = path.join(__dirname, 'app.ico');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(process.resourcesPath, 'app.ico');
        if (!fs.existsSync(iconPath)) {
          log('警告: 所有图标文件都不存在');
          iconPath = null;
        }
      }
    }
  }
  log('使用图标文件:', iconPath);

  // 记录图标路径到文件，以便进行调试
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'icon-debug.txt'), 
                    `图标路径: ${iconPath}\n文件存在: ${iconPath && fs.existsSync(iconPath)}\n时间: ${new Date().toISOString()}`);
  } catch (e) {
    log('写入调试文件失败:', e);
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath,
    autoHideMenuBar: true,
    frame: true,
    title: "我灵",
  });

  // 移除菜单栏
  mainWindow.setMenu(null);

  // 设置任务栏图标
  if (process.platform === 'win32') {
    app.setAppUserModelId(process.execPath); // 使用可执行文件路径作为AppUserModelID
    
    // 强制更新图标，多次设置以确保应用
    if (iconPath) {
      try {
        // 使用NativeImage创建图标
        const { nativeImage } = require('electron');
        const icon = nativeImage.createFromPath(iconPath);
        
        if (!icon.isEmpty()) {
          log('成功加载图标为NativeImage');
          mainWindow.setIcon(icon);
        } else {
          log('NativeImage为空，直接设置图标路径');
          mainWindow.setIcon(iconPath);
        }
        
        // 通过reload刷新窗口使图标生效
        mainWindow.webContents.once('did-finish-load', () => {
          setTimeout(() => {
            try {
              // 再次应用图标
              if (!icon.isEmpty()) {
                mainWindow.setIcon(icon);
              } else {
                mainWindow.setIcon(iconPath);
              }
              
              // 尝试设置任务栏图标
              mainWindow.setOverlayIcon(icon, '我灵');
              
              app.setAsDefaultProtocolClient('woling'); // 设置应用为协议处理程序，有助于刷新图标关联
              
              // 使用每次运行时的唯一临时图标以避免Windows缓存图标
              const tempIconPath = path.join(app.getPath('temp'), `woling-icon-${Date.now()}.ico`);
              try {
                fs.copyFileSync(iconPath, tempIconPath);
                mainWindow.setIcon(nativeImage.createFromPath(tempIconPath) || tempIconPath);
                log('使用临时图标:', tempIconPath);
              } catch (err) {
                log('无法创建临时图标:', err);
              }
            } catch (innerErr) {
              log('设置图标时出错:', innerErr);
            }
          }, 500);
        });
      } catch (e) {
        log('设置图标出错:', e);
      }
    }
  }

  // 启用@electron/remote
  enable(mainWindow.webContents);

  // 加载应用的主页面
  const indexPath = path.join(__dirname, 'index.html');
  log('加载页面:', indexPath);
  log('页面文件是否存在:', fs.existsSync(indexPath) ? '是' : '否');
  
  mainWindow.loadFile('index.html');

  // 监听加载完成事件
  mainWindow.webContents.on('did-finish-load', () => {
    log('页面加载完成');
  });

  // 监听加载失败事件
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log('页面加载失败:', errorCode, errorDescription);
  });

  // 在开发环境中打开开发者工具
  // mainWindow.webContents.openDevTools();

  // 确保应用目录存在
  ensureAppDirectories();
  
  // 错误处理
  process.on('uncaughtException', (error) => {
    log('未捕获的异常:', error);
    dialog.showErrorBox('应用错误', `发生未处理的错误: ${error.message}`);
  });
}

// 确保脚本文件存在
function ensureScriptFiles() {
  // 检查scripts目录
  const scriptsPath = path.join(__dirname, 'scripts');
  log('脚本目录:', scriptsPath);
  
  if (!fs.existsSync(scriptsPath)) {
    log('脚本目录不存在，正在创建');
    fs.mkdirSync(scriptsPath, { recursive: true });
  }
  
  // 检查scripts/app.js文件
  const appJsPath = path.join(scriptsPath, 'app.js');
  log('app.js路径:', appJsPath);
  
  if (!fs.existsSync(appJsPath)) {
    log('scripts/app.js不存在，检查根目录是否有备份');
    
    const rootAppJsPath = path.join(__dirname, 'app.js');
    
    if (fs.existsSync(rootAppJsPath)) {
      log('根目录发现app.js，正在复制到scripts目录');
      fs.copyFileSync(rootAppJsPath, appJsPath);
    } else {
      log('未找到app.js，创建基本版本');
      
      // 创建一个基本的app.js文件
      const basicAppJs = `
// 基本应用脚本
console.log('基本版app.js被加载');

// 页面管理
const pageManager = {
  currentPage: null,
  
  // 初始化
  init() {
    // 加载默认页面
    this.loadPage('generate');
    
    // 设置页面切换事件监听
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = e.currentTarget.getAttribute('data-page');
        this.loadPage(pageName);
      });
    });

    // 初始化菜单按钮功能
    this.initMenuToggle();
  },
  
  // 加载页面
  loadPage(pageName) {
    console.log('加载页面:', pageName);
    
    // 更新导航状态
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === pageName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    
    // 清空页面内容
    const pageContent = document.getElementById('page-content');
    if (!pageContent) {
      console.error('找不到页面内容容器(#page-content)');
      return;
    }
    
    pageContent.innerHTML = '';
    
    // 添加基本内容
    if (pageName === 'generate') {
      pageContent.innerHTML = \`
        <div class="page-header">
          <h1><i class="bi bi-file-earmark-plus"></i> 生成题目</h1>
        </div>
        <div class="alert alert-warning">
          <p>应用程序正在以有限功能模式运行。</p>
          <p>请重新安装应用以恢复完整功能。</p>
        </div>
        <div class="step">
          <h3><i class="bi bi-1-circle"></i> 选择专业领域</h3>
          <div class="form-group">
            <label for="field-input">请输入您的专业领域：</label>
            <input type="text" id="field-input" class="form-control" placeholder="例如：计算机科学、医学、法律、经济学等">
          </div>
          <button class="btn btn-primary">下一步 <i class="bi bi-arrow-right"></i></button>
        </div>
      \`;
    } else if (pageName === 'history') {
      pageContent.innerHTML = \`
        <div class="page-header">
          <h1><i class="bi bi-clock-history"></i> 历史记录</h1>
        </div>
        <div class="alert alert-warning">
          <p>应用程序正在以有限功能模式运行。</p>
          <p>请重新安装应用以恢复完整功能。</p>
        </div>
      \`;
    }

    // 关闭菜单
    const menuContent = document.getElementById('menu-content');
    if (menuContent) {
      menuContent.classList.remove('show');
    }
  },

  // 初始化菜单按钮功能
  initMenuToggle() {
    const menuToggle = document.getElementById('menu-toggle');
    const menuContent = document.getElementById('menu-content');
    
    if (!menuToggle || !menuContent) {
      console.error('找不到菜单按钮或菜单内容');
      return;
    }

    menuToggle.addEventListener('click', function() {
      menuContent.classList.toggle('show');
    });

    // 点击菜单外部区域关闭菜单
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.menu-button-container')) {
        menuContent.classList.remove('show');
      }
    });
  }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM已加载，初始化应用...');
  try {
    pageManager.init();
  } catch (error) {
    console.error('初始化应用失败:', error);
  }
});
      `;
      
      fs.writeFileSync(appJsPath, basicAppJs);
    }
  }
}

// 确保应用所需的目录存在
function ensureAppDirectories() {
  log('检查并创建应用目录');
  
  // 获取用户数据目录
  const userDataPath = app.getPath('userData');
  log('用户数据目录:', userDataPath);
  
  // 确保目录存在
  if (!fs.existsSync(userDataPath)) {
    log('创建用户数据目录');
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  return userDataPath;
}

// 定义全局变量
let userDataPath;

// 当Electron完成初始化时创建窗口
app.whenReady().then(async () => {
  log('应用准备就绪');
  
  // 移除应用级别的菜单栏
  Menu.setApplicationMenu(null);

  // 添加图标详细检查和记录
  const debugInfo = [];
  debugInfo.push(`应用启动时间: ${new Date().toISOString()}`);
  debugInfo.push(`应用路径: ${app.getAppPath()}`);
  debugInfo.push(`资源路径: ${process.resourcesPath}`);
  debugInfo.push(`用户数据路径: ${app.getPath('userData')}`);
  debugInfo.push(`临时路径: ${app.getPath('temp')}`);
  
  // 设置应用图标
  try {
    // 检查所有可能的图标位置
    const iconLocations = [
      { path: path.join(__dirname, '22-ico.ico'), name: '根目录22-ico.ico' },
      { path: path.join(process.resourcesPath, '22-ico.ico'), name: '资源目录22-ico.ico' },
      { path: path.join(__dirname, 'app.ico'), name: '根目录app.ico' },
      { path: path.join(process.resourcesPath, 'app.ico'), name: '资源目录app.ico' }
    ];
    
    debugInfo.push('\n图标文件检查:');
    iconLocations.forEach(loc => {
      const exists = fs.existsSync(loc.path);
      debugInfo.push(`${loc.name}: ${exists ? '存在' : '不存在'} (${loc.path})`);
      if (exists) {
        try {
          const stats = fs.statSync(loc.path);
          debugInfo.push(`  大小: ${stats.size} 字节, 修改时间: ${stats.mtime}`);
        } catch (e) {
          debugInfo.push(`  无法获取文件信息: ${e.message}`);
        }
      }
    });
    
    let iconPath = path.join(__dirname, '22-ico.ico');
    if (!fs.existsSync(iconPath)) {
      log('根目录图标不存在，尝试从资源目录加载:', iconPath);
      debugInfo.push('根目录图标不存在，尝试从资源目录加载');
      // 尝试从资源目录加载
      iconPath = path.join(process.resourcesPath, '22-ico.ico');
      if (!fs.existsSync(iconPath)) {
        log('资源目录图标不存在，尝试使用备选图标');
        // 尝试使用备选图标
        iconPath = path.join(__dirname, 'app.ico');
        if (!fs.existsSync(iconPath)) {
          iconPath = path.join(process.resourcesPath, 'app.ico');
          if (!fs.existsSync(iconPath)) {
            log('警告: 所有图标文件都不存在');
            iconPath = null;
          }
        }
      }
    }
    
    // 确保某个图标能用
    if (!iconPath || !fs.existsSync(iconPath)) {
      // 尝试创建一个临时图标文件
      debugInfo.push('所有常规位置的图标文件都不存在，尝试创建临时图标');
      
      // 检查dist目录是否有图标
      const distIconPath = path.join(path.dirname(app.getAppPath()), '22-ico.ico');
      if (fs.existsSync(distIconPath)) {
        debugInfo.push(`dist目录图标存在: ${distIconPath}`);
        iconPath = distIconPath;
      }
    }
    
    // 写入调试信息
    try {
      const logPath = path.join(app.getPath('userData'), 'icon-debug.log');
      fs.writeFileSync(logPath, debugInfo.join('\n'));
      log('写入图标调试信息到:', logPath);
    } catch (e) {
      log('写入调试信息失败:', e);
    }
    
    if (iconPath && fs.existsSync(iconPath)) {
      log('设置应用图标:', iconPath);
      
      // 清理图标缓存
      if (process.platform === 'win32') {
        try {
          // 将应用图标复制到临时目录以避免缓存问题
          const tempIconPath = path.join(app.getPath('temp'), '22-ico-' + Date.now() + '.ico');
          fs.copyFileSync(iconPath, tempIconPath);
          log('复制图标到临时路径:', tempIconPath);
          
          // 设置应用ID和协议
          app.setAppUserModelId(process.execPath);
          app.setAsDefaultProtocolClient('woling');
          
          if (process.platform === 'darwin') {
            app.dock.setIcon(iconPath);
          }
        } catch (e) {
          log('设置应用程序图标出错:', e);
        }
      }
    }
  } catch (error) {
    log('设置应用图标失败:', error);
  }
  
  // 初始化用户数据路径
  userDataPath = ensureAppDirectories();
  
  createWindow();
  registerIPCHandlers();

  app.on('activate', function () {
    // 在macOS上，当dock图标被点击且没有其他窗口打开时，
    // 通常在应用程序中重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 处理保存历史记录
ipcMain.handle('save-history', async (event, data) => {
  try {
    log('保存历史记录');
    const userDataPath = app.getPath('userData');
    const historyPath = path.join(userDataPath, 'history');
    const fileName = `history_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(historyPath, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    log('历史记录已保存至:', filePath);
    return { success: true, filePath };
  } catch (error) {
    log('保存历史记录失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理读取历史记录
ipcMain.handle('load-history', async () => {
  try {
    log('加载历史记录');
    const userDataPath = app.getPath('userData');
    const historyPath = path.join(userDataPath, 'history');
    
    if (!fs.existsSync(historyPath)) {
      log('历史记录目录不存在，创建目录');
      fs.mkdirSync(historyPath, { recursive: true });
      return { success: true, history: [] };
    }
    
    const files = fs.readdirSync(historyPath).filter(file => file.endsWith('.json'));
    log('找到历史记录文件数量:', files.length);
    
    if (files.length === 0) {
      log('没有历史记录文件');
      return { success: true, history: [] };
    }
    
    const history = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(historyPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (!content || content.trim() === '') {
          log(`警告: 文件 ${file} 内容为空`);
          continue;
        }
        
        const parsedData = JSON.parse(content);
        
        // 处理数组格式的历史记录文件（可能是导出的历史记录）
        if (Array.isArray(parsedData)) {
          log(`文件 ${file} 包含历史记录数组，尝试提取有效记录`);
          
          for (const item of parsedData) {
            if (item && item.id) {
              history.push({
                ...item,
                fileName: file
              });
            }
          }
          continue;
        }
        
        // 处理单个历史记录对象
        const data = parsedData;
        
        if (!data || !data.id) {
          log(`警告: 文件 ${file} 数据无效或缺少ID`);
          continue;
        }
        
        history.push({
          ...data,
          fileName: file
        });
      } catch (fileError) {
        log(`处理文件 ${file} 时出错:`, fileError);
        // 继续处理其他文件
        continue;
      }
    }
    
    log(`成功加载 ${history.length} 条历史记录`);
    return { success: true, history: history.sort((a, b) => {
      // 首先尝试使用timestamp排序
      if (a.timestamp && b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      // 如果没有timestamp，尝试使用日期字段排序
      if (a.date && b.date) {
        return new Date(b.date) - new Date(a.date);
      }
      // 如果没有日期字段，尝试使用文件名中的日期排序
      try {
        const timeA = new Date(a.fileName.replace('history_', '').replace('.json', '').replace(/[-]/g, ':')).getTime();
        const timeB = new Date(b.fileName.replace('history_', '').replace('.json', '').replace(/[-]/g, ':')).getTime();
        return timeB - timeA;
      } catch (e) {
        // 如果解析日期失败，返回0（保持原顺序）
        return 0;
      }
    }) };
  } catch (error) {
    log('读取历史记录失败:', error);
    return { success: false, error: error.message, history: [] };
  }
});

// 处理导出历史记录
ipcMain.handle('export-history', async (event, data) => {
  try {
    log('导出历史记录');
    const { filePath } = await dialog.showSaveDialog({
      title: '导出历史记录',
      defaultPath: `我灵_题目_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [
        { name: 'JSON文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      log('历史记录已导出至:', filePath);
      return { success: true, filePath };
    }
    
    log('用户取消了导出');
    return { success: false, error: '用户取消了导出' };
  } catch (error) {
    log('导出历史记录失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理删除历史记录
ipcMain.handle('deleteHistory', async (event, itemIds) => {
  try {
    log('删除历史记录，项目ID:', itemIds);
    const userDataPath = app.getPath('userData');
    const historyPath = path.join(userDataPath, 'history');
    
    if (!fs.existsSync(historyPath)) {
      log('历史记录目录不存在');
      return { success: false, error: '历史记录目录不存在' };
    }
    
    // 读取所有历史记录文件
    const files = fs.readdirSync(historyPath).filter(file => file.endsWith('.json'));
    log('找到历史记录文件数量:', files.length);
    
    // 加载所有历史记录，找出要删除的文件或记录
    const filesToDelete = [];
    const filesToUpdate = [];
    
    for (const file of files) {
      const filePath = path.join(historyPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (!content || content.trim() === '') {
          log(`警告: 文件 ${file} 内容为空`);
          continue;
        }
        
        const parsedData = JSON.parse(content);
        
        // 处理数组格式的历史记录文件
        if (Array.isArray(parsedData)) {
          log(`文件 ${file} 包含历史记录数组，检查是否有需要删除的记录`);
          
          // 检查数组中是否有匹配的记录
          const hasMatchingRecord = parsedData.some(item => item && item.id && itemIds.includes(item.id));
          
          if (hasMatchingRecord) {
            log(`文件 ${file} 中有匹配的记录需要删除`);
            
            // 过滤掉要删除的记录
            const updatedRecords = parsedData.filter(item => !(item && item.id && itemIds.includes(item.id)));
            
            if (updatedRecords.length === 0) {
              // 如果删除后没有记录，删除整个文件
              filesToDelete.push(filePath);
              log(`文件 ${file} 删除后将没有记录，将删除整个文件`);
            } else {
              // 如果还有其他记录，更新文件
              filesToUpdate.push({
                path: filePath,
                data: updatedRecords
              });
              log(`文件 ${file} 将更新为 ${updatedRecords.length} 条记录`);
            }
          }
          
          continue;
        }
        
        // 处理单个历史记录对象
        const data = parsedData;
        
        // 检查文件是否有有效的ID
        if (!data.id) {
          log(`警告: 文件 ${file} 没有有效的ID`);
          continue;
        }
        
        log(`检查文件 ${file}, 文件ID: ${data.id}, 要删除的ID: ${itemIds.join(',')}`);
        
        // 检查这个文件是否包含要删除的ID
        if (itemIds.includes(data.id)) {
          filesToDelete.push(filePath);
          log(`找到匹配的文件: ${file}, ID: ${data.id}`);
        }
      } catch (parseError) {
        log(`解析文件 ${file} 失败:`, parseError);
      }
    }
    
    // 更新需要更新的文件
    for (const fileToUpdate of filesToUpdate) {
      try {
        fs.writeFileSync(fileToUpdate.path, JSON.stringify(fileToUpdate.data, null, 2));
        log(`已更新文件: ${fileToUpdate.path}`);
      } catch (updateError) {
        log(`更新文件 ${fileToUpdate.path} 失败:`, updateError);
      }
    }
    
    // 删除需要删除的文件
    log('需要删除的文件数量:', filesToDelete.length);
    for (const filePath of filesToDelete) {
      fs.unlinkSync(filePath);
      log('已删除文件:', filePath);
    }
    
    return { 
      success: true, 
      deletedCount: filesToDelete.length + filesToUpdate.length,
      message: `成功删除${filesToDelete.length + filesToUpdate.length}条历史记录` 
    };
  } catch (error) {
    log('删除历史记录失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理专业领域AI检测
ipcMain.handle('check-field-with-ai', async (event, data) => {
  try {
    log('AI检测专业领域:', data.field);
    
    if (!data.field || !data.apiKey) {
      log('缺少必要参数');
      return { success: false, error: '缺少必要参数' };
    }
    
    // 这里实现与AI API的通信
    // 使用axios调用AI API
    const axios = require('axios');
    
    try {
      const response = await axios.post('https://api.tongyi.aliyun.com/v1/chat/completions', {
        model: 'qwen-max',
        messages: [
          {
            role: 'system',
            content: '你是一个帮助检测输入内容是否为合适的专业领域的助手。请检查输入的专业领域是否合适，只判断它是否是一个正规的学科或领域。输出为JSON格式，包括suitable(布尔值)和message(字符串)。'
          },
          {
            role: 'user',
            content: `专业领域:"${data.field}"。请判断这是否是一个适合作为题目生成的正规专业领域？`
          }
        ],
        parameters: {
          result_format: 'json'
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.apiKey}`
        }
      });
      
      const aiResponse = response.data;
      log('AI响应:', JSON.stringify(aiResponse));
      
      // 解析AI回复
      if (aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message) {
        const contentText = aiResponse.choices[0].message.content;
        
        try {
          // 尝试解析JSON响应
          const result = JSON.parse(contentText);
          return { 
            success: true, 
            suitable: result.suitable,
            message: result.message
          };
        } catch (parseError) {
          // 如果无法解析JSON，尝试从文本中提取结果
          const isSuitable = contentText.toLowerCase().includes('suitable: true') || 
                            contentText.toLowerCase().includes('"suitable": true') ||
                            contentText.toLowerCase().includes('适合') ||
                            !contentText.toLowerCase().includes('不适合');
          
          return {
            success: true,
            suitable: isSuitable,
            message: isSuitable ? '专业领域有效' : '无法识别的专业领域，请输入正规学科'
          };
        }
      }
      
      // 默认响应
      return { success: true, suitable: true, message: '专业领域通过AI验证' };
      
    } catch (apiError) {
      log('调用AI API失败:', apiError);
      // API调用失败时，使用本地验证
      return localFieldCheck(data.field);
    }
    
  } catch (error) {
    log('检测专业领域失败:', error);
    return { success: false, error: error.message };
  }
});

// 本地专业领域检查逻辑
function localFieldCheck(field) {
  log('使用本地逻辑检查专业领域:', field);
  
  // 简单的专业领域验证逻辑
  const validFields = [
    '计算机', '软件', '编程', '医学', '医疗', '护理', '生物', '物理', 
    '化学', '数学', '历史', '地理', '文学', '经济学', '金融', '会计', 
    '法律', '心理学', '社会学', '工程', '建筑', '设计', '教育', '语言', 
    '哲学', '艺术', '音乐', '体育', '农业', '环境', '能源'
  ];
  
  for (const validField of validFields) {
    if (field.includes(validField)) {
      return { success: true, suitable: true, message: '专业领域有效' };
    }
  }
  
  return { 
    success: true, 
    suitable: false, 
    message: '无法识别的专业领域，请输入如：计算机科学、医学、物理学等正规学科'
  };
}

// 处理保存设置
ipcMain.handle('save-settings', async (event, data) => {
  try {
    log('保存设置');
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
    log('设置已保存至:', settingsPath);
    return { success: true };
  } catch (error) {
    log('保存设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理加载设置
ipcMain.handle('load-settings', async () => {
  try {
    log('加载设置');
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    
    if (!fs.existsSync(settingsPath)) {
      log('设置文件不存在，使用默认设置');
      return { success: true, settings: null };
    }
    
    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    
    log('设置已加载');
    return { success: true, settings };
  } catch (error) {
    log('加载设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理外部链接打开
ipcMain.handle('openExternal', async (event, url) => {
  try {
    log('打开外部链接:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    log('打开外部链接失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理保存笔记
ipcMain.handle('saveNotes', async (event, notes) => {
  try {
    log('保存笔记');
    const userDataPath = app.getPath('userData');
    const notesPath = path.join(userDataPath, 'notes.json');
    
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
    log('笔记已保存至:', notesPath);
    return { success: true };
  } catch (error) {
    log('保存笔记失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理加载笔记
ipcMain.handle('loadNotes', async () => {
  try {
    log('加载笔记');
    const userDataPath = app.getPath('userData');
    const notesPath = path.join(userDataPath, 'notes.json');
    
    if (!fs.existsSync(notesPath)) {
      log('笔记文件不存在，返回空数组');
      return { success: true, notes: [] };
    }
    
    const content = fs.readFileSync(notesPath, 'utf8');
    const notes = JSON.parse(content);
    
    log('笔记已加载');
    return { success: true, notes };
  } catch (error) {
    log('加载笔记失败:', error);
    return { success: false, error: error.message };
  }
});

// 注册IPC处理函数
function registerIPCHandlers() {
  log('注册IPC处理函数');
  
  // 保存历史题目记录
  ipcMain.handle('save-used-questions', async (event, questions) => {
    try {
      log('保存历史题目记录，数量:', questions.length);
      const filePath = path.join(userDataPath, 'used_questions.json');
      
      // 确保questions是数组且内容为字符串
      const validQuestions = Array.isArray(questions) ? 
        questions.filter(q => q && typeof q === 'string') : [];
      
      await fs.promises.writeFile(filePath, JSON.stringify(validQuestions, null, 2));
      log('历史题目记录已保存至:', filePath);
      return { success: true };
    } catch (error) {
      log('保存历史题目记录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 加载历史题目记录
  ipcMain.handle('load-used-questions', async (event) => {
    try {
      log('加载历史题目记录');
      const filePath = path.join(userDataPath, 'used_questions.json');
      
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        log('历史题目记录文件不存在');
        return { success: true, questions: [] };
      }
      
      try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        
        // 检查数据是否为空
        if (!data || data.trim() === '') {
          log('历史题目记录文件为空');
          return { success: true, questions: [] };
        }
        
        const questions = JSON.parse(data);
        
        // 确保返回的是数组
        const validQuestions = Array.isArray(questions) ? 
          questions.filter(q => q && typeof q === 'string') : [];
          
        log('已加载历史题目记录，数量:', validQuestions.length);
        return { success: true, questions: validQuestions };
      } catch (parseError) {
        log('解析历史题目记录失败:', parseError);
        // 如果解析失败，返回空数组并重置文件
        await fs.promises.writeFile(filePath, JSON.stringify([], null, 2));
        return { success: true, questions: [] };
      }
    } catch (error) {
      log('加载历史题目记录失败:', error);
      return { success: false, error: error.message, questions: [] };
    }
  });
  
  // 调用AI API生成题目
  ipcMain.handle('callAI', async (event, params) => {
    try {
      log('调用AI API生成题目');
      log('API端点:', params.endpoint);
      
      // 引入axios进行HTTP请求
      const axios = require('axios');
      
      // 发送请求到AI API
      const response = await axios.post(params.endpoint, params.data, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.apiKey}`
        },
        timeout: 60000 // 60秒超时
      });
      
      log('AI API调用成功');
      return { success: true, data: response.data };
    } catch (error) {
      log('调用AI API失败:', error.message);
      
      // 返回更详细的错误信息
      let errorMessage = '调用AI API失败';
      if (error.response) {
        // 服务器返回了错误状态码
        errorMessage = `服务器返回错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        // 请求已发送但没有收到响应
        errorMessage = '未收到API服务器响应，请检查网络连接或API端点是否正确';
      } else {
        // 设置请求时发生错误
        errorMessage = `请求错误: ${error.message}`;
      }
      
      return { success: false, error: errorMessage };
    }
  });
}

// 创建preload.js文件
function createPreloadScript() {
  log('创建preload.js文件');
  
  const preloadPath = path.join(__dirname, 'preload.js');
  const preloadContent = `
    const { contextBridge, ipcRenderer, shell } = require('electron');
    const path = require('path');
    const fs = require('fs');

    // 暴露API给渲染进程
    contextBridge.exposeInMainWorld('electronAPI', {
      // 打开外部链接
      openExternal: (url) => shell.openExternal(url),
      
      // 保存历史记录
      saveHistory: (history) => ipcRenderer.invoke('save-history', history),
      
      // 加载历史记录
      loadHistory: () => ipcRenderer.invoke('load-history'),
      
      // 导出历史记录
      exportHistory: (filePath, data) => ipcRenderer.invoke('export-history', filePath, data),
      
      // 导入历史记录
      importHistory: (filePath) => ipcRenderer.invoke('import-history', filePath),
      
      // 选择文件
      selectFile: (options) => ipcRenderer.invoke('select-file', options),
      
      // 保存历史题目记录
      saveUsedQuestions: (questions) => ipcRenderer.invoke('save-used-questions', questions),
      
      // 加载历史题目记录
      loadUsedQuestions: () => ipcRenderer.invoke('load-used-questions')
    });
  `;
  
  // ... existing code ...
} 