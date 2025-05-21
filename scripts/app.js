// 全局变量
const TONGYI_API_KEY = 'sk-07ef4701031d41668beebb521e80eaf0';
const DEEPSEEK_API_KEY = 'sk-0b2be14756fe4195a7bc2bcb78d19f8f';
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
          
          // 从笔记本页面切换到生成题目页面时，增加更多的尝试次数
          if (previousPage === 'notebook') {
            console.log('从笔记本页面切换到生成题目页面，确保输入框可用');
            // 使用递增延迟确保输入框可交互
            for (let i = 1; i <= 10; i++) {
              setTimeout(() => generatePage.ensureFieldInputInteractive(), i * 200);
            }
          } else {
            // 在页面加载后多次尝试确保输入框可交互
            setTimeout(() => generatePage.ensureFieldInputInteractive(), 100);
            setTimeout(() => generatePage.ensureFieldInputInteractive(), 300);
            setTimeout(() => generatePage.ensureFieldInputInteractive(), 500);
          }
        }, 50);
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
    newInput.style.pointerEvents = 'auto';
    newInput.style.zIndex = '1000';
    newInput.style.position = 'relative';
    newInput.style.opacity = '1';
    newInput.style.visibility = 'visible';
    
    // 替换原有的输入框
    if (fieldInput.parentNode) {
      fieldInput.parentNode.replaceChild(newInput, fieldInput);
      
      // 为新的输入框添加点击和聚焦事件
      newInput.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          newInput.focus();
          console.log('输入框被点击并聚焦');
        } catch (err) {
          console.error('输入框聚焦失败:', err);
        }
      });
      
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
        // 使用专门的函数确保输入框可交互
        setTimeout(() => this.ensureFieldInputInteractive(), 100);
        setTimeout(() => this.ensureFieldInputInteractive(), 300);
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
    
    // 模拟API调用延迟
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
    }, 1000);
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
    const isUsingCustomKey = this.checkIfUsingCustomKey();
    
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
      this.incrementDailyGenerationCount();
    }
    
    // 使用AI生成题目
    this.generateQuestionsWithAI()
      .then(questions => {
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
        console.error('生成题目失败:', error);
        
        // 显示错误信息
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
      });
  },
  
  // 使用AI生成题目
  async generateQuestionsWithAI() {
    console.log('使用AI生成题目');
    console.log('专业领域:', this.fieldValue);
    console.log('题目数量:', this.questionCount);
    console.log('难度级别:', this.difficulty);
    console.log('题目类型:', this.selectedTypes);
    
    try {
      // 获取API设置
      const apiSettings = settingsPage.settings.api;
      const apiKey = apiSettings.key || (apiSettings.provider === 'tongyi' ? TONGYI_API_KEY : DEEPSEEK_API_KEY);
      const apiEndpoint = apiSettings.endpoint || (apiSettings.provider === 'tongyi' ? 'https://api.tongyi.aliyun.com/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions');
      const apiModel = apiSettings.provider === 'tongyi' ? 'qwen-max' : 'deepseek-chat';
      
      // 获取难度文本
      let difficultyText;
      switch (this.difficulty) {
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
      
      // 构建提示词
      const typeText = this.selectedTypes.map(type => {
        switch (type) {
          case 'single': return '单选题';
          case 'multiple': return '多选题';
          case 'tf': return '判断题';
          case 'short': return '简答题';
          default: return type;
        }
      }).join('、');
      
      // 构建系统提示词
      const systemPrompt = `你是一个专业的${this.fieldValue}题目生成器。请根据用户的要求，生成符合条件的题目。
生成的题目应该具有教育意义，难度级别为"${difficultyText}"。
请确保题目内容准确、专业，并提供详细的解析。
输出格式必须是JSON数组，每个题目包含以下字段：
1. id: 题目ID，格式为"q-"加上随机数
2. type: 题目类型，可以是"single"(单选题)、"multiple"(多选题)、"tf"(判断题)或"short"(简答题)
3. content: 题目内容
4. options: 选项数组（单选题和多选题必须提供，判断题和简答题可以为空数组）
5. answer: 答案，包括正确选项和解析

请确保生成的题目各不相同，内容丰富多样。`;

      // 构建用户提示词
      const userPrompt = `请生成${this.questionCount}道${this.fieldValue}的${typeText}，难度级别为"${difficultyText}"。`;
      
      // 构建API请求参数
      const requestData = {
        model: apiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7, // 增加随机性
        max_tokens: 4000,
        parameters: {
          result_format: 'json'
        }
      };
      
      console.log('API请求参数:', JSON.stringify(requestData, null, 2));
      
      // 在Electron环境中使用IPC进行API调用
      if (isElectron()) {
        try {
          console.log('使用Electron IPC进行API调用');
          const result = await window.electronAPI.callAI({
            endpoint: apiEndpoint,
            apiKey: apiKey,
            data: requestData
          });
          
          if (!result.success) {
            console.log('API调用失败，使用本地生成:', result.error);
            throw new Error(result.error || '调用AI API失败');
          }
          
          return this.parseAIResponse(result.data);
        } catch (error) {
          console.log('API调用出错，使用本地生成:', error.message);
          // 使用本地生成随机题目
          return this.generateRandomQuestions();
        }
      } else {
        // 在浏览器环境中，使用本地生成随机题目
        console.log('浏览器环境，使用本地生成随机题目');
        return this.generateRandomQuestions();
      }
    } catch (error) {
      console.error('AI生成题目失败:', error);
      // 出错时使用本地生成随机题目
      console.log('回退到使用本地生成随机题目');
      return this.generateRandomQuestions();
    }
  },
  
  // 本地生成随机题目
  generateRandomQuestions() {
    console.log('使用本地逻辑生成随机题目');
    
    // 加载历史题目记录
    this.loadUsedQuestionContents();
    
    // 准备题库 - 按专业领域和题型分类
    const questionBank = this.prepareQuestionBank();
    const questions = [];
    const currentUsedContents = new Set(); // 用于跟踪当前生成中已使用的题目内容
    
    // 获取当前选择的题型
    const questionTypes = this.selectedTypes.length > 0 ? this.selectedTypes : ['single', 'multiple', 'tf'];
    
    // 生成指定数量的题目
    for (let i = 0; i < this.questionCount; i++) {
      // 随机选择一个题型
      const randomType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
      
      // 生成一个随机题目
      const question = this.generateRandomQuestion(i, randomType, this.fieldValue, this.difficulty);
      
      // 确保题目不重复
      if (!usedQuestionContents.has(question.content) && !currentUsedContents.has(question.content)) {
        questions.push(question);
        currentUsedContents.add(question.content);
      } else {
        // 如果题目重复，重新生成
        i--;
      }
    }
    
    // 保存已使用的题目内容
    this.saveUsedQuestionContents(currentUsedContents);
    
    return questions;
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
      } else {
        throw new Error('无效的AI响应格式');
      }
      
      // 尝试解析JSON
      let questions = [];
      
      // 提取JSON部分
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/\[\s*\{\s*"id"\s*:/) ||
                        content.match(/\{\s*"questions"\s*:\s*\[/);
      
      if (jsonMatch) {
        let jsonText = jsonMatch[0];
        // 移除可能的Markdown代码块标记
        jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```/, '');
        
        // 解析JSON
        const parsedData = JSON.parse(jsonText);
        
        // 处理可能的嵌套结构
        if (Array.isArray(parsedData)) {
          questions = parsedData;
        } else if (parsedData.questions && Array.isArray(parsedData.questions)) {
          questions = parsedData.questions;
        } else {
          throw new Error('无法解析AI返回的题目数据');
        }
      } else {
        throw new Error('无法从AI响应中提取JSON数据');
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
      console.error('解析AI响应失败:', error);
      throw new Error('解析AI生成的题目失败，请重试');
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
  
  // 准备题库
  prepareQuestionBank() {
    const bank = {
      single: [],
      multiple: [],
      tf: [],
      short: []
    };
    
    // 根据专业领域添加题目
    if (this.fieldValue.includes('计算机') || this.fieldValue.includes('软件')) {
      // 单选题
      bank.single.push({
        content: '以下哪个排序算法的平均时间复杂度为O(nlogn)？',
        options: [
          '冒泡排序 - 通过相邻元素比较和交换，时间复杂度为O(n²)',
          '快速排序 - 使用分治法策略，平均时间复杂度为O(nlogn)',
          '插入排序 - 将元素逐个插入已排序序列，时间复杂度为O(n²)',
          '选择排序 - 每次选择最小元素放置到已排序序列末尾，时间复杂度为O(n²)'
        ],
        answer: 'B. 快速排序 - 使用分治法策略，平均时间复杂度为O(nlogn)<br><br><strong>解析：</strong>冒泡排序的平均时间复杂度为O(n²)，快速排序的平均时间复杂度为O(nlogn)，插入排序的平均时间复杂度为O(n²)，选择排序的平均时间复杂度为O(n²)。快速排序是一种分治策略的排序算法，通过选择基准元素将数组划分为两个子数组，然后递归排序子数组。尽管其最坏情况时间复杂度为O(n²)，但平均情况下表现为O(nlogn)，是实际应用中常用的高效排序算法。'
      });
      
      bank.single.push({
        content: '以下哪种数据结构最适合实现先进先出(FIFO)的操作？',
        options: [
          '栈(Stack) - 后进先出(LIFO)的数据结构',
          '队列(Queue) - 先进先出(FIFO)的数据结构',
          '二叉树(Binary Tree) - 具有层次结构的数据结构',
          '哈希表(Hash Table) - 基于键值对的数据结构'
        ],
        answer: 'B. 队列(Queue) - 先进先出(FIFO)的数据结构<br><br><strong>解析：</strong>队列是一种先进先出(FIFO)的线性数据结构，元素只能从队尾插入，从队首删除，非常适合实现先进先出的操作。栈是后进先出(LIFO)的数据结构，元素只能从栈顶插入和删除。二叉树是一种非线性数据结构，每个节点最多有两个子节点。哈希表是一种基于键值对的数据结构，通过哈希函数将键映射到特定位置。'
      });
      
      bank.single.push({
        content: 'TCP协议和UDP协议的主要区别是什么？',
        options: [
          'TCP是面向连接的，UDP是无连接的',
          'TCP比UDP传输速度更快',
          'UDP提供可靠的数据传输，TCP不提供',
          'TCP只用于局域网，UDP用于互联网'
        ],
        answer: 'A. TCP是面向连接的，UDP是无连接的<br><br><strong>解析：</strong>TCP(传输控制协议)是面向连接的协议，在数据传输前需要建立连接，提供可靠的数据传输服务，包括数据的顺序传输、错误检测和重传机制。UDP(用户数据报协议)是无连接的协议，不需要建立连接就可以发送数据，不保证数据的可靠传输，但传输速度更快，开销更小。TCP适用于要求可靠传输的场景，如文件传输、网页浏览等；UDP适用于实时性要求高的场景，如视频流、在线游戏等。'
      });
      
      // 多选题
      bank.multiple.push({
        content: '以下哪些是面向对象编程的特性？（可多选）',
        options: [
          '封装 - 将数据和方法绑定在一起，对外隐藏实现细节',
          '继承 - 允许子类获取父类的属性和方法，实现代码复用',
          '多态 - 同一操作作用于不同对象产生不同行为',
          '反射 - 在运行时检查和修改程序结构和行为的能力'
        ],
        answer: 'A, B, C. 封装、继承和多态<br><br><strong>解析：</strong>面向对象编程的三大基本特性是封装、继承和多态。<br>- 封装：将数据和操作数据的方法绑定在一起，对外部隐藏实现细节<br>- 继承：允许子类继承父类的属性和方法，实现代码复用<br>- 多态：同一操作作用于不同的对象，可以有不同的解释和产生不同的执行结果<br>反射是一种允许程序在运行时检查和修改自身结构和行为的能力，它是一些面向对象语言的特性，但不是面向对象编程的核心特性。'
      });
      
      bank.multiple.push({
        content: '以下哪些是常见的设计模式？（可多选）',
        options: [
          '单例模式 - 确保一个类只有一个实例，并提供一个全局访问点',
          '观察者模式 - 定义对象间的一种一对多依赖关系',
          '工厂模式 - 定义一个创建对象的接口，让子类决定实例化哪一个类',
          'HTML模式 - 一种用于构建网页的设计模式'
        ],
        answer: 'A, B, C. 单例模式、观察者模式和工厂模式<br><br><strong>解析：</strong>设计模式是软件设计中常见问题的典型解决方案。单例模式确保一个类只有一个实例，并提供一个全局访问点，常用于日志记录器、配置管理等。观察者模式定义了对象之间的一种一对多依赖关系，当一个对象状态改变时，所有依赖它的对象都会得到通知，常用于事件处理系统。工厂模式提供了创建对象的接口，但允许子类决定要实例化的类，常用于对象创建过程复杂的场景。"HTML模式"不是一种公认的设计模式。'
      });
      
      // 判断题
      bank.tf.push({
        content: 'JavaScript是一种强类型编程语言。（判断对错）',
        answer: 'B. 错误。<br><br><strong>解析：</strong>JavaScript是一种弱类型（或称动态类型）编程语言，这意味着变量的类型可以在运行时改变，不需要事先声明类型。例如，一个变量可以先赋值为字符串，然后再赋值为数字或其他类型。与之相对的是强类型语言（如Java、C++、TypeScript等），它们要求变量的类型在声明时确定，并且不允许随意改变。强类型系统可以在编译时捕获类型错误，而JavaScript的类型错误通常只能在运行时发现。'
      });
      
      bank.tf.push({
        content: 'HTTP是一种无状态协议。（判断对错）',
        answer: 'A. 正确。<br><br><strong>解析：</strong>HTTP(超文本传输协议)是一种无状态协议，这意味着服务器不会在不同请求之间保留客户端的信息。每个请求都是独立的，服务器不知道之前的请求。为了解决这个问题，Web应用程序使用各种技术来维护状态，如cookies、会话(session)、隐藏表单字段、URL参数等。这些技术允许在无状态的HTTP协议上构建有状态的应用程序。'
      });
      
      // 简答题
      bank.short.push({
        content: '简述HTTP和HTTPS的区别。（简答题）',
        answer: 'HTTP是超文本传输协议，而HTTPS是安全的超文本传输协议。区别主要有：1. HTTPS使用SSL/TLS加密数据传输；2. HTTP使用80端口，HTTPS使用443端口；3. HTTPS需要CA证书，而HTTP不需要；4. HTTPS比HTTP更安全，但性能略差。'
      });
      
      bank.short.push({
        content: '简述什么是RESTful API及其设计原则。（简答题）',
        answer: 'RESTful API是一种基于REST(表述性状态转移)架构风格的API设计方法。主要设计原则包括：1. 使用HTTP方法明确表示操作(GET获取资源，POST创建资源，PUT更新资源，DELETE删除资源)；2. 无状态性，每个请求包含所有必要信息；3. 资源的URI应清晰表示资源，而不是操作；4. 使用HTTP状态码表示请求结果；5. 返回JSON或XML等标准格式数据；6. 版本控制；7. 良好的错误处理和文档。RESTful API具有简单、可扩展、可靠和无状态等特点，广泛应用于Web服务开发。'
      });
    } else if (this.fieldValue.includes('医') || this.fieldValue.includes('生物')) {
      // 添加医学/生物学题目
      // ... 这里可以添加更多医学/生物学相关题目 ...
      
      // 单选题
      bank.single.push({
        content: '以下哪种维生素是水溶性的？（单选题）',
        options: [
          '维生素A - 脂溶性维生素，主要存在于动物肝脏和胡萝卜中',
          '维生素C - 水溶性维生素，主要存在于新鲜水果和蔬菜中',
          '维生素D - 脂溶性维生素，可以通过皮肤接触阳光合成',
          '维生素E - 脂溶性维生素，是重要的抗氧化剂'
        ],
        answer: 'B. 维生素C<br><br><strong>解析：</strong>维生素按溶解性可分为脂溶性和水溶性两类。维生素A、D、E、K是脂溶性维生素，而维生素C和B族维生素（如B1、B2、B6、B12等）是水溶性维生素。水溶性维生素在体内不易储存，多余的会通过尿液排出体外，因此需要经常从食物中补充。维生素C主要来源于新鲜蔬菜和水果，具有抗氧化、增强免疫力和促进胶原蛋白合成等作用。'
      });
      
      // 多选题
      bank.multiple.push({
        content: '以下哪些疾病是由病毒引起的？（可多选）',
        options: [
          '流感 - 由流感病毒引起的急性呼吸道传染病',
          '肺炎 - 通常由细菌如肺炎链球菌引起的肺部感染',
          '艾滋病 - 由人类免疫缺陷病毒(HIV)引起的免疫系统疾病',
          '霍乱 - 由霍乱弧菌引起的急性肠道传染病'
        ],
        answer: 'A, C. 流感和艾滋病<br><br><strong>解析：</strong>流感是由流感病毒引起的急性呼吸道传染病。艾滋病是由人类免疫缺陷病毒(HIV)引起的免疫系统疾病。肺炎可由多种病原体引起，包括细菌（如肺炎链球菌）、病毒、真菌等，但典型的肺炎通常是由细菌引起的。霍乱是由霍乱弧菌引起的急性肠道传染病，属于细菌性疾病，而非病毒性疾病。因此，流感和艾滋病是病毒性疾病，而典型的肺炎和霍乱是细菌性疾病。'
      });
      
      // 判断题
      bank.tf.push({
        content: '人体的正常体温是36-37摄氏度。（判断对错）',
        answer: 'A. 正确。<br><br><strong>解析：</strong>人体的正常体温范围在36-37摄氏度之间，平均约为36.5摄氏度。这是健康人体的正常温度范围，低于这个范围可能表示低体温症，高于这个范围则可能表示发热。体温受多种因素影响，包括一天中的时间（通常早晨较低，傍晚较高）、月经周期、运动、情绪状态等。体温是评估健康状况的重要指标之一，持续的异常体温可能是疾病的信号。'
      });
      
      // 简答题
      bank.short.push({
        content: '简述血液循环系统的主要组成部分及功能。（简答题）',
        answer: '血液循环系统主要由心脏、血管和血液组成。心脏作为泵，推动血液在血管中流动；血管分为动脉、静脉和毛细血管，用于运输血液；血液携带氧气、营养物质到组织和器官，并带走二氧化碳和废物。主要功能包括运输氧气和营养物质、调节体温、保护身体免受感染和维持体内平衡等。'
      });
    }
    
    // 可以继续添加其他领域的题目...
    
    return bank;
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
            alert('题目已成功保存到历史记录！');
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
      alert('题目已成功保存到历史记录！');
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
    // 检查当前API设置
    const settings = settingsPage.settings || {};
    const apiSettings = settings.api || {};
    
    // 如果API密钥不是默认的，且不为空，认为是自定义密钥
    return (apiSettings.key && 
           apiSettings.key !== TONGYI_API_KEY && 
           apiSettings.key !== DEEPSEEK_API_KEY && 
           apiSettings.key.trim() !== '');
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
      const storedData = localStorage.getItem('daily_generation_data');
      if (storedData) {
        try {
          const data = JSON.parse(storedData);
          dailyGenerationCount = data.count || 0;
          lastGenerationDate = data.date || null;
        } catch (error) {
          console.error('解析生成次数数据失败:', error);
        }
      }
    }
  },
  
  // 显示我花聊天气泡
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
  // 当前设置
  settings: {
    theme: {
      type: 'default',
      bgColor: '#f8f9fa',
      bgImageUrl: '',
      bgImageData: null,
      flowerEnabled: false // 添加我花选项
    },
    api: {
      provider: 'tongyi',
      key: '',
      endpoint: ''
    }
  },
  
  // 初始化页面
  init() {
    console.log('初始化设置页面');
    this.loadSettings();
    this.setupEventListeners();
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
      const storedSettings = localStorage.getItem('app_settings');
      
      if (storedSettings) {
        try {
          const parsedSettings = JSON.parse(storedSettings);
          this.settings = this.mergeSettings(this.settings, parsedSettings);
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
    
    // 监听密码显示切换
    const togglePassword = document.querySelector('.toggle-password');
    if (togglePassword) {
      togglePassword.addEventListener('click', () => {
        const apiKeyInput = document.getElementById('api-key');
        const icon = togglePassword.querySelector('i');
        
        if (apiKeyInput.type === 'password') {
          apiKeyInput.type = 'text';
          icon.classList.remove('bi-eye');
          icon.classList.add('bi-eye-slash');
        } else {
          apiKeyInput.type = 'password';
          icon.classList.remove('bi-eye-slash');
          icon.classList.add('bi-eye');
        }
      });
    }
    
    // 监听保存设置按钮
    const saveButton = document.getElementById('save-settings');
    if (saveButton) {
      saveButton.addEventListener('click', () => {
        this.saveSettings();
      });
    }
    
    // 监听重置设置按钮
    const resetButton = document.getElementById('reset-settings');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        pageManager.showCustomConfirm(
          '重置确认',
          '确定要重置所有设置为默认值吗？',
          () => {
            this.resetSettings();
          }
        );
      });
    }
    
    // 添加清除历史题目记录按钮的事件监听
    const clearHistoryButton = document.getElementById('clear-question-history');
    if (clearHistoryButton) {
      clearHistoryButton.addEventListener('click', () => {
        pageManager.showCustomConfirm(
          '清除确认',
          '确定要清除所有历史题目记录吗？这将允许系统重新生成这些题目。',
          () => {
            generatePage.clearUsedQuestionContents();
            pageManager.showCustomAlert('成功', '历史题目记录已清除，系统将可以重新生成这些题目。');
          }
        );
      });
    }
    
    // 监听赞助链接点击，确保在外部浏览器中打开
    const sponsorLink = document.getElementById('sponsor-link');
    if (sponsorLink) {
      sponsorLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (isElectron()) {
          // 使用Electron的shell.openExternal打开链接
          window.electronAPI.openExternal(sponsorLink.href);
        } else {
          // 在普通浏览器中打开
          window.open(sponsorLink.href, '_blank', 'noopener,noreferrer');
        }
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
  }
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