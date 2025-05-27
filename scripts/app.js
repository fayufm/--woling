// 全局变量
const TONGYI_API_KEY = 'sk-07ef4701031d41668beebb521e80eaf0';
const DEEPSEEK_API_KEY = 'sk-0b2be14756fe4195a7bc2bcb78d19f8f';
const DEFAULT_API_KEY = TONGYI_API_KEY; // 默认使用通义千问API
const MAX_DAILY_GENERATIONS = 20; // 默认API下每日最大生成次数
const MAX_QUESTIONS_PER_GENERATION = 15; // 一次最多生成题目数量

// 当前状态
let currentField = '';
let currentQuestions = [];
let selectedQuestionTypes = [];
let currentHistory = [];
let selectedHistoryItems = [];
let dailyGenerationCount = 0; // 当天已生成次数
let lastGenerationDate = null; // 上次生成日期
let usedQuestionContents = new Set(); // 存储已使用过的题目内容，防止重复
let customQuestionBanks = []; // 存储自定义题库

// 检测是否在Electron环境中运行
const isElectron = () => {
  return window.electronAPI !== undefined;
};

// 页面管理
const pageManager = {
  currentPage: null,
  
  // 页面模板映射
  templates: {
    generate: document.getElementById('generate-template'),
    history: document.getElementById('history-template'),
    settings: document.getElementById('settings-template'),
    notebook: document.getElementById('notebook-template')
  },
  
  // 初始化
  init() {
    // 获取所有模板，确保能找到模板
    this.templates = {
      generate: document.getElementById('generate-template'),
      history: document.getElementById('history-template'),
      settings: document.getElementById('settings-template'),
      notebook: document.getElementById('notebook-template')
    };

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
    if (this.currentPage === pageName) return;
    
    console.log(`加载页面: ${pageName}`);
    
    // 记录之前的页面
    const previousPage = this.currentPage;
    
    // 保存当前页面的状态，特别是笔记本页面
    if (this.currentPage === 'notebook') {
      // 如果当前在笔记本页面，执行清理工作
      try {
        notebookPage.cleanup();
      } catch (e) {
        console.error('笔记本页面清理失败:', e);
      }
      
      // 在切换前重置可能影响其他页面的全局状态
      this.resetGlobalState();
    }
    
    // 更新当前页面
    this.currentPage = pageName;
    
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
    
    // 添加新页面内容
    const template = this.templates[pageName];
    if (template) {
      const content = template.content.cloneNode(true);
      pageContent.appendChild(content);
      
      // 初始化页面特定功能
      if (pageName === 'generate') {
        // 先等待DOM更新完成
        setTimeout(() => {
          generatePage.init();
          
          // 从任何页面切换到生成题目页面时，使用多次递增延迟确保输入框可用
          console.log('切换到生成题目页面，确保输入框可用');
          
          // 创建一个函数来处理递归尝试
          const tryEnableInput = (attempt = 1, maxAttempts = 10) => {
            if (attempt > maxAttempts) return;
            
            console.log(`第${attempt}次尝试激活输入框`);
            const input = generatePage.ensureFieldInputInteractive();
            
            // 如果成功获得输入框引用，添加额外的点击处理
            if (input) {
              input.click();
              input.focus();
            }
            
            // 延迟递增，确保即使后续事件可能影响输入框，仍能继续尝试激活
            setTimeout(() => tryEnableInput(attempt + 1, maxAttempts), 300 * attempt);
          };
          
          // 启动尝试序列
          tryEnableInput();
        }, 100);
      } else if (pageName === 'history') {
        historyPage.init();
      } else if (pageName === 'settings') {
        settingsPage.init();
      } else if (pageName === 'notebook') {
        notebookPage.init();
      }
    } else {
      console.error(`找不到模板: ${pageName}-template`);
      pageContent.innerHTML = '<div class="alert alert-danger">无法加载页面内容</div>';
    }

    // 关闭菜单
    const menuContent = document.getElementById('menu-content');
    if (menuContent) {
      menuContent.classList.remove('show');
    }
  },
  
  // 重置可能影响其他页面的全局状态
  resetGlobalState() {
    // 重置document.execCommand状态
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('insertBrOnReturn', false, false);
    } catch (e) {
      console.error('重置编辑器命令失败:', e);
    }
    
    // 移除所有contentEditable属性
    document.querySelectorAll('[contenteditable]').forEach(element => {
      element.removeAttribute('contenteditable');
    });
    
    // 清除可能的选择
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
    
    // 移除可能存在的自定义对话框
    const dialogs = document.querySelectorAll('.custom-dialog-overlay');
    dialogs.forEach(dialog => {
      document.body.removeChild(dialog);
    });
    
    // 确保焦点不在任何元素上
    document.activeElement.blur();
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
  },
  
  // 显示自定义确认对话框
  showCustomConfirm(title, message, onConfirm, onCancel, confirmButtonText = '确认', cancelButtonText = '取消', confirmButtonClass = 'btn-primary') {
    // 创建对话框元素
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'custom-dialog-overlay';
    
    const dialogBox = document.createElement('div');
    dialogBox.className = 'custom-dialog-box';
    
    // 设置对话框内容
    dialogBox.innerHTML = `
      <div class="custom-dialog-header">
        <h5>${title}</h5>
      </div>
      <div class="custom-dialog-body">
        <p>${message}</p>
      </div>
      <div class="custom-dialog-footer">
        <button class="btn btn-secondary btn-sm cancel-button">${cancelButtonText}</button>
        <button class="btn ${confirmButtonClass} btn-sm confirm-button">${confirmButtonText}</button>
      </div>
    `;
    
    // 添加对话框到页面
    dialogOverlay.appendChild(dialogBox);
    document.body.appendChild(dialogOverlay);
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .custom-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .custom-dialog-box {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        width: 300px;
        max-width: 90%;
      }
      .custom-dialog-header {
        padding: 15px;
        border-bottom: 1px solid #e9ecef;
      }
      .custom-dialog-body {
        padding: 15px;
      }
      .custom-dialog-footer {
        padding: 15px;
        border-top: 1px solid #e9ecef;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `;
    document.head.appendChild(style);
    
    // 添加按钮事件
    const cancelButton = dialogBox.querySelector('.cancel-button');
    const confirmButton = dialogBox.querySelector('.confirm-button');
    
    // 取消按钮
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(dialogOverlay);
      if (typeof onCancel === 'function') {
        onCancel();
      }
    });
    
    // 确认按钮
    confirmButton.addEventListener('click', () => {
      document.body.removeChild(dialogOverlay);
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    });
    
    // 点击遮罩层关闭对话框
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        document.body.removeChild(dialogOverlay);
        if (typeof onCancel === 'function') {
          onCancel();
        }
      }
    });
  },
  
  // 显示自定义提示对话框
  showCustomAlert(title, message, onClose = null, buttonText = '确定', buttonClass = 'btn-primary') {
    // 创建对话框元素
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'custom-dialog-overlay';
    
    const dialogBox = document.createElement('div');
    dialogBox.className = 'custom-dialog-box';
    
    // 设置对话框内容
    dialogBox.innerHTML = `
      <div class="custom-dialog-header">
        <h5>${title}</h5>
      </div>
      <div class="custom-dialog-body">
        <p>${message}</p>
      </div>
      <div class="custom-dialog-footer">
        <button class="btn ${buttonClass} btn-sm close-button">${buttonText}</button>
      </div>
    `;
    
    // 添加对话框到页面
    dialogOverlay.appendChild(dialogBox);
    document.body.appendChild(dialogOverlay);
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .custom-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .custom-dialog-box {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        width: 300px;
        max-width: 90%;
      }
      .custom-dialog-header {
        padding: 15px;
        border-bottom: 1px solid #e9ecef;
      }
      .custom-dialog-body {
        padding: 15px;
      }
      .custom-dialog-footer {
        padding: 15px;
        border-top: 1px solid #e9ecef;
        display: flex;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);
    
    // 添加按钮事件
    const closeButton = dialogBox.querySelector('.close-button');
    
    // 关闭按钮
    closeButton.addEventListener('click', () => {
      document.body.removeChild(dialogOverlay);
      if (typeof onClose === 'function') {
        onClose();
      }
    });
    
    // 点击遮罩层关闭对话框
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        document.body.removeChild(dialogOverlay);
        if (typeof onClose === 'function') {
          onClose();
        }
      }
    });
  },
};

// 生成题目页面
const generatePage = {
  currentStep: 1,
  fieldValue: '',
  questionCount: 5,
  difficulty: 'medium',
  selectedTypes: [],
  generatedQuestions: null,
  
  // 初始化页面
  init() {
    // 重置可能残留的document.execCommand状态
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('insertBrOnReturn', false, false);
    } catch (e) {
      console.error('重置编辑器命令失败:', e);
    }
    
    this.setupStepNavigation();
    this.setupQuestionTypeUI();
    this.loadDailyGenerationData(); // 加载每日生成数据
    this.loadUsedQuestionContents(); // 加载历史题目记录
    
    // 确保输入框正确初始化
    this.ensureFieldInputInteractive();
  },
  
  // 确保专业领域输入框可交互
  ensureFieldInputInteractive() {
    const fieldInput = document.getElementById('field-input');
    if (!fieldInput) {
      console.error('找不到输入框元素(#field-input)');
      return;
    }
    
    console.log('尝试确保输入框可交互');
    
    // 完全重新创建一个新的输入框元素，避免继承任何可能的问题状态
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.id = 'field-input';
    newInput.className = 'form-control';
    newInput.placeholder = '例如：计算机科学、医学、法律、经济学等';
    
    // 如果有之前保存的值，恢复它
    if (this.fieldValue) {
      newInput.value = this.fieldValue;
    } else {
      newInput.value = fieldInput.value || '';
    }
    
    // 确保新输入框可交互
    newInput.readOnly = false;
    newInput.disabled = false;
    newInput.tabIndex = 0;  // 确保可以通过Tab键聚焦
    newInput.style.pointerEvents = 'auto';
    newInput.style.zIndex = '1000';
    newInput.style.position = 'relative';
    newInput.style.opacity = '1';
    newInput.style.visibility = 'visible';
    newInput.style.userSelect = 'text';
    newInput.autocomplete = 'on';
    
    // 替换原有的输入框
    if (fieldInput.parentNode) {
      fieldInput.parentNode.replaceChild(newInput, fieldInput);
      
      // 为新的输入框添加点击和聚焦事件，使用捕获阶段以确保先于其他事件处理
      newInput.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          newInput.focus();
          console.log('输入框被点击并聚焦');
        } catch (err) {
          console.error('输入框聚焦失败:', err);
        }
      }, true);
      
      // 添加mousedown事件，确保点击能被处理
      newInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      }, true);
      
      // 尝试立即聚焦
      try {
        newInput.focus();
        console.log('输入框已聚焦');
      } catch (err) {
        console.error('输入框初始聚焦失败:', err);
      }
      
      // 延迟再次尝试聚焦
      setTimeout(() => {
        try {
          const currentInput = document.getElementById('field-input');
          if (currentInput) {
            currentInput.focus();
            console.log('输入框延迟聚焦成功');
          }
        } catch (err) {
          console.error('输入框延迟聚焦失败:', err);
        }
      }, 200);
    } else {
      console.error('输入框没有父元素，无法替换');
    }
    
    return newInput;  // 返回新创建的输入框元素
  },
  
  // 设置步骤导航
  setupStepNavigation() {
    // 下一步按钮
    document.querySelectorAll('.next-step').forEach(button => {
      button.addEventListener('click', (e) => {
        const nextStepId = e.currentTarget.getAttribute('data-next');
        
        if (nextStepId === 'step-2') {
          const fieldInput = document.getElementById('field-input');
          if (fieldInput) {
            const fieldValue = fieldInput.value.trim();
            
            if (fieldValue === '') {
              alert('请输入专业领域');
              return;
            }
            
            // 显示检测中状态
            button.disabled = true;
            button.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div> 检测中...';
            
            // 检测专业领域是否合适
            this.checkField(fieldValue).then(result => {
              button.disabled = false;
              button.innerHTML = '下一步 <i class="bi bi-arrow-right"></i>';
              
              if (result.suitable) {
                this.fieldValue = fieldValue;
                this.goToStep(nextStepId);
                this.generateQuestionTypes();
              } else {
                alert(`专业领域检测结果：${result.message || '输入内容不合适，请重新输入'}`);
              }
            }).catch(error => {
              console.error('检测专业领域失败:', error);
              button.disabled = false;
              button.innerHTML = '下一步 <i class="bi bi-arrow-right"></i>';
              alert('检测专业领域时出错，请重试');
            });
          }
        } else if (nextStepId === 'step-3') {
          const questionCount = document.getElementById('question-count');
          const difficulty = document.getElementById('difficulty');
          
          if (questionCount) {
            this.questionCount = parseInt(questionCount.value);
          }
          
          if (difficulty) {
            this.difficulty = difficulty.value;
          }
          
          this.selectedTypes = this.getSelectedTypes();
          this.goToStep(nextStepId);
          this.generateQuestions();
        } else {
          this.goToStep(nextStepId);
        }
      });
    });
    
    // 上一步按钮
    document.querySelectorAll('.prev-step').forEach(button => {
      button.addEventListener('click', (e) => {
        const prevStepId = e.currentTarget.getAttribute('data-prev');
        this.goToStep(prevStepId);
      });
    });
    
    // 保存题目按钮
    const saveButton = document.getElementById('save-questions');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        this.saveQuestions();
      });
    }
    
    // 生成新题目按钮
    const generateNewButton = document.getElementById('generate-new');
    if (generateNewButton) {
      generateNewButton.addEventListener('click', () => {
        this.generateQuestions();
      });
    }
  },
  
  // 切换到指定步骤
  goToStep(stepId) {
    document.querySelectorAll('.step').forEach(step => {
      step.style.display = 'none';
    });
    
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
      targetStep.style.display = 'block';
      this.currentStep = parseInt(stepId.split('-')[1]);
      
      // 当返回到第一步时，确保输入框可以正常工作
      if (stepId === 'step-1') {
        console.log('返回到步骤1，确保输入框可交互');
        
        // 使用类似的递归尝试方式确保输入框可交互
        const tryActivateInput = (attempt = 1, maxAttempts = 5) => {
          if (attempt > maxAttempts) return;
          
          console.log(`步骤1: 第${attempt}次尝试激活输入框`);
          const input = this.ensureFieldInputInteractive();
          
          if (input) {
            // 强制激活
            setTimeout(() => {
              input.click();
              input.focus();
            }, 50);
          }
          
          // 递增延迟
          setTimeout(() => tryActivateInput(attempt + 1, maxAttempts), 200 * attempt);
        };
        
        // 启动尝试序列
        setTimeout(() => tryActivateInput(), 100);
      }
    }
  },
  
  // 设置题目类型UI
  setupQuestionTypeUI() {
    const container = document.getElementById('question-types-container');
    
    // 初始状态显示加载提示
    if (container) {
      container.innerHTML = '<p>请先输入专业领域以生成适合的题目类型</p>';
    }
  },
  
  // 根据专业领域生成题目类型选项
  generateQuestionTypes() {
    if (!this.fieldValue) return;
    
    const container = document.getElementById('question-types-container');
    if (!container) return;
    
    // 显示加载状态
    container.innerHTML = '<p>正在分析专业领域，生成适合的题目类型选项...</p>';
    
    // 减少不必要的延迟，加快UI响应
    setTimeout(() => {
      // 根据专业领域生成题目类型选项
      // 这里是示例数据，实际应用中应该调用后端API
      const types = this.getQuestionTypesByField(this.fieldValue);
      
      // 创建选项UI - 使用radio类型的input确保单选
      const optionsHtml = `
        <div class="question-type-options">
          ${types.map((type, index) => `
            <div class="question-type-option" data-type="${type.id}">
              <input type="radio" id="question-type-${type.id}" name="question-type" value="${type.id}" ${index === 0 ? 'checked' : ''}>
              <label for="question-type-${type.id}">${type.name}</label>
            </div>
          `).join('')}
        </div>

        <div class="form-check mt-4">
          <div class="generation-mode-selector">
            <h5>生成模式</h5>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="generation-mode" id="fast-generation" value="fast" checked>
              <label class="form-check-label" for="fast-generation">
                <strong>快速生成</strong>（本地生成，立即完成）
              </label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="generation-mode" id="ai-generation" value="ai">
              <label class="form-check-label" for="ai-generation">
                <strong>AI生成</strong>（更高质量，但可能较慢）
              </label>
            </div>
          </div>
        </div>
      `;
      
      container.innerHTML = optionsHtml;
      
      // 添加选择事件
      document.querySelectorAll('.question-type-option').forEach(option => {
        option.addEventListener('click', (e) => {
          // 确保点击整个选项区域时也能选中对应的radio按钮
          const radio = option.querySelector('input[type="radio"]');
          if (radio && e.target !== radio) {
            radio.checked = true;
          }
          
          // 更新选中样式
          document.querySelectorAll('.question-type-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');
        });
      });
      
      // 默认选中第一个选项
      const firstOption = document.querySelector('.question-type-option');
      if (firstOption) {
        firstOption.classList.add('selected');
      }
    }, 300); // 减少延迟时间
  },
  
  // 根据专业领域返回题目类型
  getQuestionTypesByField(field) {
    // 这里是示例数据，实际应用中应该调用后端API
    const commonTypes = [
      { id: 'single', name: '单选题' },
      { id: 'multiple', name: '多选题' },
      { id: 'tf', name: '判断题' },
      { id: 'short', name: '简答题' }
    ];
    
    // 根据不同领域添加特定题型
    if (field.includes('计算机') || field.includes('软件') || field.includes('编程')) {
      return [
        ...commonTypes,
        { id: 'coding', name: '编程题' },
        { id: 'debug', name: '代码调试题' }
      ];
    } else if (field.includes('医') || field.includes('生物') || field.includes('护理')) {
      return [
        ...commonTypes,
        { id: 'case', name: '病例分析' },
        { id: 'diagnosis', name: '诊断题' }
      ];
    } else if (field.includes('法') || field.includes('律')) {
      return [
        ...commonTypes,
        { id: 'case', name: '案例分析' },
        { id: 'application', name: '法律应用题' }
      ];
    } else {
      return commonTypes;
    }
  },
  
  // 获取选中的题目类型
  getSelectedTypes() {
    // 获取选中的单选按钮值
    const selectedRadio = document.querySelector('input[name="question-type"]:checked');
    
    // 如果有选中的单选按钮，返回它的值作为单元素数组
    if (selectedRadio) {
      return [selectedRadio.value];
    }
    
    return ['single']; // 默认返回单选题类型
  },
  
  // 生成题目
  generateQuestions() {
    const container = document.getElementById('questions-container');
    if (!container) return;
    
    // 检查是否使用自定义API密钥
    let isUsingCustomKey = false;
    try {
      isUsingCustomKey = this.checkIfUsingCustomKey();
    } catch (error) {
      console.warn('检查API密钥时出错:', error);
    }
    
    // 检查每日生成次数限制
    if (!isUsingCustomKey && !this.checkDailyGenerationLimit()) {
      container.innerHTML = `
        <div class="alert alert-warning">
          <h4><i class="bi bi-exclamation-triangle"></i> 已达到每日生成限制</h4>
          <p>使用默认API，您每天最多可以生成${MAX_DAILY_GENERATIONS}次题目。</p>
          <p>您可以在设置页面添加自己的API密钥以解除此限制。</p>
          <a href="#" class="btn btn-primary" id="go-to-settings">前往设置</a>
        </div>
      `;
      
      // 添加前往设置页面的事件监听
      const goToSettingsBtn = document.getElementById('go-to-settings');
      if (goToSettingsBtn) {
        goToSettingsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          pageManager.loadPage('settings');
        });
      }
      return;
    }
    
    // 显示加载状态
    container.innerHTML = `
      <div class="loading">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">正在生成题目...</span>
        </div>
        <p>正在生成题目，请稍候...</p>
      </div>
    `;
    
    // 如果不是使用自定义API密钥，增加生成次数计数
    if (!isUsingCustomKey) {
      try {
        this.incrementDailyGenerationCount();
      } catch (error) {
        console.warn('增加生成次数计数时出错:', error);
      }
    }
    
    // 检查使用哪种生成模式
    const fastGenerationRadio = document.getElementById('fast-generation');
    const aiGenerationRadio = document.getElementById('ai-generation');
    const useFastMode = !aiGenerationRadio || !aiGenerationRadio.checked;
    
    // 如果启用快速生成模式，直接使用本地生成
    if (useFastMode) {
      console.log('使用快速生成模式（本地生成）');
      try {
        // 生成本地随机题目
        const questions = this.generateRandomQuestions();
        
        // 保存生成的题目
        this.generatedQuestions = questions;
        
        // 创建题目UI
        let questionsHtml = '';
        this.generatedQuestions.forEach((question, index) => {
          questionsHtml += this.createQuestionCard(question, index);
        });
        
        container.innerHTML = questionsHtml;
        
        // 添加检查答案事件监听
        this.setupAnswerCheckEvents();
        
        // 显示保存和重新生成按钮
        const saveButton = document.getElementById('save-questions');
        const generateNewButton = document.getElementById('generate-new');
        
        if (saveButton) saveButton.style.display = 'block';
        if (generateNewButton) generateNewButton.style.display = 'block';
      } catch (error) {
        console.error('本地生成题目失败:', error);
        container.innerHTML = `
          <div class="alert alert-danger">
            <h4><i class="bi bi-exclamation-triangle"></i> 生成题目失败</h4>
            <p>${error.message || '请稍后重试'}</p>
            <button class="btn btn-primary retry-generate">重试</button>
          </div>
        `;
        
        // 添加重试按钮事件监听
        const retryButton = container.querySelector('.retry-generate');
        if (retryButton) {
          retryButton.addEventListener('click', () => {
            this.generateQuestions();
          });
        }
      }
      return;
    }
    
    // 添加超时处理
    let isTimeout = false;
    const timeoutId = setTimeout(() => {
      isTimeout = true;
      console.error('生成题目超时，使用本地生成');
      // 生成本地随机题目作为备选
      const questions = this.generateRandomQuestions();
      
      // 保存生成的题目
      this.generatedQuestions = questions;
      
      // 创建题目UI
      let questionsHtml = '';
      this.generatedQuestions.forEach((question, index) => {
        questionsHtml += this.createQuestionCard(question, index);
      });
      
      container.innerHTML = questionsHtml;
      
      // 添加检查答案事件监听
      this.setupAnswerCheckEvents();
      
      // 显示保存和重新生成按钮
      const saveButton = document.getElementById('save-questions');
      const generateNewButton = document.getElementById('generate-new');
      
      if (saveButton) saveButton.style.display = 'block';
      if (generateNewButton) generateNewButton.style.display = 'block';
    }, 30000); // 30秒超时
    
    // 使用AI生成题目
    this.generateQuestionsWithAI()
      .then(questions => {
        // 如果已经超时处理了，不再继续执行
        if (isTimeout) return;
        clearTimeout(timeoutId);
        
        // 保存生成的题目
        this.generatedQuestions = questions;
        
        // 创建题目UI
        let questionsHtml = '';
        
        this.generatedQuestions.forEach((question, index) => {
          questionsHtml += this.createQuestionCard(question, index);
        });
        
        container.innerHTML = questionsHtml;
        
        // 添加检查答案事件监听
        this.setupAnswerCheckEvents();
        
        // 显示保存和重新生成按钮
        const saveButton = document.getElementById('save-questions');
        const generateNewButton = document.getElementById('generate-new');
        
        if (saveButton) saveButton.style.display = 'block';
        if (generateNewButton) generateNewButton.style.display = 'block';
      })
      .catch(error => {
        // 如果已经超时处理了，不再继续执行
        if (isTimeout) return;
        clearTimeout(timeoutId);
        
        console.error('生成题目失败:', error);
        
        // 显示错误信息
        container.innerHTML = `
          <div class="alert alert-danger">
            <h4><i class="bi bi-exclamation-triangle"></i> 生成题目失败</h4>
            <p>${error.message || '请稍后重试'}</p>
            <div class="d-flex gap-2">
              <button class="btn btn-primary retry-generate">重试</button>
              <button class="btn btn-secondary use-local-generate">使用本地生成</button>
            </div>
          </div>
        `;
        
        // 添加重试按钮事件监听
        const retryButton = container.querySelector('.retry-generate');
        if (retryButton) {
          retryButton.addEventListener('click', () => {
            this.generateQuestions();
          });
        }
        
        // 添加使用本地生成按钮事件监听
        const useLocalButton = container.querySelector('.use-local-generate');
        if (useLocalButton) {
          useLocalButton.addEventListener('click', () => {
            // 生成本地随机题目
            const questions = this.generateRandomQuestions();
            
            // 保存生成的题目
            this.generatedQuestions = questions;
            
            // 创建题目UI
            let questionsHtml = '';
            this.generatedQuestions.forEach((question, index) => {
              questionsHtml += this.createQuestionCard(question, index);
            });
            
            container.innerHTML = questionsHtml;
            
            // 添加检查答案事件监听
            this.setupAnswerCheckEvents();
            
            // 显示保存和重新生成按钮
            const saveButton = document.getElementById('save-questions');
            const generateNewButton = document.getElementById('generate-new');
            
            if (saveButton) saveButton.style.display = 'block';
            if (generateNewButton) generateNewButton.style.display = 'block';
          });
        }
      });
  },
  
  // 使用AI生成题目
  async generateQuestionsWithAI() {
    console.log('使用AI生成题目');
    
    // 获取API设置
    const settings = settingsPage.settings || {}; // 直接获取settings对象
    const apiSettings = settings.api || {};
    
    // 根据提供商选择默认API密钥和端点
    let apiKey = DEFAULT_API_KEY; // 默认使用通义千问
    let apiEndpoint = 'https://api.tongyi.aliyun.com/v1/chat/completions';
    let modelName = 'qwen-max';
    
    if (apiSettings.provider === 'deepseek') {
      apiKey = DEEPSEEK_API_KEY;
      apiEndpoint = 'https://api.deepseek.com/v1/chat/completions';
      modelName = 'deepseek-chat';
    } else if (apiSettings.provider === 'custom' && apiSettings.key) {
      // 使用自定义API
      apiKey = apiSettings.key;
      apiEndpoint = apiSettings.endpoint || 'https://api.tongyi.aliyun.com/v1/chat/completions';
      modelName = apiSettings.model || 'qwen-max';
    }
    
    // 如果API密钥无效，则使用本地生成
    if (!apiKey || apiKey === 'YOUR_API_KEY') {
      console.error('无效的API密钥，使用本地生成');
      return this.generateRandomQuestions();
    }
    
    console.log(`使用API提供商: ${apiSettings.provider || '默认'}, 模型: ${modelName}`);
    
    // 构建提示词
    const typeNames = {
      'single': '单选题',
      'multiple': '多选题',
      'tf': '判断题',
      'short': '简答题'
    };
    
    // 简化提示词，降低token数量
    const typeText = this.selectedTypes.map(type => typeNames[type]).join('、');
    const difficultyText = this.getDifficultyText(this.difficulty);
    
    let prompt = `请生成${this.questionCount}道关于${this.fieldValue}的${difficultyText}${typeText}。
格式要求：
1. 每道题目包含题目内容、选项（简答题除外）和答案
2. 答案部分需要包含正确选项和简短解析
3. JSON格式输出，包含id、type、content、options和answer字段`;

    // 精简提示，加快处理速度
    const exampleQuestions = [
      {
        id: 'q1',
        type: 'single',
        content: '这是一道单选题示例',
        options: ['选项A', '选项B', '选项C', '选项D'],
        answer: 'A. 选项A\n\n解析：这是答案解析'
      }
    ];
    
    prompt += `\n示例格式：${JSON.stringify(exampleQuestions)}`;
    
    // 缓存生成设置，确保API请求期间数据一致性
    const cachedField = this.fieldValue;
    const cachedCount = this.questionCount;
    const cachedDifficulty = this.difficulty;
    const cachedTypes = [...this.selectedTypes];
    
    try {
      // 使用较小的token数量和更短的超时时间
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的题目生成助手，擅长根据要求生成高质量的各类题目。请直接生成符合要求的题目JSON数据。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2048,  // 减少token数量以加快生成速度
          temperature: 0.7
        })
      };
      
      // 设置请求超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), 15000);  // 15秒超时
      });
      
      // 发送API请求
      const responsePromise = fetch(apiEndpoint, requestOptions);
      const response = await Promise.race([responsePromise, timeoutPromise]);
      const data = await response.json();
      
      // 解析响应
      if (data.choices && data.choices.length > 0) {
        const questions = this.parseAIResponse(data);
        
        // 检查生成的题目是否符合当前要求
        // 仅在参数一致时才返回结果
        if (
          this.fieldValue === cachedField &&
          this.questionCount === cachedCount &&
          this.difficulty === cachedDifficulty &&
          JSON.stringify(this.selectedTypes) === JSON.stringify(cachedTypes)
        ) {
          return questions;
        } else {
          console.warn('生成参数已更改，重新生成题目');
          return this.generateRandomQuestions();
        }
      } else {
        console.error('AI响应格式错误，使用本地生成:', data);
        return this.generateRandomQuestions();
      }
    } catch (error) {
      console.error('AI生成题目失败，使用本地生成:', error);
      return this.generateRandomQuestions();
    }
  },
  
  // 本地生成随机题目
  generateRandomQuestions() {
    console.log('使用本地逻辑生成随机题目');
    
    // 加载历史题目记录 - 延迟加载以加快初始生成速度
    if (usedQuestionContents.size === 0) {
      try {
        this.loadUsedQuestionContents();
      } catch (e) {
        console.warn('加载历史题目记录失败，继续使用空记录:', e);
      }
    }
    
    // 检查是否使用自定义题库
    const useCustomBank = settingsPage.settings.questionBank && settingsPage.settings.questionBank.useCustom;
    
    if (useCustomBank && customQuestionBanks.length > 0) {
      console.log('使用自定义题库生成题目');
      return this.generateQuestionsFromCustomBanks();
    }
    
    console.log('使用系统默认题库生成题目');
    
    const questions = [];
    const currentUsedContents = new Set(); // 用于跟踪当前生成中已使用的题目内容
    
    // 获取当前选择的题型
    const questionTypes = this.selectedTypes.length > 0 ? this.selectedTypes : ['single', 'multiple', 'tf'];
    
    // 对于快速生成，允许一定程度的题目重复，只检查当前生成内容不重复
    // 生成指定数量的题目
    for (let i = 0; i < this.questionCount; i++) {
      // 随机选择一个题型
      const randomType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
      
      // 生成一个随机题目
      const question = this.generateRandomQuestion(i, randomType, this.fieldValue, this.difficulty);
      
      // 仅检查当前生成批次内不重复，以提高速度
      if (!currentUsedContents.has(question.content)) {
        questions.push(question);
        currentUsedContents.add(question.content);
      } else {
        // 如果题目重复，重新生成
        i--;
      }
    }
    
    // 保存已使用的题目内容 - 异步执行以不阻塞UI
    setTimeout(() => {
      try {
        this.saveUsedQuestionContents(currentUsedContents);
      } catch (e) {
        console.warn('保存题目内容记录失败:', e);
      }
    }, 100);
    
    return questions;
  },
  
  // 从自定义题库生成题目
  generateQuestionsFromCustomBanks() {
    const questions = [];
    const currentUsedContents = new Set();
    
    // 获取当前选择的题型
    const questionTypes = this.selectedTypes.length > 0 ? this.selectedTypes : ['single', 'multiple', 'tf'];
    
    // 从题库中选择题目
    const availableQuestions = this.getQuestionsFromCustomBanks(questionTypes);
    
    // 如果没有找到合适的题目，使用系统默认生成
    if (availableQuestions.length === 0) {
      console.log('自定义题库中没有找到合适的题目，使用系统默认生成');
      const defaultQuestions = [];
      for (let i = 0; i < this.questionCount; i++) {
        const randomType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
        const question = this.generateRandomQuestion(i, randomType, this.fieldValue, this.difficulty);
        defaultQuestions.push(question);
      }
      return defaultQuestions;
    }
    
    // 随机选择题目
    const maxAttempts = Math.min(availableQuestions.length * 2, 100); // 设置最大尝试次数
    let attempts = 0;
    
    while (questions.length < this.questionCount && attempts < maxAttempts) {
      attempts++;
      
      // 随机选择一个题目
      const randomIndex = Math.floor(Math.random() * availableQuestions.length);
      const candidateQuestion = availableQuestions[randomIndex];
      
      // 检查是否重复
      if (!currentUsedContents.has(candidateQuestion.content)) {
        // 确保题目有正确的ID格式
        const questionId = `q-${questions.length + 1}`;
        const formattedQuestion = {
          ...candidateQuestion,
          id: questionId
        };
        
        questions.push(formattedQuestion);
        currentUsedContents.add(candidateQuestion.content);
        
        // 可选：从可用题目中移除，确保不会重复选择
        if (questions.length < this.questionCount) {
          availableQuestions.splice(randomIndex, 1);
          
          // 如果没有更多可用题目，结束循环
          if (availableQuestions.length === 0) {
            break;
          }
        }
      }
    }
    
    // 如果没有选择足够的题目，补充系统生成的题目
    if (questions.length < this.questionCount) {
      console.log(`自定义题库中只找到了${questions.length}道合适的题目，补充系统生成的题目`);
      const remainingCount = this.questionCount - questions.length;
      
      for (let i = 0; i < remainingCount; i++) {
        const randomType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
        const question = this.generateRandomQuestion(questions.length + i, randomType, this.fieldValue, this.difficulty);
        
        if (!currentUsedContents.has(question.content)) {
          questions.push(question);
          currentUsedContents.add(question.content);
        } else {
          i--; // 如果重复，重试
        }
      }
    }
    
    return questions;
  },
  
  // 从自定义题库中获取符合条件的题目
  getQuestionsFromCustomBanks(types) {
    const result = [];
    
    // 遍历所有题库
    for (const bank of customQuestionBanks) {
      // 如果题库直接包含questions数组
      if (bank.questions && Array.isArray(bank.questions)) {
        for (const question of bank.questions) {
          // 检查题目类型是否符合要求
          if (types.includes(question.type)) {
            // 检查是否与专业领域相关（简单文本匹配）
            if (this.isQuestionRelevantToField(question, this.fieldValue)) {
              result.push(question);
            }
          }
        }
      }
      // 如果题库使用categories组织
      else if (bank.categories) {
        // 遍历所有分类
        for (const categoryKey in bank.categories) {
          const category = bank.categories[categoryKey];
          
          // 检查分类是否与专业领域相关
          if (this.isCategoryRelevantToField(category, this.fieldValue)) {
            // 遍历分类中的所有题目
            if (category.questions && Array.isArray(category.questions)) {
              for (const question of category.questions) {
                // 检查题目类型是否符合要求
                if (types.includes(question.type)) {
                  result.push(question);
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`从自定义题库中找到${result.length}道符合条件的题目`);
    return result;
  },
  
  // 检查题目是否与专业领域相关
  isQuestionRelevantToField(question, field) {
    if (!field) return true; // 如果没有指定专业领域，默认相关
    
    // 将专业领域转换为小写，用于不区分大小写匹配
    const lowercaseField = field.toLowerCase();
    
    // 检查题目内容是否包含专业领域关键词
    if (question.content && question.content.toLowerCase().includes(lowercaseField)) {
      return true;
    }
    
    // 检查题目答案是否包含专业领域关键词
    if (question.answer && question.answer.toLowerCase().includes(lowercaseField)) {
      return true;
    }
    
    // 检查题目的任何元数据是否包含专业领域关键词
    if (question.field && question.field.toLowerCase().includes(lowercaseField)) {
      return true;
    }
    
    if (question.category && question.category.toLowerCase().includes(lowercaseField)) {
      return true;
    }
    
    if (question.tags && Array.isArray(question.tags)) {
      for (const tag of question.tags) {
        if (tag.toLowerCase().includes(lowercaseField)) {
          return true;
        }
      }
    }
    
    // 默认不相关
    return false;
  },
  
  // 检查分类是否与专业领域相关
  isCategoryRelevantToField(category, field) {
    if (!field) return true; // 如果没有指定专业领域，默认相关
    
    // 将专业领域转换为小写，用于不区分大小写匹配
    const lowercaseField = field.toLowerCase();
    
    // 检查分类名称是否包含专业领域关键词
    if (category.name && category.name.toLowerCase().includes(lowercaseField)) {
      return true;
    }
    
    // 检查分类描述是否包含专业领域关键词
    if (category.description && category.description.toLowerCase().includes(lowercaseField)) {
      return true;
    }
    
    // 默认不相关
    return false;
  },
  
  // 生成随机题目
  generateRandomQuestion(index, type, field, difficulty) {
    const id = `q-${Date.now()}-${index}`;
    let difficultyText;
    
    // 获取难度文本
    switch (difficulty) {
      case 'level1': difficultyText = '初窥门径'; break;
      case 'level2': difficultyText = '问道寻幽'; break;
      case 'level3': difficultyText = '破茧凌虚'; break;
      case 'level4': difficultyText = '踏月摘星'; break;
      case 'level5': difficultyText = '弈天问道'; break;
      case 'level6': difficultyText = '无相劫海'; break;
      case 'level7': difficultyText = '太一归墟'; break;
      // 保留旧版本的兼容性
      case 'easy': difficultyText = '初窥门径'; break;
      case 'medium': difficultyText = '踏月摘星'; break;
      case 'hard': difficultyText = '太一归墟'; break;
      default: difficultyText = '踏月摘星'; break;
    }
    
    // 根据题目类型生成不同的题目
    switch (type) {
      case 'single':
        return this.generateRandomSingleChoice(id, field, difficultyText);
      case 'multiple':
        return this.generateRandomMultipleChoice(id, field, difficultyText);
      case 'tf':
        return this.generateRandomTrueFalse(id, field, difficultyText);
      case 'short':
        return this.generateRandomShortAnswer(id, field, difficultyText);
      default:
        return this.generateRandomSingleChoice(id, field, difficultyText);
    }
  },
  
  // 生成随机单选题
  generateRandomSingleChoice(id, field, difficultyText) {
    // 根据专业领域生成不同的题目内容
    const topics = this.getTopicsByField(field);
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    // 生成题目内容
    const content = `关于${field}中的${randomTopic}，以下说法正确的是：`;
    
    // 根据专业领域和主题生成更有意义的选项
    const options = this.generateMeaningfulOptions(field, randomTopic, 'single');
    
    // 随机选择一个正确答案
    const correctIndex = Math.floor(Math.random() * 4);
    const correctOption = String.fromCharCode(65 + correctIndex);
    
    // 生成更有意义的答案解析
    const answer = `${correctOption}. ${options[correctIndex]}\n\n解析：${this.generateExplanation(field, randomTopic, options[correctIndex], difficultyText)}`;
    
    return {
      id,
      type: 'single',
      content,
      options,
      answer
    };
  },
  
  // 生成有意义的选项内容
  generateMeaningfulOptions(field, topic, type) {
    // 为不同领域和主题生成特定的选项内容
    const optionsMap = {
      '法律': {
        '宪法': [
          '宪法是国家的根本大法，具有最高的法律效力',
          '宪法只规定公民的基本权利，不涉及国家机构的组织',
          '宪法可以由全国人大常委会随时修改',
          '宪法的修改不需要特定的程序'
        ],
        '民法': [
          '民法调整平等主体之间的人身关系和财产关系',
          '民法的基本原则不包括诚实信用原则',
          '民事法律关系的主体只能是自然人',
          '民法典是我国第一部以法典命名的法律'
        ],
        '刑法': [
          '刑法规定了犯罪与刑罚的基本原则',
          '刑法可以溯及既往，对过去的行为进行处罚',
          '刑法中的罪刑法定原则是指犯罪由法官自由裁量',
          '我国刑法不区分故意犯罪和过失犯罪'
        ],
        '诉讼法': [
          '诉讼法规定了解决纠纷的程序和规则',
          '民事诉讼中当事人可以自行和解，不需要法院批准',
          '行政诉讼的被告只能是行政机关个人',
          '刑事诉讼中被告人没有权利为自己辩护'
        ],
        '国际法': [
          '国际法调整国家之间以及其他国际法主体之间的关系',
          '国际法的主体仅限于主权国家',
          '联合国安理会决议对所有国家都没有约束力',
          '国际条约在签署后立即生效，无需批准'
        ]
      },
      '计算机': {
        '算法': [
          '算法是解决问题的清晰指令步骤',
          '算法的时间复杂度与问题规模无关',
          '所有排序算法的最优时间复杂度都是O(nlogn)',
          '贪心算法总是能得到全局最优解'
        ],
        '数据结构': [
          '数据结构是组织和存储数据的方式',
          '链表的随机访问时间复杂度为O(1)',
          '二叉搜索树的查找、插入和删除操作平均时间复杂度都是O(n)',
          '哈希表的查找操作最坏情况时间复杂度总是O(1)'
        ],
        '操作系统': [
          '操作系统是管理计算机硬件与软件资源的系统软件',
          '分时系统允许多个程序同时运行',
          '死锁的必要条件不包括互斥条件',
          '虚拟内存技术要求所有程序完全加载到物理内存中'
        ],
        '计算机网络': [
          'TCP是一种面向连接的可靠传输协议',
          'IP地址分为公网地址和私网地址',
          'HTTP是一种有状态的协议',
          'DNS服务器的主要功能是分配IP地址'
        ],
        '数据库': [
          '关系型数据库使用SQL作为查询语言',
          '数据库事务必须满足ACID特性',
          '主键可以包含NULL值',
          '外键约束只用于提高查询性能'
        ]
      },
      '医学': {
        '解剖学': [
          '人体的心脏位于胸腔，偏左侧',
          '人的肝脏位于腹腔右上方',
          '人体最大的器官是大脑',
          '人体的肾脏位于腹腔前方'
        ],
        '生理学': [
          '血液在人体内的循环由心脏泵动推动',
          '人体的正常体温范围是38-40摄氏度',
          '胰岛素的主要功能是升高血糖',
          '神经冲动的传导不需要任何化学物质参与'
        ],
        '内科学': [
          '高血压是常见的慢性疾病，与多种因素有关',
          '糖尿病患者体内胰岛素分泌总是过多',
          '肺炎只能由细菌感染引起',
          '心肌梗死的主要症状是腹痛'
        ]
      }
    };
    
    // 获取领域相关选项
    let fieldOptions = optionsMap[field];
    
    // 如果没有该领域的预设选项，使用通用选项
    if (!fieldOptions) {
      return [
        `${topic}是${field}领域中的重要概念，具有独特的特点和应用价值`,
        `${topic}在${field}领域中并不重要，可以被其他概念完全替代`,
        `${topic}是${field}领域中的一个误解，实际上并不存在`,
        `${topic}只在理论研究中有意义，在实践中没有应用价值`
      ];
    }
    
    // 获取主题相关选项
    let topicOptions = fieldOptions[topic];
    
    // 如果没有该主题的预设选项，使用该领域下随机一个主题的选项
    if (!topicOptions) {
      const availableTopics = Object.keys(fieldOptions);
      if (availableTopics.length > 0) {
        const randomAvailableTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
        topicOptions = fieldOptions[randomAvailableTopic];
      } else {
        // 如果该领域下没有任何主题的预设选项，使用通用选项
        return [
          `${topic}是${field}领域中的核心概念，有着广泛的应用`,
          `${topic}在${field}研究中的作用被高估了，实际意义有限`,
          `${topic}是${field}领域中最新发展的方向，尚未得到广泛认可`,
          `${topic}已经被${field}领域的新理论所取代，不再具有研究价值`
        ];
      }
    }
    
    // 如果预设选项不足4个，补充通用选项
    while (topicOptions.length < 4) {
      topicOptions.push(`关于${topic}的补充选项${topicOptions.length + 1}`);
    }
    
    // 返回选项，如果预设选项超过4个，随机选择4个
    if (topicOptions.length > 4) {
      const shuffled = [...topicOptions].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 4);
    }
    
    return topicOptions;
  },
  
  // 生成解释
  generateExplanation(field, topic, correctOption, difficultyText) {
    return `在${field}领域中，${topic}的特点是非常明确的。${correctOption}是正确的说法，因为这符合${field}学科中对${topic}的权威定义和理解。难度级别为${difficultyText}。`;
  },
  
  // 生成随机多选题
  generateRandomMultipleChoice(id, field, difficultyText) {
    // 根据专业领域生成不同的题目内容
    const topics = this.getTopicsByField(field);
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    // 生成题目内容
    const content = `关于${field}中的${randomTopic}，以下说法正确的有：`;
    
    // 根据专业领域和主题生成更有意义的选项
    const options = this.generateMeaningfulOptions(field, randomTopic, 'multiple');
    
    // 随机选择2-3个正确答案
    const correctCount = Math.floor(Math.random() * 2) + 2; // 2或3个正确答案
    const correctIndices = [];
    while (correctIndices.length < correctCount) {
      const index = Math.floor(Math.random() * 4);
      if (!correctIndices.includes(index)) {
        correctIndices.push(index);
      }
    }
    correctIndices.sort((a, b) => a - b);
    
    // 生成答案字符串
    const correctOptions = correctIndices.map(i => String.fromCharCode(65 + i));
    const answerText = correctOptions.join(', ');
    
    // 生成更有意义的答案解析
    const correctStatementsText = correctIndices.map(i => options[i]).join('；');
    const answer = `${answerText}. ${correctStatementsText}\n\n解析：在${field}领域中，${randomTopic}有多个正确的特性。上述选项中，${correctStatementsText}是正确的说法，符合${field}学科中对${randomTopic}的权威理解。难度级别为${difficultyText}。`;
    
    return {
      id,
      type: 'multiple',
      content,
      options,
      answer
    };
  },
  
  // 生成随机判断题
  generateRandomTrueFalse(id, field, difficultyText) {
    // 根据专业领域生成不同的题目内容
    const topics = this.getTopicsByField(field);
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    // 生成更有意义的判断题内容
    const statements = this.generateTrueFalseStatements(field, randomTopic);
    const randomIndex = Math.floor(Math.random() * statements.length);
    const statement = statements[randomIndex];
    
    // 获取正确答案和解释
    const isTrue = statement.isTrue;
    const explanation = statement.explanation;
    
    // 生成题目内容
    const content = `判断：${statement.content}`;
    
    // 生成答案解析
    const answer = isTrue ? 
      `A. 正确\n\n解析：${explanation}。难度级别为${difficultyText}。` : 
      `B. 错误\n\n解析：${explanation}。难度级别为${difficultyText}。`;
    
    return {
      id,
      type: 'tf',
      content,
      options: ['正确', '错误'],
      answer
    };
  },
  
  // 生成判断题陈述
  generateTrueFalseStatements(field, topic) {
    // 为不同领域和主题生成特定的判断题陈述
    const statementsMap = {
      '法律': {
        '宪法': [
          { content: '宪法是国家的根本大法，具有最高的法律效力', isTrue: true, explanation: '宪法确实是国家的根本大法，在法律体系中具有最高的法律效力，其他法律法规不得与宪法相抵触' },
          { content: '我国宪法可以由全国人大常委会修改', isTrue: false, explanation: '我国宪法的修改权专属于全国人民代表大会，需要由特定多数的全国人大代表表决通过，全国人大常委会无权修改宪法' }
        ],
        '民法': [
          { content: '民法调整平等主体之间的人身关系和财产关系', isTrue: true, explanation: '民法的调整对象确实是平等主体之间的人身关系和财产关系，这是民法的基本特征' },
          { content: '民事法律关系的主体只能是自然人', isTrue: false, explanation: '民事法律关系的主体包括自然人、法人和非法人组织，不仅限于自然人' }
        ],
        '刑法': [
          { content: '刑法规定了犯罪与刑罚的基本原则', isTrue: true, explanation: '刑法确实规定了犯罪与刑罚的基本原则，包括罪刑法定原则、罪责刑相适应原则等' },
          { content: '刑法可以溯及既往，对过去的行为进行处罚', isTrue: false, explanation: '刑法遵循罪刑法定原则，一般不具有溯及力，不能对行为发生时不构成犯罪的行为进行处罚，但对于特殊情况如反人类罪等可能有例外' }
        ],
        '诉讼法': [
          { content: '诉讼法规定了解决纠纷的程序和规则', isTrue: true, explanation: '诉讼法确实规定了解决纠纷的程序和规则，包括起诉、审理、判决等各个环节的具体规定' },
          { content: '刑事诉讼中被告人没有权利为自己辩护', isTrue: false, explanation: '刑事诉讼中被告人享有辩护权，可以为自己辩护，也可以委托辩护人辩护，这是被告人的基本诉讼权利' }
        ]
      },
      '计算机': {
        '算法': [
          { content: '算法是解决问题的清晰指令步骤', isTrue: true, explanation: '算法确实是解决问题的清晰指令步骤，它是一系列明确定义的计算步骤，用于解决特定问题或完成特定任务' },
          { content: '算法的时间复杂度与问题规模无关', isTrue: false, explanation: '算法的时间复杂度通常与问题规模密切相关，表示为O(n)、O(n²)等形式，反映了算法执行时间随输入规模增长的变化趋势' }
        ],
        '数据结构': [
          { content: '数据结构是组织和存储数据的方式', isTrue: true, explanation: '数据结构确实是组织和存储数据的方式，它定义了数据元素之间的关系以及可以对数据执行的操作' },
          { content: '链表的随机访问时间复杂度为O(1)', isTrue: false, explanation: '链表的随机访问时间复杂度为O(n)，因为需要从头节点开始遍历才能访问特定位置的元素，而数组的随机访问时间复杂度才是O(1)' }
        ],
        '操作系统': [
          { content: '操作系统是管理计算机硬件与软件资源的系统软件', isTrue: true, explanation: '操作系统确实是管理计算机硬件与软件资源的系统软件，它为用户程序提供服务并管理计算机资源' },
          { content: '虚拟内存技术要求所有程序完全加载到物理内存中', isTrue: false, explanation: '虚拟内存技术的核心思想恰恰是允许程序不必完全加载到物理内存中就能运行，它通过页面置换机制在物理内存和外部存储之间交换数据' }
        ]
      },
      '医学': {
        '解剖学': [
          { content: '人体的心脏位于胸腔，偏左侧', isTrue: true, explanation: '人体的心脏确实位于胸腔，且偏向左侧，约有2/3位于身体中线的左侧' },
          { content: '人体最大的器官是大脑', isTrue: false, explanation: '人体最大的器官是皮肤，而不是大脑。皮肤是人体最大的器官，覆盖全身并发挥保护、感觉等多种功能' }
        ],
        '生理学': [
          { content: '血液在人体内的循环由心脏泵动推动', isTrue: true, explanation: '血液在人体内的循环确实是由心脏的泵动作用推动的，心脏通过收缩和舒张产生压力差，使血液在血管中流动' },
          { content: '人体的正常体温范围是38-40摄氏度', isTrue: false, explanation: '人体的正常体温范围是36-37摄氏度，38摄氏度以上通常被认为是发热状态' }
        ]
      }
    };
    
    // 获取领域相关陈述
    let fieldStatements = statementsMap[field];
    
    // 如果没有该领域的预设陈述，使用通用陈述
    if (!fieldStatements) {
      return [
        { content: `${topic}是${field}领域中的重要概念，具有独特的特点和应用价值`, isTrue: true, explanation: `${topic}确实是${field}领域中的重要概念，在理论研究和实际应用中都有重要价值` },
        { content: `${topic}在${field}领域中并不重要，可以被其他概念完全替代`, isTrue: false, explanation: `${topic}在${field}领域中有其独特的地位和作用，不能被其他概念完全替代` }
      ];
    }
    
    // 获取主题相关陈述
    let topicStatements = fieldStatements[topic];
    
    // 如果没有该主题的预设陈述，使用该领域下随机一个主题的陈述
    if (!topicStatements) {
      const availableTopics = Object.keys(fieldStatements);
      if (availableTopics.length > 0) {
        const randomAvailableTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
        topicStatements = fieldStatements[randomAvailableTopic];
      } else {
        // 如果该领域下没有任何主题的预设陈述，使用通用陈述
        return [
          { content: `${topic}是${field}领域中的核心概念，有着广泛的应用`, isTrue: true, explanation: `${topic}确实是${field}领域中的核心概念，在多个方面都有重要应用` },
          { content: `${topic}已经被${field}领域的新理论所取代，不再具有研究价值`, isTrue: false, explanation: `${topic}在${field}领域中仍然具有重要的研究价值，并未被新理论完全取代` }
        ];
      }
    }
    
    return topicStatements;
  },
  
  // 生成随机简答题
  generateRandomShortAnswer(id, field, difficultyText) {
    // 根据专业领域生成不同的题目内容
    const topics = this.getTopicsByField(field);
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    // 获取简答题内容和答案
    const shortAnswerData = this.generateShortAnswerContent(field, randomTopic);
    
    // 生成题目内容
    const content = shortAnswerData.question;
    
    // 生成答案解析
    const answer = `参考答案：\n${shortAnswerData.answer}\n\n难度级别：${difficultyText}`;
    
    return {
      id,
      type: 'short',
      content,
      options: [],
      answer
    };
  },
  
  // 生成简答题内容和答案
  generateShortAnswerContent(field, topic) {
    // 为不同领域和主题生成特定的简答题内容和答案
    const shortAnswerMap = {
      '法律': {
        '宪法': {
          question: `请简要说明宪法的特点和地位。`,
          answer: `宪法是国家的根本大法，具有最高的法律效力。其主要特点包括：\n1. 最高性：宪法是国家的根本法，具有最高的法律效力，其他法律法规不得与宪法相抵触\n2. 稳定性：宪法相对稳定，修改程序比一般法律更为严格\n3. 全局性：宪法规定国家的根本制度和根本任务，具有全局性\n4. 政治性：宪法具有鲜明的政治性，体现了国家的政治方向和基本原则\n\n在我国法律体系中，宪法处于核心地位，是制定其他法律的基础和依据。`
        },
        '民法': {
          question: `请简要说明民法的调整对象和基本原则。`,
          answer: `民法的调整对象是平等主体之间的人身关系和财产关系。\n\n民法的基本原则包括：\n1. 平等原则：民事主体在民事活动中的法律地位平等\n2. 自愿原则：民事主体从事民事活动，应当遵循自愿原则\n3. 公平原则：确定民事权利和民事义务应当遵循公平原则\n4. 诚信原则：民事主体从事民事活动，应当遵循诚信原则\n5. 不得违反法律和公序良俗原则：民事主体从事民事活动，不得违反法律，不得违背公序良俗\n\n这些原则贯穿于民法的各个领域，是处理民事关系的基本准则。`
        },
        '刑法': {
          question: `请简要说明刑法中的罪刑法定原则。`,
          answer: `罪刑法定原则是现代刑法的基本原则，其核心内容是"法无明文规定不为罪，法无明文规定不处罚"。\n\n该原则包括以下几个方面：\n1. 立法性：只有立法机关制定的法律才能规定犯罪和刑罚\n2. 明确性：刑法规定必须明确，不能模糊不清\n3. 禁止类推：不允许对刑法进行扩大解释或类推适用\n4. 从旧兼从轻：如果行为发生后刑法有变化，原则上适用行为时的法律，但新法较轻的除外\n\n罪刑法定原则是对公民权利的重要保障，限制了国家刑罚权的任意行使，体现了法治精神。`
        },
        '诉讼法': {
          question: `请简要说明民事诉讼的基本原则。`,
          answer: `民事诉讼的基本原则包括：\n1. 当事人平等原则：当事人在诉讼中地位平等，享有平等的诉讼权利\n2. 辩论原则：当事人有权就案件事实、证据和法律适用进行辩论\n3. 处分原则：当事人有权依法处分自己的民事权利和诉讼权利\n4. 公开审判原则：法院审理案件应当公开进行，但涉及国家秘密、个人隐私等特殊情况除外\n5. 两审终审制原则：民事案件实行两级审理终审制\n6. 回避原则：审判人员与案件有利害关系的应当回避\n\n这些原则共同构成了民事诉讼的基本框架，保障了民事诉讼的公正进行。`
        }
      },
      '计算机': {
        '算法': {
          question: `请简要说明算法的基本特征和常见的算法复杂度分析方法。`,
          answer: `算法的基本特征包括：\n1. 有穷性：算法必须在有限步骤内完成\n2. 确定性：算法的每一步骤必须有明确的定义\n3. 可行性：算法的每一步都必须是可执行的\n4. 输入：算法有零个或多个输入\n5. 输出：算法有一个或多个输出\n\n算法复杂度分析主要包括时间复杂度和空间复杂度：\n- 时间复杂度：用大O表示法描述算法执行时间与输入规模的关系，如O(1)、O(n)、O(n²)、O(logn)、O(nlogn)等\n- 空间复杂度：描述算法执行过程中所需额外空间与输入规模的关系\n\n常见的算法复杂度从低到高依次为：O(1) < O(logn) < O(n) < O(nlogn) < O(n²) < O(2^n) < O(n!)`
        },
        '数据结构': {
          question: `请简要介绍常见的数据结构及其特点。`,
          answer: `常见的数据结构及其特点：\n\n1. 数组：连续内存空间，支持随机访问，查找O(1)，插入删除O(n)\n2. 链表：非连续内存，通过指针连接，查找O(n)，头尾插入删除O(1)\n3. 栈：后进先出(LIFO)，只能在一端进行操作\n4. 队列：先进先出(FIFO)，一端入队，另一端出队\n5. 树：层次结构，二叉树、二叉搜索树、平衡树等变体\n6. 堆：特殊的完全二叉树，可用于实现优先队列\n7. 图：由顶点和边组成，表示多对多的关系\n8. 哈希表：通过哈希函数映射，平均查找O(1)\n\n选择合适的数据结构对算法效率至关重要，需要根据具体问题特点进行选择。`
        },
        '操作系统': {
          question: `请简要说明操作系统的主要功能和类型。`,
          answer: `操作系统的主要功能：\n1. 进程管理：创建、调度和终止进程\n2. 内存管理：分配和回收内存，实现虚拟内存\n3. 文件系统管理：文件的创建、存储、访问控制\n4. 设备管理：控制和管理各种输入输出设备\n5. 用户接口：提供命令行或图形用户界面\n6. 安全管理：提供访问控制和保护机制\n\n操作系统的主要类型：\n1. 批处理操作系统：一次处理一批作业\n2. 分时操作系统：多用户共享计算机资源\n3. 实时操作系统：对时间要求严格，用于控制系统\n4. 网络操作系统：管理网络资源和服务\n5. 分布式操作系统：管理分布在不同物理位置的资源\n6. 嵌入式操作系统：用于嵌入式设备，资源受限\n\n现代主流操作系统如Windows、macOS、Linux等通常兼具多种特性。`
        },
        '数据库': {
          question: `请简要说明关系型数据库的基本概念和特点。`,
          answer: `关系型数据库的基本概念和特点：\n\n基本概念：\n1. 关系：用二维表格表示的数据集合\n2. 元组：表中的一行，代表一个实体\n3. 属性：表中的一列，代表实体的一个特性\n4. 键：用于唯一标识元组的属性集合，包括主键、外键等\n5. 模式：数据库的结构定义\n\n主要特点：\n1. 使用SQL作为标准查询语言\n2. 支持ACID事务特性（原子性、一致性、隔离性、持久性）\n3. 数据以表格形式存储，表之间可以建立关联\n4. 支持复杂的联接操作和聚合函数\n5. 具有完善的完整性约束机制\n6. 数据独立性高，应用程序与物理存储分离\n\n常见的关系型数据库管理系统包括MySQL、Oracle、SQL Server、PostgreSQL等。`
        }
      },
      '医学': {
        '解剖学': {
          question: `请简要描述人体心脏的结构和功能。`,
          answer: `人体心脏的结构和功能：\n\n结构：\n1. 心脏位于胸腔中纵隔内，约2/3位于身体中线的左侧\n2. 由四个腔室组成：左心房、左心室、右心房、右心室\n3. 有四个瓣膜：二尖瓣、三尖瓣、肺动脉瓣和主动脉瓣\n4. 心脏壁由三层组成：内膜、心肌层和外膜\n5. 冠状动脉为心肌提供血液供应\n\n功能：\n1. 作为泵将血液输送到全身各处\n2. 右心接收静脉血并将其泵入肺部进行气体交换（肺循环）\n3. 左心接收来自肺部的含氧血液并将其泵入体循环\n4. 通过心跳维持血液循环，成人静息心率约60-100次/分钟\n5. 心输出量约为5-6升/分钟，可根据身体需要调节\n\n心脏的正常功能对维持人体生命活动至关重要。`
        },
        '生理学': {
          question: `请简要说明人体血液循环系统的组成和功能。`,
          answer: `人体血液循环系统的组成和功能：\n\n组成：\n1. 心脏：作为泵，推动血液循环\n2. 血管：包括动脉、静脉和毛细血管\n3. 血液：由血浆和血细胞组成\n\n功能：\n1. 运输功能：\n   - 将氧气和营养物质运送到组织细胞\n   - 将二氧化碳和代谢废物从组织运走\n   - 运输激素等调节物质\n2. 调节功能：\n   - 参与体温调节\n   - 维持体内pH值和水电解质平衡\n3. 防御功能：\n   - 白细胞和抗体参与免疫防御\n   - 血小板参与凝血过程，防止出血\n\n循环系统分为体循环和肺循环：\n- 体循环：左心室→主动脉→全身组织→静脉→右心房\n- 肺循环：右心室→肺动脉→肺→肺静脉→左心房\n\n血液循环系统的正常运作对维持人体内环境稳态至关重要。`
        },
        '病理学': {
          question: `请简要说明炎症的基本病理过程和临床表现。`,
          answer: `炎症的基本病理过程和临床表现：\n\n基本病理过程：\n1. 血管反应：血管扩张，通透性增加，导致红肿\n2. 细胞反应：白细胞趋化、粘附、迁移和吞噬\n3. 介质释放：组胺、前列腺素、细胞因子等炎症介质释放\n4. 修复过程：组织修复和重建\n\n炎症的五大基本征：\n1. 红斑(Rubor)：由于局部血管扩张引起\n2. 肿胀(Tumor)：由于血管通透性增加导致液体渗出\n3. 热感(Calor)：由于局部血流增加和代谢率升高\n4. 疼痛(Dolor)：由于炎症介质刺激神经末梢\n5. 功能障碍(Functio laesa)：炎症组织功能受损\n\n炎症可分为急性炎症和慢性炎症，是机体对有害刺激的防御反应，但过度炎症反应也可能导致组织损伤。炎症是多种疾病的共同病理基础。`
        }
      }
    };
    
    // 获取领域相关内容
    let fieldContent = shortAnswerMap[field];
    
    // 如果没有该领域的预设内容，使用通用内容
    if (!fieldContent) {
      return {
        question: `请简要说明${field}中${topic}的主要特点和应用。`,
        answer: `${topic}是${field}中的重要概念，具有以下主要特点：\n\n1. ${topic}具有系统性和完整性，是${field}领域中不可或缺的组成部分\n2. ${topic}有其特定的研究方法和理论体系\n3. ${topic}与${field}中的其他概念有密切联系\n\n在应用方面：\n1. ${topic}在${field}的理论研究中有重要地位\n2. ${topic}在实践中有广泛应用\n3. ${topic}的发展对推动${field}整体进步有重要意义`
      };
    }
    
    // 获取主题相关内容
    let topicContent = fieldContent[topic];
    
    // 如果没有该主题的预设内容，使用该领域下随机一个主题的内容
    if (!topicContent) {
      const availableTopics = Object.keys(fieldContent);
      if (availableTopics.length > 0) {
        const randomAvailableTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
        topicContent = fieldContent[randomAvailableTopic];
        
        // 替换问题中的主题名称
        topicContent = {
          question: topicContent.question.replace(randomAvailableTopic, topic),
          answer: topicContent.answer.replace(new RegExp(randomAvailableTopic, 'g'), topic)
        };
      } else {
        // 如果该领域下没有任何主题的预设内容，使用通用内容
        return {
          question: `请简要说明${field}中${topic}的主要概念和意义。`,
          answer: `${topic}是${field}领域中的重要概念，主要包括以下几个方面：\n\n1. 基本定义：${topic}是指在${field}中处理特定问题的一套方法和理论\n2. 核心原理：${topic}基于${field}的基本原理，强调系统性和整体性\n3. 发展历程：${topic}经历了从简单到复杂、从理论到实践的发展过程\n\n${topic}在${field}中具有重要意义：\n1. 理论意义：丰富和发展了${field}的理论体系\n2. 实践意义：为解决${field}中的实际问题提供了有效工具\n3. 发展前景：随着技术进步，${topic}将在${field}中发挥更大作用`
        };
      }
    }
    
    return topicContent;
  },
  
  // 根据专业领域获取相关主题
  getTopicsByField(field) {
    // 为不同的专业领域定义相关主题
    const fieldTopics = {
      '法律': ['宪法', '民法', '刑法', '行政法', '商法', '经济法', '国际法', '诉讼法', '知识产权法', '环境法'],
      '医学': ['解剖学', '生理学', '病理学', '药理学', '内科学', '外科学', '妇产科学', '儿科学', '神经科学', '免疫学'],
      '计算机': ['算法', '数据结构', '操作系统', '计算机网络', '数据库', '软件工程', '人工智能', '机器学习', '计算机图形学', '网络安全'],
      '经济学': ['微观经济学', '宏观经济学', '国际经济学', '发展经济学', '计量经济学', '金融经济学', '劳动经济学', '产业经济学', '区域经济学', '环境经济学'],
      '物理学': ['力学', '热力学', '电磁学', '光学', '量子力学', '相对论', '粒子物理学', '凝聚态物理学', '天体物理学', '核物理学'],
      '化学': ['有机化学', '无机化学', '分析化学', '物理化学', '生物化学', '高分子化学', '材料化学', '环境化学', '药物化学', '催化化学'],
      '生物学': ['细胞生物学', '分子生物学', '遗传学', '生态学', '进化生物学', '微生物学', '植物学', '动物学', '生物信息学', '系统生物学'],
      '历史': ['中国古代史', '中国近现代史', '世界古代史', '世界近现代史', '考古学', '历史地理学', '文化史', '经济史', '政治史', '军事史'],
      '文学': ['中国古代文学', '中国现当代文学', '外国文学', '文学理论', '比较文学', '民间文学', '儿童文学', '戏剧文学', '电影文学', '网络文学'],
      '哲学': ['形而上学', '认识论', '伦理学', '逻辑学', '美学', '中国哲学', '西方哲学', '宗教哲学', '科学哲学', '政治哲学'],
      '教育学': ['教育原理', '课程与教学论', '教育心理学', '教育社会学', '比较教育学', '教育管理学', '学前教育学', '特殊教育学', '高等教育学', '职业教育学'],
      '心理学': ['普通心理学', '实验心理学', '发展心理学', '社会心理学', '临床心理学', '认知心理学', '人格心理学', '异常心理学', '教育心理学', '工业心理学'],
      '艺术': ['美术', '音乐', '舞蹈', '戏剧', '电影', '摄影', '建筑', '设计', '书法', '工艺']
    };
    
    // 如果找不到对应的专业领域，返回通用主题
    return fieldTopics[field] || ['概念', '理论', '方法', '应用', '发展', '历史', '现状', '问题', '趋势', '案例'];
  },
  
  // 解析AI响应
  parseAIResponse(response) {
    console.log('解析AI响应');
    
    try {
      // 获取AI响应的内容
      let content = '';
      if (response.choices && response.choices[0] && response.choices[0].message) {
        content = response.choices[0].message.content;
      } else if (typeof response === 'string') {
        content = response;
      } else if (response && typeof response === 'object') {
        // 尝试直接将对象转换为字符串
        content = JSON.stringify(response);
      } else {
        console.warn('未知的响应格式，尝试使用本地生成');
        throw new Error('无效的AI响应格式');
      }
      
      // 尝试解析JSON
      let questions = [];
      
      // 首先检查内容是否已经是JSON对象或数组
      try {
        if (typeof content === 'string') {
          // 移除可能的干扰字符
          content = content.trim();
          
          // 尝试提取JSON部分
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                            content.match(/```\s*([\s\S]*?)\s*```/) || // 普通的代码块
                            content.match(/\[\s*\{\s*"id"\s*:/) ||  // 开头是数组
                            content.match(/\{\s*"questions"\s*:\s*\[/); // 开头是带questions属性的对象
          
          if (jsonMatch) {
            let jsonText = jsonMatch[0];
            // 尝试提取内容
            if (jsonMatch[1]) {
              jsonText = jsonMatch[1]; // 使用捕获组中的内容
            } else {
              // 移除可能的Markdown代码块标记
              jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```/, '');
              jsonText = jsonText.replace(/```\s*/, '').replace(/\s*```/, '');
            }
            
            try {
              // 解析JSON
              const parsedData = JSON.parse(jsonText);
              
              // 处理可能的嵌套结构
              if (Array.isArray(parsedData)) {
                questions = parsedData;
              } else if (parsedData.questions && Array.isArray(parsedData.questions)) {
                questions = parsedData.questions;
              } else {
                // 尝试将整个响应作为可能的JSON解析
                try {
                  const fullResponse = JSON.parse(content);
                  if (Array.isArray(fullResponse)) {
                    questions = fullResponse;
                  } else if (fullResponse.questions && Array.isArray(fullResponse.questions)) {
                    questions = fullResponse.questions;
                  } else {
                    throw new Error('无法识别的JSON结构');
                  }
                } catch (e) {
                  console.warn('解析整个响应为JSON失败, 使用本地生成:', e);
                  throw new Error('无法解析AI返回的题目数据');
                }
              }
            } catch (e) {
              console.warn('解析JSON匹配内容失败, 尝试其他方法:', e);
              throw new Error('JSON解析失败');
            }
          } else {
            // 尝试直接将整个内容作为JSON解析
            try {
              const fullResponse = JSON.parse(content);
              if (Array.isArray(fullResponse)) {
                questions = fullResponse;
              } else if (fullResponse.questions && Array.isArray(fullResponse.questions)) {
                questions = fullResponse.questions;
              } else {
                throw new Error('无法识别的JSON结构');
              }
            } catch (e) {
              console.warn('尝试直接解析为JSON失败:', e);
              throw new Error('无法从AI响应中提取JSON数据');
            }
          }
        }
      } catch (jsonError) {
        console.error('JSON解析处理中出现错误:', jsonError);
        console.log('应用默认生成逻辑');
        // 如果JSON解析出错，回退到生成通用题目
        return this.generateSampleQuestions();
      }
      
      // 验证问题是否为空
      if (!questions || questions.length === 0) {
        console.warn('未找到有效题目数据, 使用本地生成');
        return this.generateSampleQuestions();
      }
      
      // 验证和处理题目
      const processedQuestions = questions.map((question, index) => {
        // 确保每个题目都有唯一ID
        if (!question.id) {
          question.id = `q-${Date.now()}-${index}`;
        }
        
        // 确保题目类型正确
        if (!['single', 'multiple', 'tf', 'short'].includes(question.type)) {
          // 根据选项数量判断题目类型
          if (question.options && question.options.length > 0) {
            question.type = 'single'; // 默认为单选题
          } else {
            question.type = 'short'; // 默认为简答题
          }
        }
        
        // 确保选项格式正确
        if (['single', 'multiple'].includes(question.type) && (!question.options || !Array.isArray(question.options) || question.options.length < 2)) {
          // 如果选项不足，添加默认选项
          question.options = question.options || [];
          while (question.options.length < 4) {
            question.options.push(`选项${String.fromCharCode(65 + question.options.length)}`);
          }
        }
        
        // 确保判断题有正确的选项
        if (question.type === 'tf' && (!question.options || !Array.isArray(question.options) || question.options.length !== 2)) {
          question.options = ['正确', '错误'];
        }
        
        // 简答题不需要选项
        if (question.type === 'short') {
          question.options = [];
        }
        
        // 确保有答案
        if (!question.answer) {
          if (question.type === 'single') {
            question.answer = 'A. 选项A';
          } else if (question.type === 'multiple') {
            question.answer = 'A, B. 选项A和选项B';
          } else if (question.type === 'tf') {
            question.answer = 'A. 正确';
          } else {
            question.answer = '这是一个示例答案';
          }
        }
        
        return question;
      });
      
      console.log(`成功解析${processedQuestions.length}道题目`);
      
      // 记录已使用的题目内容
      const currentUsedContents = new Set();
      processedQuestions.forEach(q => currentUsedContents.add(q.content));
      this.saveUsedQuestionContents(currentUsedContents);
      
      return processedQuestions;
    } catch (error) {
      console.error('解析AI响应失败, 使用本地生成题目:', error);
      return this.generateSampleQuestions();
    }
  },
  
  // 设置答案检查事件
  setupAnswerCheckEvents() {
    document.querySelectorAll('.check-answer').forEach(button => {
      button.addEventListener('click', (e) => {
        const questionId = e.currentTarget.getAttribute('data-question-id');
        const answerElement = document.getElementById(`answer-${questionId}`);
        
        if (answerElement) {
          // 显示答案
          answerElement.style.display = 'block';
          // 禁用按钮
          e.currentTarget.disabled = true;
          e.currentTarget.innerText = '已显示答案';
          
          // 如果启用了我花装饰，显示颜文字（无论答案是否正确）
          if (settingsPage.settings.theme.flowerEnabled) {
            this.showFlowerChatBubble();
          }
          
          // 获取用户选择的答案
          const question = this.generatedQuestions.find(q => q.id === questionId);
          
          if (question && ['single', 'multiple', 'tf'].includes(question.type)) {
            const selectedOptions = Array.from(
              document.querySelectorAll(`input[name="question-${questionId}"]:checked`)
            ).map(input => input.value);
            
            // 获取正确答案的第一个字符(如 'A, B, C' 中的 'A')
            const correctAnswer = question.answer.split('.')[0].trim().split(',').map(a => a.trim());
            
            // 检查答案是否正确
            const isCorrect = this.checkAnswer(selectedOptions, correctAnswer);
            
            // 显示结果提示
            const resultElement = document.createElement('div');
            resultElement.className = `alert ${isCorrect ? 'alert-success' : 'alert-danger'} mt-2`;
            resultElement.innerText = isCorrect ? '回答正确！' : '回答不正确，请查看参考答案。';
            
            e.currentTarget.insertAdjacentElement('afterend', resultElement);
          }
        }
      });
    });
  },
  
  // 检查答案是否正确
  checkAnswer(selectedOptions, correctAnswer) {
    if (selectedOptions.length !== correctAnswer.length) {
      return false;
    }
    
    // 检查所有选项是否都匹配
    return selectedOptions.every(option => correctAnswer.includes(option));
  },
  
  // 创建题目卡片
  createQuestionCard(question, index) {
    let optionsHtml = '';
    let answerHtml = '';
    
    if (['single', 'multiple'].includes(question.type)) {
      // 为选择题添加可交互选项
      const inputType = question.type === 'single' ? 'radio' : 'checkbox';
      optionsHtml = `
        <div class="question-options">
          ${question.options.map((option, i) => {
            // 分离选项文本和解释（如果有解释）
            const parts = option.includes(' - ') ? option.split(' - ') : [option, ''];
            const optionText = parts[0].trim();
            const optionExplanation = parts[1] ? parts[1].trim() : '';
            
            return `
              <div class="form-check">
                <input class="${inputType} form-check-input" type="${inputType}" name="question-${question.id}" id="option-${question.id}-${i}" value="${String.fromCharCode(65 + i)}">
                <label class="form-check-label" for="option-${question.id}-${i}">
                  <div class="option-content">
                    <div class="option-text">${String.fromCharCode(65 + i)}. ${optionText}</div>
                    ${optionExplanation ? `<div class="option-explanation">${optionExplanation}</div>` : ''}
                  </div>
                </label>
              </div>
            `;
          }).join('')}
        </div>
        <button class="btn btn-sm btn-primary check-answer mt-2" data-question-id="${question.id}">
          检查答案
        </button>
      `;
      
      answerHtml = `
        <div class="question-answer" id="answer-${question.id}" style="display: none;">
          <h5>参考答案</h5>
          <div class="question-answer-content">
            ${question.answer}
          </div>
        </div>
      `;
    } else if (question.type === 'tf') {
      // 为判断题添加可交互选项
      optionsHtml = `
        <div class="question-options">
          <div class="form-check">
            <input class="radio form-check-input" type="radio" name="question-${question.id}" id="option-${question.id}-0" value="A">
            <label class="form-check-label" for="option-${question.id}-0">
              A. 正确
            </label>
          </div>
          <div class="form-check">
            <input class="radio form-check-input" type="radio" name="question-${question.id}" id="option-${question.id}-1" value="B">
            <label class="form-check-label" for="option-${question.id}-1">
              B. 错误
            </label>
          </div>
        </div>
        <button class="btn btn-sm btn-primary check-answer mt-2" data-question-id="${question.id}">
          检查答案
        </button>
      `;
      
      answerHtml = `
        <div class="question-answer" id="answer-${question.id}" style="display: none;">
          <h5>参考答案</h5>
          <div class="question-answer-content">
            ${question.answer}
          </div>
        </div>
      `;
    } else {
      // 为简答题添加文本输入框
      optionsHtml = `
        <div class="form-group">
          <label for="answer-input-${question.id}">请输入您的答案：</label>
          <textarea class="form-control" id="answer-input-${question.id}" rows="3"></textarea>
        </div>
        <button class="btn btn-sm btn-primary check-answer mt-2" data-question-id="${question.id}">
          查看参考答案
        </button>
      `;
      
      answerHtml = `
        <div class="question-answer" id="answer-${question.id}" style="display: none;">
          <h5>参考答案</h5>
          <div class="question-answer-content">
            ${question.answer}
          </div>
        </div>
      `;
    }
    
    return `
      <div class="question-card" data-id="${question.id}">
        <h4>题目 ${index + 1}</h4>
        <div class="question-content">
          ${question.content}
        </div>
        ${optionsHtml}
        ${answerHtml}
      </div>
    `;
  },
  
  // 生成示例题目
  generateSampleQuestions() {
    const questions = [];
    const currentUsedContents = new Set(); // 用于跟踪当前生成中已使用的题目内容
    
    console.log('开始生成题目，当前已有历史题目记录数量:', usedQuestionContents.size);
    
    // 准备题库 - 按专业领域和题型分类
    const questionBank = this.prepareQuestionBank();
    
    // 生成指定数量的题目
    for (let i = 0; i < this.questionCount; i++) {
      const questionTypes = this.selectedTypes.length > 0 ? this.selectedTypes : ['single', 'multiple', 'tf'];
      const randomType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
      
      // 获取当前题型的题库
      const typeQuestions = questionBank[randomType] || [];
      console.log(`第${i+1}题，类型:${randomType}，题库中有${typeQuestions.length}道题，已使用${usedQuestionContents.size}道题`);
      
      // 过滤掉已使用的题目（包括历史使用和当前生成中使用的）
      const availableQuestions = typeQuestions.filter(q => 
        !usedQuestionContents.has(q.content) && !currentUsedContents.has(q.content)
      );
      console.log(`可用题目数量:${availableQuestions.length}`);
      
      // 如果没有可用题目，尝试其他题型
      if (availableQuestions.length === 0) {
        // 尝试其他题型
        let foundQuestion = false;
        for (const otherType of questionTypes) {
          if (otherType !== randomType) {
            const otherTypeQuestions = questionBank[otherType] || [];
            const otherAvailableQuestions = otherTypeQuestions.filter(q => 
              !usedQuestionContents.has(q.content) && !currentUsedContents.has(q.content)
            );
            if (otherAvailableQuestions.length > 0) {
              // 使用其他题型的题目
              const randomQuestion = otherAvailableQuestions[Math.floor(Math.random() * otherAvailableQuestions.length)];
              currentUsedContents.add(randomQuestion.content);
              
              const question = {
                id: `q-${Date.now()}-${i}`,
                type: otherType,
                content: randomQuestion.content,
                options: randomQuestion.options,
                answer: randomQuestion.answer
              };
              
              questions.push(question);
              foundQuestion = true;
              break;
            }
          }
        }
        
        // 如果所有题型都没有可用题目，生成一个通用题目
        if (!foundQuestion) {
          const genericQuestion = this.generateGenericQuestion(i, randomType);
          questions.push(genericQuestion);
        }
      } else {
        // 随机选择一个可用题目
        const randomQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
        currentUsedContents.add(randomQuestion.content);
        
        const question = {
          id: `q-${Date.now()}-${i}`,
          type: randomType,
          content: randomQuestion.content,
          options: randomQuestion.options,
          answer: randomQuestion.answer
        };
        
        questions.push(question);
      }
    }
    
    // 保存当前生成的题目内容到历史记录中
    console.log('保存新生成的题目到历史记录，数量:', currentUsedContents.size);
    this.saveUsedQuestionContents(currentUsedContents);
    console.log('保存后历史题目记录总数量:', usedQuestionContents.size);
    
    return questions;
  },
  
  // 加载历史使用过的题目内容
  loadUsedQuestionContents() {
    console.log('开始加载历史题目记录...');
    
    if (isElectron()) {
      // Electron环境下，使用IPC通信加载
      if (window.electronAPI && window.electronAPI.loadUsedQuestions) {
        console.log('使用Electron API加载历史题目记录');
        window.electronAPI.loadUsedQuestions()
          .then(result => {
            if (result.success && result.questions && Array.isArray(result.questions)) {
              // 将加载的题目内容添加到集合中
              result.questions.forEach(content => {
                if (content && typeof content === 'string') {
                  usedQuestionContents.add(content);
                }
              });
              console.log(`已从Electron API加载${usedQuestionContents.size}个历史题目记录`);
            } else {
              console.log('Electron API未返回历史题目记录或加载失败');
            }
          })
          .catch(error => {
            console.error('加载历史题目记录失败:', error);
          });
      } else {
        console.log('Electron API不可用，无法加载历史题目记录');
      }
    } else {
      // 浏览器环境下，使用localStorage
      try {
        console.log('使用localStorage加载历史题目记录');
        const storedQuestions = localStorage.getItem('used_question_contents');
        if (storedQuestions) {
          const questions = JSON.parse(storedQuestions);
          if (Array.isArray(questions)) {
            questions.forEach(content => {
              if (content && typeof content === 'string') {
                usedQuestionContents.add(content);
              }
            });
          }
          console.log(`已从localStorage加载${usedQuestionContents.size}个历史题目记录`);
        } else {
          console.log('localStorage中没有历史题目记录');
        }
      } catch (error) {
        console.error('从localStorage加载历史题目记录失败:', error);
      }
    }
  },
  
  // 保存使用过的题目内容
  saveUsedQuestionContents(newContents) {
    // 将新生成的题目内容添加到全局集合中
    newContents.forEach(content => usedQuestionContents.add(content));
    console.log(`添加${newContents.size}个新题目到历史记录，当前总数:${usedQuestionContents.size}`);
    
    // 检查集合大小，如果过大则清理旧数据（保留最近的1000个题目）
    const maxQuestionHistory = 1000;
    if (usedQuestionContents.size > maxQuestionHistory) {
      const questionsArray = Array.from(usedQuestionContents);
      const newQuestionsArray = questionsArray.slice(questionsArray.length - maxQuestionHistory);
      usedQuestionContents = new Set(newQuestionsArray);
      console.log(`历史记录超过${maxQuestionHistory}条，已清理为${usedQuestionContents.size}条`);
    }
    
    if (isElectron()) {
      // Electron环境下，使用IPC通信保存
      if (window.electronAPI && window.electronAPI.saveUsedQuestions) {
        console.log('使用Electron API保存历史题目记录');
        try {
          const questionsArray = Array.from(usedQuestionContents);
          window.electronAPI.saveUsedQuestions(questionsArray)
            .then(result => {
              if (result.success) {
                console.log('历史题目记录保存成功');
              } else {
                console.error('保存历史题目记录失败:', result.error);
              }
            })
            .catch(error => {
              console.error('保存历史题目记录失败:', error);
            });
        } catch (error) {
          console.error('准备历史题目记录数据失败:', error);
        }
      } else {
        console.log('Electron API不可用，无法保存历史题目记录');
      }
    } else {
      // 浏览器环境下，使用localStorage
      try {
        console.log('使用localStorage保存历史题目记录');
        localStorage.setItem('used_question_contents', JSON.stringify(Array.from(usedQuestionContents)));
        console.log('历史题目记录已保存到localStorage');
      } catch (error) {
        console.error('保存历史题目记录到localStorage失败:', error);
      }
    }
  },
  
  // 清除历史题目记录
  clearUsedQuestionContents() {
    usedQuestionContents.clear();
    
    if (isElectron()) {
      // Electron环境下，使用IPC通信清除
      if (window.electronAPI && window.electronAPI.saveUsedQuestions) {
        window.electronAPI.saveUsedQuestions([])
          .then(result => {
            if (result.success) {
              console.log('历史题目记录已清除');
            } else {
              console.error('清除历史题目记录失败:', result.error);
            }
          })
          .catch(error => {
            console.error('清除历史题目记录失败:', error);
          });
      }
    } else {
      // 浏览器环境下，使用localStorage
      try {
        localStorage.removeItem('used_question_contents');
        console.log('历史题目记录已清除');
      } catch (error) {
        console.error('清除历史题目记录失败:', error);
      }
    }
  },
  
  // 准备题库 - 缓存版本以提高性能
  prepareQuestionBank() {
    // 如果已有缓存，直接返回
    if (this._questionBankCache) {
      return this._questionBankCache;
    }
    
    // 准备题库
    const questionBank = {
      single: [],
      multiple: [],
      tf: [],
      short: []
    };
    
    // 生成示例题库
    for (let i = 0; i < 50; i++) {
      // 单选题
      questionBank.single.push({
        content: `关于${this.fieldValue}的第${i+1}个单选题`,
        options: [
          '选项A的内容',
          '选项B的内容',
          '选项C的内容',
          '选项D的内容'
        ],
        answer: 'A. 选项A的内容'
      });
      
      // 多选题
      questionBank.multiple.push({
        content: `关于${this.fieldValue}的第${i+1}个多选题`,
        options: [
          '选项A的内容',
          '选项B的内容',
          '选项C的内容',
          '选项D的内容'
        ],
        answer: 'A, B. 选项A和选项B的内容'
      });
      
      // 判断题
      questionBank.tf.push({
        content: `${this.fieldValue}领域中的某个概念是正确的。（第${i+1}题）`,
        options: ['正确', '错误'],
        answer: 'A. 正确'
      });
      
      // 简答题
      questionBank.short.push({
        content: `请简述${this.fieldValue}领域中的某个概念。（第${i+1}题）`,
        options: [],
        answer: `这是关于${this.fieldValue}领域某个概念的详细解答，包括定义、特点和应用。`
      });
    }
    
    // 缓存题库以提高性能
    this._questionBankCache = questionBank;
    
    return questionBank;
  },
  
  // 生成通用题目
  generateGenericQuestion(index, type) {
    const question = {
      id: `q-${Date.now()}-${index}-generic`,
      type: type,
      content: '',
      options: [],
      answer: ''
    };
    
    if (type === 'single') {
      question.content = `关于${this.fieldValue}的第${index+1}个问题（单选题）`;
      question.options = [
        '选项A - 这是第一个选项的描述',
        '选项B - 这是第二个选项的描述',
        '选项C - 这是第三个选项的描述',
        '选项D - 这是第四个选项的描述'
      ];
      question.answer = 'B. 选项B<br><br><strong>解析：</strong>这是一个通用的解析说明，实际应用中应该根据具体问题提供详细的解析。';
    } else if (type === 'multiple') {
      question.content = `关于${this.fieldValue}的第${index+1}个问题（多选题）`;
      question.options = [
        '选项A - 这是第一个选项的描述',
        '选项B - 这是第二个选项的描述',
        '选项C - 这是第三个选项的描述',
        '选项D - 这是第四个选项的描述'
      ];
      question.answer = 'A, C. 选项A和选项C<br><br><strong>解析：</strong>这是一个通用的解析说明，实际应用中应该根据具体问题提供详细的解析。';
    } else if (type === 'tf') {
      question.content = `${this.fieldValue}领域的某个概念是正确的。（判断对错）`;
      question.answer = 'A. 正确。<br><br><strong>解析：</strong>这是一个通用的解析说明，实际应用中应该根据具体问题提供详细的解析。';
    } else {
      question.content = `请简述${this.fieldValue}领域的某个重要概念。（简答题）`;
      question.answer = `这是关于${this.fieldValue}领域某个概念的通用答案。在实际应用中，应该提供具体而详细的解答，包括定义、特点、应用等方面的内容。`;
    }
    
    return question;
  },
  
  // 保存题目
  saveQuestions() {
    if (!this.generatedQuestions) return;
    
    // 创建历史记录项
    const historyItem = {
      id: `history-${Date.now()}`,
      title: `${this.fieldValue} - ${this.questionCount}道题目`,
      date: new Date().toLocaleString(),
      field: this.fieldValue,
      count: this.questionCount,
      difficulty: this.difficulty,
      types: this.selectedTypes,
      questions: this.generatedQuestions
    };
    
    // 根据运行环境使用不同的保存方法
    if (isElectron()) {
      // Electron环境下，使用IPC通信保存到本地文件
      window.electronAPI.saveHistory(historyItem)
        .then(result => {
          if (result.success) {
            this.showSaveSuccessMessage();
          } else {
            alert(`保存失败: ${result.error || '未知错误'}`);
          }
        })
        .catch(error => {
          console.error('保存历史记录失败:', error);
          alert('保存历史记录失败，请重试');
        });
    } else {
      // 浏览器环境下，使用localStorage
      let history = localStorage.getItem('question_history');
      
      if (history) {
        history = JSON.parse(history);
        history.unshift(historyItem);
      } else {
        history = [historyItem];
      }
      
      localStorage.setItem('question_history', JSON.stringify(history));
      this.showSaveSuccessMessage();
    }
  },
  
  // 显示保存成功提示
  showSaveSuccessMessage() {
    // 创建提示元素
    const message = document.createElement('div');
    message.className = 'save-success-message';
    message.innerHTML = '<i class="bi bi-check-circle"></i> 题目已成功保存到历史记录！';
    
    // 添加到容器
    const container = document.getElementById('questions-container');
    if (container) {
      // 如果容器有定位样式，确保消息框定位正确
      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      
      container.appendChild(message);
      
      // 3秒后自动移除
      setTimeout(() => {
        message.remove();
      }, 3000);
    }
  },
  
  // 检测专业领域是否合适
  checkField(field) {
    return new Promise((resolve, reject) => {
      // 先进行简单的本地检测
      if (field.length < 2) {
        resolve({ suitable: false, message: '专业领域输入过短，请输入更具体的内容' });
        return;
      }
      
      // 包含敏感或不适合的词语
      const sensitiveWords = ['色情', '暴力', '赌博', '毒品', '黄赌毒', '政治', '敏感'];
      for (const word of sensitiveWords) {
        if (field.includes(word)) {
          resolve({ suitable: false, message: '专业领域包含不适合的内容，请重新输入' });
          return;
        }
      }
      
      // 使用AI API进行检测
      if (isElectron()) {
        // 使用Electron环境下的IPC通信
        const data = { field: field, apiKey: TONGYI_API_KEY };
        
        // 尝试通过IPC调用后端AI检测
        try {
          window.electronAPI.checkFieldWithAI(data)
            .then(result => {
              if (result && result.success) {
                resolve({ suitable: result.suitable, message: result.message });
              } else {
                // 如果后端调用失败，使用模拟检测结果
                this.simulateAICheck(field).then(resolve).catch(reject);
              }
            })
            .catch(error => {
              console.error('AI检测专业领域失败:', error);
              // 如果API调用失败，使用模拟检测结果
              this.simulateAICheck(field).then(resolve).catch(reject);
            });
        } catch (error) {
          console.error('调用AI检测接口失败:', error);
          this.simulateAICheck(field).then(resolve).catch(reject);
        }
      } else {
        // 浏览器环境下，使用模拟检测
        this.simulateAICheck(field).then(resolve).catch(reject);
      }
    });
  },
  
  // 模拟AI检测
  simulateAICheck(field) {
    return new Promise((resolve) => {
      console.log('模拟AI检测专业领域:', field);
      
      // 模拟API调用延迟
      setTimeout(() => {
        // 检查是否为正常专业领域
        const validFields = [
          '计算机', '软件', '编程', '医学', '医疗', '护理', '生物', '物理', 
          '化学', '数学', '历史', '地理', '文学', '经济学', '金融', '会计', 
          '法律', '心理学', '社会学', '工程', '建筑', '设计', '教育', '语言', 
          '哲学', '艺术', '音乐', '体育', '农业', '环境', '能源'
        ];
        
        let isValid = false;
        for (const validField of validFields) {
          if (field.includes(validField)) {
            isValid = true;
            break;
          }
        }
        
        if (isValid) {
          resolve({ suitable: true, message: '专业领域有效' });
        } else {
          resolve({ 
            suitable: false, 
            message: '无法识别的专业领域，请输入如：计算机科学、医学、物理学等正规学科'
          });
        }
      }, 1000);
    });
  },
  
  // 检查是否使用自定义API密钥
  checkIfUsingCustomKey() {
    // 获取当前设置
    if (!settingsPage.settings || !settingsPage.settings.api) {
      return false;
    }
    
    const apiSettings = settingsPage.settings.api;
    
    // 检查是否有有效的自定义API密钥
    return apiSettings.provider === 'custom' && 
           apiSettings.key && 
           apiSettings.key.trim() !== '' && 
           apiSettings.key !== 'YOUR_API_KEY';
  },
  
  // 检查每日生成次数限制
  checkDailyGenerationLimit() {
    // 检查日期是否变更，如果是新的一天，重置计数
    const today = new Date().toDateString();
    if (lastGenerationDate !== today) {
      dailyGenerationCount = 0;
      lastGenerationDate = today;
      this.saveDailyGenerationData();
      return true;
    }
    
    // 检查是否达到每日限制
    return dailyGenerationCount < MAX_DAILY_GENERATIONS;
  },
  
  // 增加每日生成次数计数
  incrementDailyGenerationCount() {
    const today = new Date().toDateString();
    if (lastGenerationDate !== today) {
      dailyGenerationCount = 1;
      lastGenerationDate = today;
    } else {
      dailyGenerationCount++;
    }
    
    this.saveDailyGenerationData();
  },
  
  // 保存每日生成数据到本地存储
  saveDailyGenerationData() {
    const data = {
      count: dailyGenerationCount,
      date: lastGenerationDate
    };
    
    if (isElectron()) {
      // Electron环境下，使用IPC通信保存
      if (window.electronAPI && window.electronAPI.saveGenerationCount) {
        window.electronAPI.saveGenerationCount(data);
      }
    } else {
      // 浏览器环境下，使用localStorage
      localStorage.setItem('daily_generation_data', JSON.stringify(data));
    }
  },
  
  // 加载每日生成数据
  loadDailyGenerationData() {
    if (isElectron()) {
      // Electron环境下，使用IPC通信加载
      if (window.electronAPI && window.electronAPI.loadGenerationCount) {
        window.electronAPI.loadGenerationCount()
          .then(result => {
            if (result.success && result.data) {
              dailyGenerationCount = result.data.count || 0;
              lastGenerationDate = result.data.date || null;
            }
          })
          .catch(error => {
            console.error('加载生成次数数据失败:', error);
          });
      }
    } else {
      // 浏览器环境下，使用localStorage
      const data = localStorage.getItem('daily_generation_data');
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          dailyGenerationCount = parsedData.count || 0;
          lastGenerationDate = parsedData.date || null;
        } catch (error) {
          console.error('解析生成次数数据失败:', error);
        }
      }
    }
  },
  
  // 获取难度文本
  getDifficultyText(difficulty) {
    switch (difficulty) {
      case 'level1': return '初窥门径';
      case 'level2': return '问道寻幽';
      case 'level3': return '破茧凌虚';
      case 'level4': return '踏月摘星';
      case 'level5': return '弈天问道';
      case 'level6': return '无相劫海';
      case 'level7': return '太一归墟';
      // 保留旧版本的兼容性
      case 'easy': return '初窥门径';
      case 'medium': return '踏月摘星';
      case 'hard': return '太一归墟';
      default: return '踏月摘星';
    }
  },
  
  // 显示花朵对话气泡
  showFlowerChatBubble() {
    const chatBubble = document.getElementById('flower-chat-bubble');
    if (!chatBubble) return;
    
    // 随机颜文字列表
    const kaomojis = [
      '(๑•̀ㅂ•́)و✧',
      '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
      '(≧▽≦)',
      '(づ￣ ³￣)づ',
      'ヾ(≧▽≦*)o',
      '(。・ω・。)',
      '(*¯︶¯*)',
      '(◕‿◕✿)',
      '(つ≧▽≦)つ',
      '(〜￣▽￣)〜',
      'ヽ(°〇°)ﾉ',
      '(≧◡≦)',
      '(´｡• ᵕ •｡`)',
      '(*≧ω≦*)',
      '(☆▽☆)'
    ];
    
    // 随机颜色列表
    const colors = [
      '#FFD6E7', // 粉色
      '#FFEFB8', // 浅黄色
      '#D7F9F1', // 浅绿色
      '#D6EAFF', // 浅蓝色
      '#E5D9FF', // 浅紫色
      '#FFE0CC', // 浅橙色
      '#DCFFE4', // 薄荷绿
      '#F0F0F0', // 浅灰色
      '#FFF1E6', // 浅桃色
      '#E2F5FF'  // 天蓝色
    ];
    
    // 随机选择一个颜文字
    const randomKaomoji = kaomojis[Math.floor(Math.random() * kaomojis.length)];
    
    // 随机选择一个背景颜色
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // 设置内容和样式
    chatBubble.textContent = randomKaomoji;
    chatBubble.style.backgroundColor = randomColor;
    
    // 设置小三角形的颜色与气泡背景一致
    const afterStyle = `
      .flower-chat-bubble:after {
        border-color: ${randomColor} transparent transparent;
      }
    `;
    
    // 创建或更新样式标签
    let styleTag = document.getElementById('bubble-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'bubble-style';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = afterStyle;
    
    // 显示气泡
    chatBubble.classList.add('show');
    
    // 3秒后自动隐藏（通过CSS动画实现）
    setTimeout(() => {
      chatBubble.classList.remove('show');
    }, 3000);
  },
};

// 历史记录页面
const historyPage = {
  historyData: [],
  selectedItems: [],
  
  // 初始化页面
  init() {
    console.log('初始化历史记录页面');
    
    // 检查必要的元素是否存在
    const historyList = document.getElementById('history-list');
    if (!historyList) {
      console.error('找不到历史记录列表元素(#history-list)');
      
      // 尝试创建历史记录列表元素
      const pageContent = document.querySelector('#page-content');
      if (pageContent) {
        console.log('尝试创建历史记录列表元素');
        const historyContainer = document.createElement('div');
        historyContainer.className = 'history-container';
        historyContainer.innerHTML = `
          <div class="history-controls">
            <button class="btn btn-primary" id="refresh-history">
              <i class="bi bi-arrow-clockwise"></i> 刷新
            </button>
            <button class="btn btn-success" id="export-selected" disabled>
              <i class="bi bi-download"></i> 导出选中
            </button>
            <button class="btn btn-danger" id="delete-selected" disabled>
              <i class="bi bi-trash"></i> 删除选中
            </button>
          </div>
          <div id="history-list" class="history-list"></div>
        `;
        pageContent.appendChild(historyContainer);
        console.log('历史记录列表元素已创建');
      } else {
        console.error('找不到页面内容元素(#page-content)，无法创建历史记录列表');
        return;
      }
    }
    
    // 加载历史记录并设置事件监听
    this.loadHistory();
    this.setupEventListeners();
  },
  
  // 获取难度文本描述
  getDifficultyText(difficulty) {
    const difficultyMap = {
      'level1': '初窥门径',
      'level2': '问道寻幽',
      'level3': '破茧凌虚',
      'level4': '踏月摘星',
      'level5': '弈天问道',
      'level6': '无相劫海',
      'level7': '太一归墟'
    };
    
    return difficultyMap[difficulty] || '未知难度';
  },
  
  // 加载历史记录
  loadHistory() {
    console.log('开始加载历史记录');
    
    const historyList = document.getElementById('history-list');
    if (!historyList) {
      console.error('找不到历史记录列表元素(#history-list)');
      
      // 尝试延迟重试一次
      setTimeout(() => {
        const retryHistoryList = document.getElementById('history-list');
        if (retryHistoryList) {
          console.log('延迟后找到历史记录列表元素，继续加载');
          this.loadHistoryContent(retryHistoryList);
        } else {
          console.error('延迟后仍找不到历史记录列表元素，无法加载历史记录');
          
          // 尝试显示错误信息在页面内容区域
          const pageContent = document.querySelector('#page-content');
          if (pageContent) {
            pageContent.innerHTML = `
              <div class="alert alert-danger">
                <h5><i class="bi bi-exclamation-triangle"></i> 加载历史记录失败</h5>
                <p>找不到历史记录列表元素，请刷新页面重试</p>
                <button class="btn btn-primary" onclick="location.reload()">刷新页面</button>
              </div>
            `;
          }
        }
      }, 500);
      return;
    }
    
    // 正常加载历史记录
    this.loadHistoryContent(historyList);
  },
  
  // 加载历史记录内容
  loadHistoryContent(historyList) {
    // 显示加载状态
    historyList.innerHTML = `
      <div class="loading">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">正在加载历史记录...</span>
        </div>
        <p>正在加载历史记录，请稍候...</p>
      </div>
    `;
    
    // 清空选中项
    this.selectedItems = [];
    
    // 根据运行环境使用不同的加载方法
    if (isElectron()) {
      // Electron环境，使用IPC通信获取历史记录
      window.electronAPI.loadHistory()
        .then(result => {
          console.log('加载历史记录结果:', result);
          
          if (result.success) {
            this.historyData = result.history || [];
            this.renderHistoryList();
          } else {
            console.error('加载历史记录失败:', result.error);
            historyList.innerHTML = `
              <div class="alert alert-danger">
                <h5><i class="bi bi-exclamation-triangle"></i> 加载历史记录失败</h5>
                <p>${result.error || '未知错误'}</p>
                <button class="btn btn-primary" id="retry-load-history">重试</button>
              </div>
            `;
            
            // 添加重试按钮事件监听
            const retryButton = document.getElementById('retry-load-history');
            if (retryButton) {
              retryButton.addEventListener('click', () => {
                this.loadHistory();
              });
            }
          }
        })
        .catch(error => {
          console.error('加载历史记录失败:', error);
          historyList.innerHTML = `
            <div class="alert alert-danger">
              <h5><i class="bi bi-exclamation-triangle"></i> 加载历史记录失败</h5>
              <p>${error.message || '未知错误'}</p>
              <button class="btn btn-primary" id="retry-load-history">重试</button>
            </div>
          `;
          
          // 添加重试按钮事件监听
          const retryButton = document.getElementById('retry-load-history');
          if (retryButton) {
            retryButton.addEventListener('click', () => {
              this.loadHistory();
            });
          }
        });
    } else {
      // 浏览器环境，使用localStorage
      const storedHistory = localStorage.getItem('question_history');
      
      if (storedHistory) {
        try {
          this.historyData = JSON.parse(storedHistory);
        } catch (error) {
          console.error('解析历史记录失败:', error);
          this.historyData = [];
          
          // 显示错误信息
          historyList.innerHTML = `
            <div class="alert alert-danger">
              <h5><i class="bi bi-exclamation-triangle"></i> 解析历史记录失败</h5>
              <p>${error.message || '未知错误'}</p>
            </div>
          `;
          return;
        }
      } else {
        this.historyData = [];
      }
      
      this.renderHistoryList();
    }
  },
  
  // 渲染历史记录列表
  renderHistoryList() {
    const historyList = document.getElementById('history-list');
    if (!historyList) {
      console.error('找不到历史记录列表元素(#history-list)');
      return;
    }
    
    // 创建历史记录列表
    if (this.historyData.length > 0) {
      let historyHtml = '';
      
      this.historyData.forEach(item => {
        historyHtml += this.createHistoryItem(item);
      });
      
      historyList.innerHTML = historyHtml;
      
      // 添加选择事件
      document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            const checkbox = item.querySelector('input[type="checkbox"]');
            if (checkbox) {
              checkbox.checked = !checkbox.checked;
              this.toggleSelection(item.getAttribute('data-id'), checkbox.checked);
            }
          }
        });
        
        // 复选框事件
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.toggleSelection(item.getAttribute('data-id'), e.target.checked);
          });
        }
      });
    } else {
      historyList.innerHTML = '<div class="text-center p-4"><p class="text-muted">暂无历史记录</p></div>';
    }
    
    // 更新按钮状态
    const exportButton = document.getElementById('export-selected');
    const deleteButton = document.getElementById('delete-selected');
    if (exportButton) exportButton.disabled = this.selectedItems.length === 0;
    if (deleteButton) deleteButton.disabled = this.selectedItems.length === 0;
  },
  
  // 创建历史记录项
  createHistoryItem(item) {
    return `
      <div class="history-item" data-id="${item.id}">
        <div class="form-check">
          <input type="checkbox" class="form-check-input" id="check-${item.id}">
          <label class="form-check-label" for="check-${item.id}">
            <div class="history-item-header">
              <div class="history-item-title">${item.title}</div>
              <div class="history-item-date">${item.date}</div>
            </div>
            <div class="history-item-meta">
              <span>专业领域: ${item.field}</span>
              <span>难度: ${this.getDifficultyText(item.difficulty)}</span>
              <span>题目数量: ${item.count}</span>
            </div>
          </label>
        </div>
      </div>
    `;
  },
  
  // 设置事件监听
  setupEventListeners() {
    // 刷新按钮
    const refreshButton = document.getElementById('refresh-history');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.loadHistory();
      });
    }
    
    // 导出按钮
    const exportButton = document.getElementById('export-selected');
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        this.exportSelected();
      });
    }
    
    // 删除按钮
    const deleteButton = document.getElementById('delete-selected');
    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        this.deleteSelected();
      });
    }
  },
  
  // 切换选择
  toggleSelection(id, selected) {
    if (selected) {
      if (!this.selectedItems.includes(id)) {
        this.selectedItems.push(id);
        
        // 高亮选中项
        const item = document.querySelector(`.history-item[data-id="${id}"]`);
        if (item) item.classList.add('selected');
      }
    } else {
      this.selectedItems = this.selectedItems.filter(itemId => itemId !== id);
      
      // 移除高亮
      const item = document.querySelector(`.history-item[data-id="${id}"]`);
      if (item) item.classList.remove('selected');
    }
    
    // 更新导出按钮状态
    const exportButton = document.getElementById('export-selected');
    if (exportButton) {
      exportButton.disabled = this.selectedItems.length === 0;
    }
    
    // 更新删除按钮状态
    const deleteButton = document.getElementById('delete-selected');
    if (deleteButton) {
      deleteButton.disabled = this.selectedItems.length === 0;
    }
  },
  
  // 导出选中的历史记录
  exportSelected() {
    if (this.selectedItems.length === 0) return;
    
    // 过滤选中的历史记录
    const selectedData = this.historyData.filter(item => this.selectedItems.includes(item.id));
    
    // 创建导出数据
    const exportData = {
      exportDate: new Date().toLocaleString(),
      items: selectedData
    };
    
    if (isElectron()) {
      // Electron环境下，使用保存对话框
      window.electronAPI.exportHistory(selectedData)
        .then(result => {
          if (result.success) {
            alert(`历史记录已成功导出到: ${result.filePath}`);
          } else {
            alert(`导出失败: ${result.error || '未知错误'}`);
          }
        })
        .catch(error => {
          console.error('导出历史记录失败:', error);
          alert('导出历史记录失败，请重试');
        });
    } else {
      // 浏览器环境下，创建下载链接
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `woling-export-${Date.now()}.json`;
      document.body.appendChild(link);
      
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  },
  
  // 删除选中的历史记录
  deleteSelected() {
    if (this.selectedItems.length === 0) return;
    
    // 使用自定义确认对话框，而不是系统confirm
    pageManager.showCustomConfirm(
      '删除确认',
      '确定要删除选中的历史记录吗？',
      () => {
        // 用户确认删除
        if (isElectron()) {
          // Electron环境下，使用IPC通信删除
          window.electronAPI.deleteHistory(this.selectedItems)
            .then(result => {
              if (result.success) {
                // 从本地数据中移除已删除的项
                this.historyData = this.historyData.filter(item => !this.selectedItems.includes(item.id));
                
                // 更新UI
                this.renderHistoryList();
                
                // 清除选中项
                this.selectedItems = [];
                
                // 禁用导出和删除按钮
                const exportButton = document.getElementById('export-selected');
                const deleteButton = document.getElementById('delete-selected');
                if (exportButton) exportButton.disabled = true;
                if (deleteButton) deleteButton.disabled = true;
                
                // 显示成功消息
                const historyList = document.getElementById('history-list');
                if (historyList) {
                  const successAlert = document.createElement('div');
                  successAlert.className = 'alert alert-success';
                  successAlert.innerHTML = `<i class="bi bi-check-circle"></i> 已成功删除${result.deletedCount || this.selectedItems.length}条历史记录`;
                  historyList.insertBefore(successAlert, historyList.firstChild);
                  
                  // 3秒后自动隐藏成功消息
                  setTimeout(() => {
                    successAlert.remove();
                  }, 3000);
                }
              } else {
                // 显示错误消息
                pageManager.showCustomAlert('删除失败', result.error || '未知错误', null, '确定', 'btn-danger');
              }
            })
            .catch(error => {
              console.error('删除历史记录失败:', error);
              pageManager.showCustomAlert('错误', '删除历史记录失败，请重试', null, '确定', 'btn-danger');
            });
        } else {
          // 浏览器环境下，使用localStorage
          // 过滤掉选中的历史记录
          this.historyData = this.historyData.filter(item => !this.selectedItems.includes(item.id));
          
          // 保存到localStorage
          localStorage.setItem('question_history', JSON.stringify(this.historyData));
          
          // 更新UI
          this.renderHistoryList();
          
          // 清除选中项
          this.selectedItems = [];
        }
      }
    );
  }
};

// 设置页面
const settingsPage = {
  // 默认设置
  settings: {
    theme: {
      type: 'light',
      bgColor: '#f8f9fa',
      bgImageUrl: '',
      bgImageData: null,
      flowerEnabled: false
    },
    api: {
      provider: 'tongyi',
      key: TONGYI_API_KEY,
      endpoint: 'https://api.tongyi.aliyun.com/v1/chat/completions',
      model: 'qwen-max'
    },
    questionBank: {
      useCustom: true,
      banks: []
    }
  },
  
  // 初始化设置页面
  init() {
    this.loadSettings();
    this.setupEventListeners();
    this.loadQuestionBanks();
  },
  
  // 加载设置
  loadSettings() {
    // 从本地存储加载设置
    if (isElectron()) {
      // Electron环境下，使用IPC通信获取设置
      window.electronAPI.loadSettings()
        .then(result => {
          if (result.success && result.settings) {
            this.settings = this.mergeSettings(this.settings, result.settings);
            this.updateSettingsUI();
          }
        })
        .catch(error => {
          console.error('加载设置失败:', error);
          // 使用默认设置
          this.updateSettingsUI();
        });
    } else {
      // 浏览器环境下，使用localStorage
      const data = localStorage.getItem('app_settings');
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          this.settings = this.mergeSettings(this.settings, parsedData);
        } catch (error) {
          console.error('解析存储的设置失败:', error);
        }
      }
      
      this.updateSettingsUI();
    }
    
    // 应用主题设置
    this.applyTheme();
  },
  
  // 合并设置
  mergeSettings(defaultSettings, newSettings) {
    // 深度合并两个对象，确保不缺失任何属性
    const merged = JSON.parse(JSON.stringify(defaultSettings));
    
    // 合并主题设置
    if (newSettings.theme) {
      merged.theme = {...merged.theme, ...newSettings.theme};
    }
    
    // 合并API设置
    if (newSettings.api) {
      merged.api = {...merged.api, ...newSettings.api};
    }
    
    return merged;
  },
  
  // 更新UI以反映当前设置
  updateSettingsUI() {
    // 设置主题下拉菜单
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = this.settings.theme.type;
      this.toggleCustomThemeOptions(this.settings.theme.type === 'custom');
    }
    
    // 设置背景颜色
    const bgColorInput = document.getElementById('bg-color');
    if (bgColorInput && this.settings.theme.bgColor) {
      bgColorInput.value = this.settings.theme.bgColor;
    }
    
    // 设置背景图片URL
    const bgImageUrlInput = document.getElementById('bg-image-url');
    if (bgImageUrlInput && this.settings.theme.bgImageUrl) {
      bgImageUrlInput.value = this.settings.theme.bgImageUrl;
    }
    
    // 设置我花选项
    const flowerOption = document.getElementById('flower-option');
    if (flowerOption) {
      flowerOption.checked = this.settings.theme.flowerEnabled || false;
    }
    
    // 更新背景预览
    this.updateBackgroundPreview();
    
    // 设置自定义题库选项
    const useCustomBank = document.getElementById('use-custom-bank');
    if (useCustomBank) {
      useCustomBank.checked = this.settings.questionBank && this.settings.questionBank.useCustom;
    }
    
    // 显示题库列表
    this.renderQuestionBankList();
    
    // 设置API提供商
    const apiProviderSelect = document.getElementById('ai-provider');
    if (apiProviderSelect) {
      apiProviderSelect.value = this.settings.api.provider;
      this.toggleCustomApiOptions(this.settings.api.provider === 'custom');
    }
    
    // 设置API密钥
    const apiKeyInput = document.getElementById('api-key');
    if (apiKeyInput && this.settings.api.key) {
      apiKeyInput.value = this.settings.api.key;
    }
    
    // 设置API端点
    const apiEndpointInput = document.getElementById('api-endpoint');
    if (apiEndpointInput && this.settings.api.endpoint) {
      apiEndpointInput.value = this.settings.api.endpoint;
    }
    
    // 设置API模型
    const apiModelInput = document.getElementById('api-model');
    if (apiModelInput && this.settings.api.model) {
      apiModelInput.value = this.settings.api.model;
    }
  },
  
  // 设置事件监听
  setupEventListeners() {
    // 监听主题选择变化
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        this.toggleCustomThemeOptions(selectedTheme === 'custom');
        
        // 更新设置
        this.settings.theme.type = selectedTheme;
        
        // 应用主题预览
        this.updateBackgroundPreview();
      });
    }
    
    // 监听我花选项变化
    const flowerOption = document.getElementById('flower-option');
    if (flowerOption) {
      flowerOption.addEventListener('change', (e) => {
        this.settings.theme.flowerEnabled = e.target.checked;
        
        // 实时预览我花装饰
        this.applyFlowerDecoration();
      });
    }
    
    // 监听背景颜色变化
    const bgColorInput = document.getElementById('bg-color');
    if (bgColorInput) {
      bgColorInput.addEventListener('input', (e) => {
        this.settings.theme.bgColor = e.target.value;
        this.updateBackgroundPreview();
      });
    }
    
    // 监听背景图片URL变化
    const bgImageUrlInput = document.getElementById('bg-image-url');
    if (bgImageUrlInput) {
      bgImageUrlInput.addEventListener('change', (e) => {
        this.settings.theme.bgImageUrl = e.target.value;
        this.updateBackgroundPreview();
      });
    }
    
    // 监听背景图片上传
    const bgImageUpload = document.getElementById('bg-image-upload');
    if (bgImageUpload) {
      bgImageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            this.settings.theme.bgImageData = event.target.result;
            this.updateBackgroundPreview();
          };
          reader.readAsDataURL(file);
        }
      });
    }
    
    // 监听AI提供商变化
    const apiProviderSelect = document.getElementById('ai-provider');
    if (apiProviderSelect) {
      apiProviderSelect.addEventListener('change', (e) => {
        const selectedProvider = e.target.value;
        this.toggleCustomApiOptions(selectedProvider === 'custom');
        
        // 更新设置
        this.settings.api.provider = selectedProvider;
      });
    }
    
    // 监听API密钥变化
    const apiKeyInput = document.getElementById('api-key');
    if (apiKeyInput) {
      apiKeyInput.addEventListener('change', (e) => {
        this.settings.api.key = e.target.value;
      });
    }
    
    // 监听API端点变化
    const apiEndpointInput = document.getElementById('api-endpoint');
    if (apiEndpointInput) {
      apiEndpointInput.addEventListener('change', (e) => {
        this.settings.api.endpoint = e.target.value;
      });
    }
    
    // 监听API模型变化
    const apiModelInput = document.getElementById('api-model');
    if (apiModelInput) {
      apiModelInput.addEventListener('change', (e) => {
        this.settings.api.model = e.target.value;
      });
    }
    
    // 监听密码显示切换
    const togglePasswordBtn = document.querySelector('.toggle-password');
    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener('click', () => {
        const apiKeyInput = document.getElementById('api-key');
        if (apiKeyInput) {
          const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
          apiKeyInput.setAttribute('type', type);
          
          // 切换图标
          const icon = togglePasswordBtn.querySelector('i');
          if (icon) {
            icon.className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
          }
        }
      });
    }
    
    // 拖放区域事件处理
    const dropzone = document.getElementById('bank-dropzone');
    if (dropzone) {
      // 阻止浏览器默认拖放行为
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
      });
      
      // 高亮拖放区域
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
          dropzone.classList.add('dragover');
        }, false);
      });
      
      // 移除高亮
      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
          dropzone.classList.remove('dragover');
        }, false);
      });
      
      // 处理文件拖放
      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
          this.handleBankFileUpload(files[0]);
        }
      }, false);
      
      // 点击上传
      dropzone.addEventListener('click', () => {
        const fileInput = document.getElementById('bank-upload');
        if (fileInput) {
          fileInput.click();
        }
      });
      
      // 文件选择处理
      const bankUpload = document.getElementById('bank-upload');
      if (bankUpload) {
        bankUpload.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            this.handleBankFileUpload(file);
          }
        });
      }
      
      // 辅助函数：阻止默认行为
      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    
    // 监听自定义题库开关
    const useCustomBank = document.getElementById('use-custom-bank');
    if (useCustomBank) {
      useCustomBank.addEventListener('change', (e) => {
        this.settings.questionBank.useCustom = e.target.checked;
      });
    }
    
    // 监听题库格式说明链接
    const showBankFormat = document.getElementById('show-bank-format');
    if (showBankFormat) {
      showBankFormat.addEventListener('click', (e) => {
        e.preventDefault();
        this.showBankFormatGuide();
      });
    }
    
    // 监听示例题库下载链接
    const downloadSample = document.getElementById('download-sample');
    if (downloadSample) {
      downloadSample.addEventListener('click', (e) => {
        e.preventDefault();
        this.showSampleBankOptions();
      });
    }
    
    // 监听保存设置按钮
    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        this.saveSettings();
        
        // 显示成功消息
        const settingsContainer = document.querySelector('.settings-container');
        if (settingsContainer) {
          const successMessage = document.createElement('div');
          successMessage.className = 'alert alert-success mt-3';
          successMessage.innerHTML = '<i class="bi bi-check-circle"></i> 设置已保存';
          settingsContainer.appendChild(successMessage);
          
          // 3秒后移除消息
          setTimeout(() => {
            successMessage.remove();
          }, 3000);
        }
      });
    }
    
    // 监听重置设置按钮
    const resetSettingsBtn = document.getElementById('reset-settings');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', () => {
        pageManager.showCustomConfirm(
          '重置设置',
          '确定要恢复默认设置吗？这将丢失您的所有自定义设置。',
          () => {
            this.resetSettings();
          }
        );
      });
    }
  },
  
  // 切换自定义主题选项显示
  toggleCustomThemeOptions(show) {
    const customThemeOptions = document.getElementById('custom-theme-options');
    if (customThemeOptions) {
      customThemeOptions.style.display = show ? 'block' : 'none';
    }
  },
  
  // 切换自定义API选项显示
  toggleCustomApiOptions(show) {
    const customApiOptions = document.getElementById('custom-api-options');
    if (customApiOptions) {
      customApiOptions.style.display = show ? 'block' : 'none';
    }
  },
  
  // 更新背景预览
  updateBackgroundPreview() {
    const preview = document.getElementById('bg-preview');
    if (!preview) return;
    
    // 重置背景
    preview.style.backgroundColor = '';
    preview.style.backgroundImage = '';
    
    if (this.settings.theme.type === 'custom') {
      // 设置背景颜色
      preview.style.backgroundColor = this.settings.theme.bgColor;
      
      // 设置背景图片
      if (this.settings.theme.bgImageData) {
        preview.style.backgroundImage = `url(${this.settings.theme.bgImageData})`;
      } else if (this.settings.theme.bgImageUrl) {
        preview.style.backgroundImage = `url(${this.settings.theme.bgImageUrl})`;
      }
    } else {
      // 设置预定义主题的预览
      switch (this.settings.theme.type) {
        case 'dark':
          preview.style.backgroundColor = '#343a40';
          preview.style.color = '#fff';
          break;
        case 'light':
          preview.style.backgroundColor = '#f8f9fa';
          break;
        default: // 默认主题
          preview.style.backgroundColor = '#fff';
          break;
      }
    }
  },
  
  // 应用当前主题设置
  applyTheme() {
    const root = document.documentElement;
    const body = document.body;
    
    // 重置
    body.className = '';
    body.style.backgroundColor = '';
    body.style.backgroundImage = '';
    
    // 应用主题
    if (this.settings.theme.type === 'custom') {
      // 自定义主题
      body.style.backgroundColor = this.settings.theme.bgColor;
      
      if (this.settings.theme.bgImageData) {
        body.style.backgroundImage = `url(${this.settings.theme.bgImageData})`;
      } else if (this.settings.theme.bgImageUrl) {
        body.style.backgroundImage = `url(${this.settings.theme.bgImageUrl})`;
      }
    } else {
      // 预定义主题
      body.classList.add(`theme-${this.settings.theme.type}`);
    }
    
    // 应用我花装饰
    this.applyFlowerDecoration();
    
    // 确保输入框可交互
    setTimeout(() => {
      // 如果当前在生成题目页面，确保输入框可交互
      if (pageManager.currentPage === 'generate') {
        generatePage.ensureFieldInputInteractive();
      }
    }, 300);
  },
  
  // 应用我花装饰
  applyFlowerDecoration() {
    // 移除现有的我花装饰
    const existingFlower = document.querySelector('.flower-decoration');
    if (existingFlower) {
      existingFlower.remove();
    }
    
    // 移除现有的聊天气泡
    const existingBubble = document.querySelector('.flower-chat-bubble');
    if (existingBubble) {
      existingBubble.remove();
    }
    
    // 如果开启了我花选项，添加装饰
    if (this.settings.theme.flowerEnabled) {
      // 创建图片元素
      const flowerImg = document.createElement('img');
      
      // 根据主题选择不同的图片
      if (this.settings.theme.type === 'dark') {
        flowerImg.src = '29.png'; // 深色主题使用29.png
      } else if (this.settings.theme.type === 'light') {
        flowerImg.src = '30.png'; // 浅色主题使用30.png
      } else if (this.settings.theme.type === 'custom') {
        flowerImg.src = '31.png'; // 自定义主题使用31.png
      } else {
        flowerImg.src = '25.png'; // 默认主题使用25.png
      }
      
      flowerImg.className = 'flower-decoration';
      flowerImg.alt = '我花装饰';
      document.body.appendChild(flowerImg);
      
      // 创建聊天气泡元素（初始隐藏）
      const chatBubble = document.createElement('div');
      chatBubble.className = 'flower-chat-bubble';
      chatBubble.id = 'flower-chat-bubble';
      document.body.appendChild(chatBubble);
    }
  },
  
  // 保存设置
  saveSettings() {
    if (isElectron()) {
      // 使用Electron的IPC保存
      window.electronAPI.saveSettings(this.settings)
        .then(result => {
          if (result.success) {
            pageManager.showCustomAlert('成功', '设置已保存');
            this.applyTheme();
            this.updateGlobalApiKeys();
          } else {
            pageManager.showCustomAlert('保存失败', result.error || '未知错误', null, '确定', 'btn-danger');
          }
        })
        .catch(error => {
          console.error('保存设置失败:', error);
          pageManager.showCustomAlert('错误', '保存设置时出错，请重试', null, '确定', 'btn-danger');
        });
    } else {
      // 使用localStorage保存
      try {
        localStorage.setItem('app_settings', JSON.stringify(this.settings));
        pageManager.showCustomAlert('成功', '设置已保存');
        this.applyTheme();
        this.updateGlobalApiKeys();
      } catch (error) {
        console.error('保存设置到localStorage失败:', error);
        pageManager.showCustomAlert('保存失败', '保存设置失败，请重试', null, '确定', 'btn-danger');
      }
    }
  },
  
  // 重置设置
  resetSettings() {
    // 重置为默认设置
    this.settings = {
      theme: {
        type: 'default',
        bgColor: '#f8f9fa',
        bgImageUrl: '',
        bgImageData: null
      },
      api: {
        provider: 'tongyi',
        key: '',
        endpoint: ''
      }
    };
    
    // 更新UI
    this.updateSettingsUI();
    
    // 应用主题
    this.applyTheme();
  },
  
  // 更新全局API密钥
  updateGlobalApiKeys() {
    if (this.settings.api.provider === 'tongyi' && this.settings.api.key) {
      TONGYI_API_KEY = this.settings.api.key;
    } else if (this.settings.api.provider === 'deepseek' && this.settings.api.key) {
      DEEPSEEK_API_KEY = this.settings.api.key;
    }
  },
  
  // 加载自定义题库
  loadQuestionBanks() {
    if (isElectron()) {
      // Electron环境下，使用IPC通信加载题库
      if (window.electronAPI && window.electronAPI.loadQuestionBanks) {
        window.electronAPI.loadQuestionBanks()
          .then(result => {
            if (result.success && result.banks) {
              customQuestionBanks = result.banks;
              this.renderQuestionBankList();
            }
          })
          .catch(error => {
            console.error('加载题库失败:', error);
          });
      }
    } else {
      // 浏览器环境下，使用localStorage
      const banks = localStorage.getItem('custom_question_banks');
      if (banks) {
        try {
          customQuestionBanks = JSON.parse(banks);
          this.renderQuestionBankList();
        } catch (error) {
          console.error('解析题库数据失败:', error);
        }
      }
    }
  },
  
  // 渲染题库列表
  renderQuestionBankList() {
    const container = document.getElementById('question-bank-list');
    if (!container) return;
    
    if (customQuestionBanks.length === 0) {
      container.innerHTML = `<div class="text-center p-3 text-muted">暂无自定义题库</div>`;
      return;
    }
    
    let html = '';
    customQuestionBanks.forEach(bank => {
      html += `
        <div class="bank-item" data-id="${bank.id}">
          <div class="bank-item-info">
            <div class="bank-item-title">${bank.name}</div>
            <div class="bank-item-meta">
              <span>包含题目: ${this.countBankQuestions(bank)}</span>
              <span>上传时间: ${bank.uploadDate}</span>
            </div>
          </div>
          <div class="bank-item-actions">
            <button class="btn btn-sm btn-outline-danger delete-bank" data-id="${bank.id}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    
    // 添加删除事件监听
    container.querySelectorAll('.delete-bank').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bankId = btn.getAttribute('data-id');
        this.deleteQuestionBank(bankId);
      });
    });
  },
  
  // 计算题库中的题目数量
  countBankQuestions(bank) {
    let count = 0;
    if (bank.questions) {
      // 直接计算题目数组长度
      count = bank.questions.length;
    } else if (bank.categories) {
      // 计算所有分类中的题目数量
      Object.values(bank.categories).forEach(category => {
        if (Array.isArray(category.questions)) {
          count += category.questions.length;
        }
      });
    }
    return count;
  },
  
  // 添加新题库
  addQuestionBank(bank) {
    // 生成唯一ID
    bank.id = `bank-${Date.now()}`;
    bank.uploadDate = new Date().toLocaleString();
    
    // 添加到数组
    customQuestionBanks.push(bank);
    
    // 保存题库
    this.saveQuestionBanks();
    
    // 更新UI
    this.renderQuestionBankList();
    
    return bank.id;
  },
  
  // 删除题库
  deleteQuestionBank(bankId) {
    // 确认删除
    pageManager.showCustomConfirm(
      '删除题库',
      '确定要删除这个题库吗？此操作不可撤销。',
      () => {
        // 从数组中移除
        customQuestionBanks = customQuestionBanks.filter(bank => bank.id !== bankId);
        
        // 保存更新后的题库列表
        this.saveQuestionBanks();
        
        // 更新UI
        this.renderQuestionBankList();
      }
    );
  },
  
  // 保存题库
  saveQuestionBanks() {
    if (isElectron()) {
      // Electron环境下，使用IPC通信保存
      if (window.electronAPI && window.electronAPI.saveQuestionBanks) {
        window.electronAPI.saveQuestionBanks(customQuestionBanks)
          .catch(error => {
            console.error('保存题库失败:', error);
          });
      }
    } else {
      // 浏览器环境下，使用localStorage
      try {
        localStorage.setItem('custom_question_banks', JSON.stringify(customQuestionBanks));
      } catch (error) {
        console.error('保存题库到本地存储失败:', error);
        // 如果数据太大，可能会超出localStorage限制
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          alert('题库数据过大，无法保存到本地存储。建议减少题库数量或使用桌面版应用。');
        }
      }
    }
    
    // 更新设置中的题库状态
    this.settings.questionBank.banks = customQuestionBanks.map(bank => ({
      id: bank.id,
      name: bank.name
    }));
    
    // 保存设置
    this.saveSettings();
  },
  
  // 显示题库格式说明
  showBankFormatGuide() {
    const modal = document.createElement('div');
    modal.className = 'bank-format-modal';
    
    const exampleBank = {
      name: "计算机科学基础题库",
      description: "包含计算机科学基础知识的题目集合",
      version: "1.0",
      categories: {
        "数据结构": {
          name: "数据结构",
          questions: [
            {
              id: "ds-001",
              type: "single",
              content: "以下哪种数据结构适合实现队列？",
              options: [
                "栈 - 后进先出的数据结构",
                "链表 - 由节点组成的线性集合",
                "数组 - 固定大小的顺序集合",
                "树 - 层次结构的集合"
              ],
              answer: "B. 链表 - 由节点组成的线性集合\n\n解析：链表是实现队列的常用数据结构，它支持高效的头部删除和尾部插入操作，非常适合实现队列的先进先出特性。"
            }
          ]
        }
      }
    };
    
    modal.innerHTML = `
      <div class="bank-format-content">
        <div class="bank-format-header">
          <h3>题库格式说明</h3>
          <span class="bank-format-close">&times;</span>
        </div>
        <div class="bank-format-body">
          <p>自定义题库需要使用JSON格式，包含以下结构：</p>
          <ul>
            <li><strong>name</strong>: 题库名称</li>
            <li><strong>description</strong>: 题库描述</li>
            <li><strong>version</strong>: 版本号</li>
            <li><strong>categories</strong>: 分类集合，或者</li>
            <li><strong>questions</strong>: 题目数组（如果不需要分类）</li>
          </ul>
          
          <p>每个题目需要包含以下字段：</p>
          <ul>
            <li><strong>id</strong>: 题目ID</li>
            <li><strong>type</strong>: 题目类型（single-单选，multiple-多选，tf-判断，short-简答）</li>
            <li><strong>content</strong>: 题目内容</li>
            <li><strong>options</strong>: 选项数组（单选、多选题必需）</li>
            <li><strong>answer</strong>: 答案及解析</li>
          </ul>
          
          <p>示例题库结构：</p>
          <div class="bank-format-example">
            <pre>${JSON.stringify(exampleBank, null, 2)}</pre>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 添加关闭事件
    const closeBtn = modal.querySelector('.bank-format-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
      });
    }
    
    // 点击模态框背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  },
  
  // 处理题库文件上传
  handleBankFileUpload(file) {
    if (!file) return;
    
    // 检查文件类型
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      pageManager.showCustomAlert('文件类型错误', '请上传JSON格式的题库文件');
      return;
    }
    
    // 读取文件内容
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const bankData = JSON.parse(event.target.result);
        
        // 验证题库格式
        if (!bankData.name) {
          throw new Error('题库缺少name字段');
        }
        
        if (!bankData.questions && !bankData.categories) {
          throw new Error('题库缺少questions或categories字段');
        }
        
        // 添加题库
        const bankId = this.addQuestionBank(bankData);
        
        // 显示成功消息
        pageManager.showCustomAlert('上传成功', `题库"${bankData.name}"已成功添加！`);
        
        // 清空文件输入框
        const bankUpload = document.getElementById('bank-upload');
        if (bankUpload) {
          bankUpload.value = '';
        }
      } catch (error) {
        console.error('解析题库文件失败:', error);
        pageManager.showCustomAlert('文件格式错误', `题库文件格式错误: ${error.message}`);
      }
    };
    
    reader.onerror = () => {
      pageManager.showCustomAlert('读取失败', '读取文件失败，请重试');
    };
    
    reader.readAsText(file);
  },
  
  // 显示示例题库下载选项
  showSampleBankOptions() {
    const modal = document.createElement('div');
    modal.className = 'bank-format-modal';
    
    modal.innerHTML = `
      <div class="bank-format-content">
        <div class="bank-format-header">
          <h3>示例题库下载</h3>
          <span class="bank-format-close">&times;</span>
        </div>
        
        <div class="sample-bank-container">
          <h5>选择示例题库</h5>
          <p>这些示例题库可以帮助您了解题库的格式，也可以作为创建自己题库的模板。</p>
          
          <div class="sample-bank-options">
            <a href="#" class="sample-bank-btn" data-sample="computer">
              <i class="bi bi-cpu"></i>计算机科学题库
            </a>
            <a href="#" class="sample-bank-btn" data-sample="medical">
              <i class="bi bi-heart-pulse"></i>医学健康题库
            </a>
            <a href="#" class="sample-bank-btn" data-sample="business">
              <i class="bi bi-graph-up"></i>商业管理题库
            </a>
            <a href="#" class="sample-bank-btn" data-sample="empty">
              <i class="bi bi-file-earmark-plus"></i>空白模板
            </a>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 添加关闭事件
    const closeBtn = modal.querySelector('.bank-format-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
      });
    }
    
    // 点击模态框背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
    
    // 点击下载按钮事件
    const sampleButtons = modal.querySelectorAll('.sample-bank-btn');
    sampleButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sampleType = btn.getAttribute('data-sample');
        this.downloadSampleBank(sampleType);
        document.body.removeChild(modal);
      });
    });
  },
  
  // 下载示例题库
  downloadSampleBank(type) {
    let bankData = null;
    let fileName = '';
    
    switch (type) {
      case 'computer':
        bankData = this.getComputerSampleBank();
        fileName = '计算机科学题库示例.json';
        break;
      case 'medical':
        bankData = this.getMedicalSampleBank();
        fileName = '医学健康题库示例.json';
        break;
      case 'business':
        bankData = this.getBusinessSampleBank();
        fileName = '商业管理题库示例.json';
        break;
      case 'empty':
        bankData = this.getEmptySampleBank();
        fileName = '题库空白模板.json';
        break;
      default:
        bankData = this.getEmptySampleBank();
        fileName = '题库模板.json';
    }
    
    // 将题库数据转换为JSON字符串
    const dataStr = JSON.stringify(bankData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    
    // 点击链接进行下载
    link.click();
    
    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  
  // 获取计算机科学示例题库
  getComputerSampleBank() {
    return {
      name: "计算机科学基础题库",
      description: "包含计算机科学基础知识的题目集合",
      version: "1.0",
      categories: {
        "数据结构": {
          name: "数据结构",
          questions: [
            {
              id: "ds-001",
              type: "single",
              content: "以下哪种数据结构适合实现队列？",
              options: [
                "栈 - 后进先出的数据结构",
                "链表 - 由节点组成的线性集合",
                "数组 - 固定大小的顺序集合",
                "树 - 层次结构的集合"
              ],
              answer: "B. 链表 - 由节点组成的线性集合\n\n解析：链表是实现队列的常用数据结构，它支持高效的头部删除和尾部插入操作，非常适合实现队列的先进先出特性。"
            },
            {
              id: "ds-002",
              type: "multiple",
              content: "以下哪些数据结构是非线性的？（多选）",
              options: [
                "数组",
                "树",
                "图",
                "链表"
              ],
              answer: "B, C. 树和图\n\n解析：非线性数据结构是指元素之间不是按线性顺序存储的结构。树和图都是非线性数据结构，而数组和链表是线性数据结构。"
            }
          ]
        },
        "算法": {
          name: "算法",
          questions: [
            {
              id: "algo-001",
              type: "single",
              content: "快速排序的平均时间复杂度是多少？",
              options: [
                "O(n)",
                "O(n log n)",
                "O(n²)",
                "O(log n)"
              ],
              answer: "B. O(n log n)\n\n解析：快速排序是一种分治算法，平均情况下时间复杂度为O(n log n)，最坏情况下为O(n²)。"
            },
            {
              id: "algo-002",
              type: "tf",
              content: "二分查找算法只能应用于有序数组。",
              options: ["正确", "错误"],
              answer: "A. 正确\n\n解析：二分查找要求数据结构必须是有序的，这样才能通过比较中间元素来确定目标元素在左半部分还是右半部分。"
            }
          ]
        }
      }
    };
  },
  
  // 获取医学健康示例题库
  getMedicalSampleBank() {
    return {
      name: "医学健康基础题库",
      description: "包含医学和健康知识的题目集合",
      version: "1.0",
      categories: {
        "解剖学": {
          name: "解剖学",
          questions: [
            {
              id: "anat-001",
              type: "single",
              content: "人体最大的器官是什么？",
              options: [
                "心脏",
                "肝脏",
                "皮肤",
                "大脑"
              ],
              answer: "C. 皮肤\n\n解析：皮肤是人体最大的器官，成人皮肤面积约为1.5-2平方米，重约4.5-5千克，约占体重的16%。"
            },
            {
              id: "anat-002",
              type: "tf",
              content: "成人骨骼系统一共有206块骨头。",
              options: ["正确", "错误"],
              answer: "A. 正确\n\n解析：成人骨骼系统一共有206块骨头，包括长骨、短骨、扁骨和不规则骨。"
            }
          ]
        },
        "生理学": {
          name: "生理学",
          questions: [
            {
              id: "phys-001",
              type: "multiple",
              content: "以下哪些是心脏的功能？（多选）",
              options: [
                "将氧气输送到身体各部分",
                "产生抗体",
                "泵送血液",
                "调节体温"
              ],
              answer: "A, C. 将氧气输送到身体各部分、泵送血液\n\n解析：心脏的主要功能是泵送血液，通过血液将氧气和营养物质输送到身体各部分，并将二氧化碳和废物带走。产生抗体是免疫系统的功能，调节体温是体温调节系统的功能。"
            },
            {
              id: "phys-002",
              type: "short",
              content: "简述人体血液循环的过程。",
              options: [],
              answer: "人体血液循环分为体循环和肺循环。在体循环中，含氧血液从左心室泵出，经主动脉和动脉系统输送到全身各组织，然后含二氧化碳的血液通过静脉系统回到右心房。在肺循环中，含二氧化碳的血液从右心室泵出，经肺动脉到达肺部进行气体交换，然后含氧血液通过肺静脉回到左心房，完成循环。"
            }
          ]
        }
      }
    };
  },
  
  // 获取商业管理示例题库
  getBusinessSampleBank() {
    return {
      name: "商业管理基础题库",
      description: "包含商业管理知识的题目集合",
      version: "1.0",
      questions: [
        {
          id: "biz-001",
          type: "single",
          content: "SWOT分析中的'S'代表什么？",
          options: [
            "Strength（优势）",
            "Strategy（策略）",
            "Structure（结构）",
            "System（系统）"
          ],
          answer: "A. Strength（优势）\n\n解析：SWOT分析是一种用于评估企业竞争地位的工具，其中'S'代表Strength（优势），'W'代表Weakness（劣势），'O'代表Opportunity（机会），'T'代表Threat（威胁）。"
        },
        {
          id: "biz-002",
          type: "multiple",
          content: "以下哪些是有效的市场细分变量？（多选）",
          options: [
            "人口统计（如年龄、性别）",
            "地理位置",
            "心理图谱",
            "产品颜色"
          ],
          answer: "A, B, C. 人口统计、地理位置、心理图谱\n\n解析：有效的市场细分变量包括人口统计变量（如年龄、性别、收入）、地理变量（如国家、城市）、心理图谱变量（如生活方式、价值观）和行为变量（如购买频率、忠诚度）。产品颜色是产品特性，不是市场细分变量。"
        },
        {
          id: "biz-003",
          type: "tf",
          content: "边际成本是指生产一单位产品的总成本。",
          options: ["正确", "错误"],
          answer: "B. 错误\n\n解析：边际成本是指多生产一单位产品所增加的成本，而不是生产一单位产品的总成本。生产一单位产品的总成本是平均总成本。"
        },
        {
          id: "biz-004",
          type: "short",
          content: "简述波特五力模型及其在竞争分析中的应用。",
          options: [],
          answer: "波特五力模型是由迈克尔·波特提出的用于分析行业竞争环境的框架，包括：供应商议价能力、购买者议价能力、新进入者威胁、替代品威胁以及行业内部竞争。该模型可以帮助企业了解行业结构、评估行业吸引力、识别竞争优势源泉，以及制定合适的竞争战略。企业可以通过分析这五种力量，找出自身在行业中的定位，并确定如何应对市场变化和竞争压力。"
        }
      ]
    };
  },
  
  // 获取空白题库模板
  getEmptySampleBank() {
    return {
      name: "空白题库模板",
      description: "使用此模板创建您自己的题库",
      version: "1.0",
      categories: {
        "分类1": {
          name: "分类1",
          questions: [
            {
              id: "q-001",
              type: "single",
              content: "这是一个单选题示例",
              options: [
                "选项A",
                "选项B",
                "选项C",
                "选项D"
              ],
              answer: "A. 选项A\n\n解析：这里是答案解析。"
            },
            {
              id: "q-002",
              type: "multiple",
              content: "这是一个多选题示例（可选多项）",
              options: [
                "选项A",
                "选项B",
                "选项C",
                "选项D"
              ],
              answer: "A, B. 选项A和选项B\n\n解析：这里是答案解析。"
            },
            {
              id: "q-003",
              type: "tf",
              content: "这是一个判断题示例。",
              options: ["正确", "错误"],
              answer: "A. 正确\n\n解析：这里是答案解析。"
            },
            {
              id: "q-004",
              type: "short",
              content: "这是一个简答题示例。",
              options: [],
              answer: "这里是简答题的答案和解析。可以包含多个段落，详细说明概念、原理等。"
            }
          ]
        }
      }
    };
  },
};

// 检查DOM是否已加载完成
function domReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

// 笔记本页面
const notebookPage = {
  notes: [],
  currentNote: null,
  
  // 初始化页面
  init() {
    this.loadNotes();
    this.setupEventListeners();
    this.showPlaceholder();
  },
  
  // 加载笔记
  loadNotes() {
    const notesList = document.getElementById('notebook-list');
    if (!notesList) return;
    
    // 显示加载状态
    notesList.innerHTML = `
      <div class="loading">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">正在加载笔记...</span>
        </div>
        <p>正在加载笔记，请稍候...</p>
      </div>
    `;
    
    // 根据运行环境使用不同的加载方法
    if (isElectron()) {
      // Electron环境，从文件系统加载笔记
      this.loadNotesFromFileSystem()
        .then(notes => {
          this.notes = notes;
          this.renderNotesList();
        })
        .catch(error => {
          console.error('加载笔记失败:', error);
          notesList.innerHTML = `<div class="alert alert-danger">加载笔记失败: ${error.message}</div>`;
        });
    } else {
      // 浏览器环境，从localStorage加载笔记
      setTimeout(() => {
        try {
          const notesJson = localStorage.getItem('notebook_notes');
          this.notes = notesJson ? JSON.parse(notesJson) : [];
          this.renderNotesList();
        } catch (error) {
          console.error('从localStorage加载笔记失败:', error);
          notesList.innerHTML = `<div class="alert alert-danger">加载笔记失败: ${error.message}</div>`;
        }
      }, 500);
    }
  },
  
  // 从文件系统加载笔记（Electron环境）
  async loadNotesFromFileSystem() {
    try {
      if (!window.electronAPI || !window.electronAPI.loadNotes) {
        throw new Error('Electron API不可用');
      }
      
      const result = await window.electronAPI.loadNotes();
      if (result.success) {
        return result.notes || [];
      } else {
        throw new Error(result.error || '未知错误');
      }
    } catch (error) {
      console.error('从文件系统加载笔记失败:', error);
      return [];
    }
  },
  
  // 渲染笔记列表
  renderNotesList() {
    const notesList = document.getElementById('notebook-list');
    if (!notesList) return;
    
    if (this.notes.length === 0) {
      notesList.innerHTML = `
        <div class="text-center p-4 text-muted">
          <i class="bi bi-journal-x"></i> 暂无笔记
        </div>
      `;
      return;
    }
    
    // 按最后修改时间排序，最新的在前面
    const sortedNotes = [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);
    
    notesList.innerHTML = sortedNotes.map(note => this.createNoteItem(note)).join('');
    
    // 添加点击事件
    document.querySelectorAll('.notebook-item').forEach(item => {
      item.addEventListener('click', () => {
        const noteId = item.getAttribute('data-id');
        this.openNote(noteId);
      });
    });
    
    // 添加删除按钮事件
    document.querySelectorAll('.delete-note-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡，避免触发笔记打开
        const noteId = btn.getAttribute('data-id');
        this.deleteNote(noteId);
      });
    });
  },
  
  // 创建笔记项
  createNoteItem(note) {
    const date = new Date(note.updatedAt);
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    return `
      <div class="notebook-item" data-id="${note.id}">
        <div class="notebook-item-content">
          <div class="notebook-item-title">${note.title || '无标题笔记'}</div>
          <div class="notebook-item-date">${formattedDate}</div>
        </div>
        <button class="btn btn-sm btn-danger delete-note-btn" data-id="${note.id}" title="删除笔记">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;
  },
  
  // 打开笔记
  openNote(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    
    this.currentNote = note;
    
    // 更新UI
    document.querySelectorAll('.notebook-item').forEach(item => {
      if (item.getAttribute('data-id') === noteId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // 显示编辑器
    this.showEditor();
    
    // 填充笔记内容
    const titleInput = document.getElementById('note-title');
    const contentEditor = document.getElementById('note-content-editor');
    
    if (titleInput) titleInput.value = note.title || '';
    if (contentEditor) {
      contentEditor.innerHTML = note.content || '';
      
      // 确保编辑器可编辑
      contentEditor.contentEditable = "true";
      contentEditor.style.pointerEvents = "auto";
      
      // 启用编辑器的富文本功能
      try {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('insertBrOnReturn', false, true);
      } catch (e) {
        console.error('设置编辑器命令失败:', e);
      }
      
      // 聚焦到编辑器
      setTimeout(() => {
        contentEditor.focus();
      }, 100);
    }
  },
  
  // 创建新笔记
  createNewNote() {
    const newNote = {
      id: `note_${Date.now()}`,
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.notes.unshift(newNote);
    this.currentNote = newNote;
    
    // 更新UI
    this.renderNotesList();
    this.showEditor();
    
    // 清空编辑器
    const titleInput = document.getElementById('note-title');
    const contentEditor = document.getElementById('note-content-editor');
    
    if (titleInput) {
      titleInput.value = '';
      titleInput.focus();
    }
    
    if (contentEditor) {
      contentEditor.innerHTML = '<p>在这里输入笔记内容...</p>';
      
      // 确保编辑器可编辑
      contentEditor.contentEditable = "true";
      contentEditor.style.pointerEvents = "auto";
      
      // 启用编辑器的富文本功能
      try {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('insertBrOnReturn', false, true);
      } catch (e) {
        console.error('设置编辑器命令失败:', e);
      }
      
      // 清除可能的只读状态
      contentEditor.removeAttribute('readonly');
    }
  },
  
  // 删除笔记
  deleteNote(noteId) {
    // 使用自定义确认对话框，而不是系统confirm
    this.showCustomConfirmDialog('确定要删除这个笔记吗？', '此操作不可撤销。', () => {
      // 从笔记列表中删除
      this.notes = this.notes.filter(note => note.id !== noteId);
      
      // 如果删除的是当前笔记，清除当前笔记
      if (this.currentNote && this.currentNote.id === noteId) {
        this.currentNote = null;
        this.showPlaceholder();
      }
      
      // 保存更改
      this.saveNotes();
      
      // 更新UI
      this.renderNotesList();
    });
  },
  
  // 显示自定义确认对话框
  showCustomConfirmDialog(title, message, onConfirm) {
    // 创建对话框元素
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'custom-dialog-overlay';
    
    const dialogBox = document.createElement('div');
    dialogBox.className = 'custom-dialog-box';
    
    // 设置对话框内容
    dialogBox.innerHTML = `
      <div class="custom-dialog-header">
        <h5>${title}</h5>
      </div>
      <div class="custom-dialog-body">
        <p>${message}</p>
      </div>
      <div class="custom-dialog-footer">
        <button class="btn btn-secondary btn-sm cancel-button">取消</button>
        <button class="btn btn-danger btn-sm confirm-button">确认删除</button>
      </div>
    `;
    
    // 添加对话框到页面
    dialogOverlay.appendChild(dialogBox);
    document.body.appendChild(dialogOverlay);
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .custom-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .custom-dialog-box {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        width: 300px;
        max-width: 90%;
      }
      .custom-dialog-header {
        padding: 15px;
        border-bottom: 1px solid #e9ecef;
      }
      .custom-dialog-body {
        padding: 15px;
      }
      .custom-dialog-footer {
        padding: 15px;
        border-top: 1px solid #e9ecef;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `;
    document.head.appendChild(style);
    
    // 添加按钮事件
    const cancelButton = dialogBox.querySelector('.cancel-button');
    const confirmButton = dialogBox.querySelector('.confirm-button');
    
    // 取消按钮
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(dialogOverlay);
    });
    
    // 确认按钮
    confirmButton.addEventListener('click', () => {
      document.body.removeChild(dialogOverlay);
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    });
    
    // 点击遮罩层关闭对话框
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        document.body.removeChild(dialogOverlay);
      }
    });
  },
  
  // 保存当前笔记
  saveCurrentNote() {
    if (!this.currentNote) return;
    
    const titleInput = document.getElementById('note-title');
    const contentEditor = document.getElementById('note-content-editor');
    
    if (!titleInput || !contentEditor) return;
    
    // 更新笔记内容
    this.currentNote.title = titleInput.value;
    this.currentNote.content = contentEditor.innerHTML;
    this.currentNote.updatedAt = Date.now();
    
    // 保存笔记
    this.saveNotes();
    
    // 更新UI
    this.renderNotesList();
    
    // 显示保存成功提示
    this.showSaveSuccessMessage();
  },
  
  // 显示保存成功提示
  showSaveSuccessMessage() {
    // 创建提示元素
    const message = document.createElement('div');
    message.className = 'save-success-message';
    message.innerHTML = '<i class="bi bi-check-circle"></i> 笔记已保存';
    
    // 添加到编辑器
    const editor = document.getElementById('notebook-editor');
    if (editor) {
      editor.appendChild(message);
      
      // 3秒后自动移除
      setTimeout(() => {
        message.remove();
      }, 3000);
    }
  },
  
  // 保存所有笔记
  saveNotes() {
    if (isElectron()) {
      // Electron环境，保存到文件系统
      if (window.electronAPI && window.electronAPI.saveNotes) {
        window.electronAPI.saveNotes(this.notes)
          .then(result => {
            if (!result.success) {
              console.error('保存笔记失败:', result.error);
            }
          })
          .catch(error => {
            console.error('保存笔记失败:', error);
          });
      }
    } else {
      // 浏览器环境，保存到localStorage
      try {
        localStorage.setItem('notebook_notes', JSON.stringify(this.notes));
      } catch (error) {
        console.error('保存笔记到localStorage失败:', error);
      }
    }
  },
  
  // 显示编辑器
  showEditor() {
    const editor = document.getElementById('notebook-editor');
    const placeholder = document.getElementById('notebook-placeholder');
    
    if (editor) editor.style.display = 'flex';
    if (placeholder) placeholder.style.display = 'none';
  },
  
  // 显示占位符
  showPlaceholder() {
    const editor = document.getElementById('notebook-editor');
    const placeholder = document.getElementById('notebook-placeholder');
    
    if (editor) editor.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
  },
  
  // 设置事件监听器
  setupEventListeners() {
    // 新建笔记按钮
    const newNoteBtn = document.getElementById('new-note');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => {
        this.createNewNote();
      });
    }
    
    // 保存笔记按钮
    const saveNoteBtn = document.getElementById('save-note');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', () => {
        this.saveCurrentNote();
      });
    }
    
    // 格式化按钮
    const formatBoldBtn = document.getElementById('format-bold');
    const formatItalicBtn = document.getElementById('format-italic');
    const formatUnderlineBtn = document.getElementById('format-underline');
    
    if (formatBoldBtn) {
      formatBoldBtn.addEventListener('click', () => {
        document.execCommand('bold', false, null);
        this.focusEditor();
      });
    }
    
    if (formatItalicBtn) {
      formatItalicBtn.addEventListener('click', () => {
        document.execCommand('italic', false, null);
        this.focusEditor();
      });
    }
    
    if (formatUnderlineBtn) {
      formatUnderlineBtn.addEventListener('click', () => {
        document.execCommand('underline', false, null);
        this.focusEditor();
      });
    }
    
    // 插入图片按钮
    const insertImageBtn = document.getElementById('insert-image');
    const imageUploadInput = document.getElementById('image-upload');
    
    if (insertImageBtn && imageUploadInput) {
      insertImageBtn.addEventListener('click', () => {
        imageUploadInput.click();
      });
      
      imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            document.execCommand('insertImage', false, event.target.result);
            this.focusEditor();
          };
          reader.readAsDataURL(file);
        }
      });
    }
    
    // 监听编辑器内容变化
    const contentEditor = document.getElementById('note-content-editor');
    if (contentEditor) {
      // 确保编辑器可编辑
      contentEditor.contentEditable = "true";
      contentEditor.style.pointerEvents = "auto";
      
      // 添加初始点击事件，清除默认文本
      contentEditor.addEventListener('focus', (e) => {
        if (contentEditor.innerHTML === '<p>在这里输入笔记内容...</p>') {
          contentEditor.innerHTML = '<p></p>';
        }
      }, { once: true });
    }
  },
  
  // 聚焦到编辑器
  focusEditor() {
    const contentEditor = document.getElementById('note-content-editor');
    if (contentEditor) {
      contentEditor.focus();
    }
  },
  
  // 笔记本页面退出前的清理工作
  cleanup() {
    // 保存当前笔记
    if (this.currentNote) {
      this.saveCurrentNote();
    }
    
    // 重置document.execCommand状态
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('insertBrOnReturn', false, false);
    } catch (e) {
      console.error('重置编辑器命令失败:', e);
    }
    
    // 清除可能影响其他页面的contentEditable状态
    const contentEditors = document.querySelectorAll('[contenteditable="true"]');
    contentEditors.forEach(editor => {
      editor.removeAttribute('contenteditable');
    });
    
    // 清除可能的全局事件监听器
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    
    console.log('笔记本页面已清理');
  }
};

// 初始化应用
domReady(() => {
  console.log('DOM已加载，初始化应用...');
  try {
    pageManager.init();
  } catch (error) {
    console.error('初始化应用失败:', error);
  }
});