// 根目录的app.js文件，在scripts/app.js加载失败时作为备用

// 重定向到scripts/app.js
console.log('根目录app.js被加载，尝试重定向到scripts/app.js');

// 创建脚本元素
function loadScript(src, onload, onerror) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = onload;
  script.onerror = onerror;
  document.body.appendChild(script);
  return script;
}

// 尝试加载正确的脚本
loadScript('./scripts/app.js', 
  function() {
    console.log('从根目录成功重定向到scripts/app.js');
  },
  function(error) {
    console.error('无法加载scripts/app.js:', error);
    
    // 显示错误信息
    const appDiv = document.getElementById('app');
    const pageContent = document.getElementById('page-content');
    const content = pageContent || appDiv || document.body;
    
    if (content) {
      content.innerHTML = `
        <div class="alert alert-danger" style="margin: 20px; padding: 20px;">
          <h4>应用加载失败</h4>
          <p>无法加载应用脚本 (./scripts/app.js)</p>
          <p>请尝试以下解决方案:</p>
          <ol>
            <li>确保scripts目录存在</li>
            <li>确保app.js文件位于scripts目录中</li>
            <li>重启应用</li>
            <li>如果问题仍然存在，请重新安装应用</li>
          </ol>
          <button class="btn btn-primary" onclick="window.location.reload()">刷新页面</button>
        </div>
      `;
    }
  }
);

// 脚本内容备份，在无法加载scripts/app.js时使用
// 简化版，只显示基本界面
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    const pageContent = document.getElementById('page-content');
    
    // 如果5秒后页面仍未加载，说明正常脚本可能加载失败
    if (pageContent && !pageContent.innerHTML) {
      console.log('检测到页面未能正常加载，使用备用脚本');
      
      // 显示基本内容
      pageContent.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
            <h1>我灵 - AI题目生成与答案分析</h1>
          </div>
          
          <div class="alert alert-warning">
            <p>应用程序正在以有限功能模式运行。</p>
            <p>脚本加载出现问题，请尝试重启应用。</p>
          </div>
          
          <div style="background: white; border-radius: 8px; padding: 20px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h3>请输入您的专业领域</h3>
            <div style="margin-bottom: 20px;">
              <label for="field-input" style="display: block; margin-bottom: 8px;">专业领域：</label>
              <input type="text" id="field-input" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" placeholder="例如：计算机科学、医学、法律、经济学等">
            </div>
            
            <button class="btn btn-primary" style="padding: 8px 16px; background: #4a90e2; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="alert('应用程序运行在有限功能模式，请重启应用')">
              下一步
            </button>
          </div>
        </div>
      `;
      
      // 初始化菜单按钮
      const menuToggle = document.getElementById('menu-toggle');
      const menuContent = document.getElementById('menu-content');
      
      if (menuToggle && menuContent) {
        menuToggle.addEventListener('click', function() {
          menuContent.classList.toggle('show');
        });
        
        document.addEventListener('click', function(event) {
          if (!event.target.closest('.menu-button-container')) {
            menuContent.classList.remove('show');
          }
        });
      }
    }
  }, 5000); // 5秒超时
}); 