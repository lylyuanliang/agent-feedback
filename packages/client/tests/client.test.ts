import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// 准备测试环境下的全局 Mocks
class MockShadowRoot {
  public innerHTML = '';
  public elements: Map<string, any> = new Map();

  querySelector(selector: string): any {
    if (this.elements.has(selector)) {
      return this.elements.get(selector);
    }
    // 简易选择器查找
    const cleanSelector = selector.split('[')[0];
    if (cleanSelector.startsWith('.')) {
      const cls = cleanSelector.slice(1);
      if (this.innerHTML.includes(`class="${cls}`) || this.innerHTML.includes(`class="tab-btn ${cls}`) || this.innerHTML.includes(cls)) {
        const el = new MockElement(selector);
        this.elements.set(selector, el);
        return el;
      }
    }
    return null;
  }

  querySelectorAll(selector: string): any[] {
    const el = this.querySelector(selector);
    return el ? [el] : [];
  }
}

class MockElement {
  public tagName: string;
  public style: Record<string, any> = {};
  public classList = {
    classes: new Set<string>(),
    add: (c: string) => this.classList.classes.add(c),
    remove: (c: string) => this.classList.classes.delete(c),
    contains: (c: string) => this.classList.classes.has(c)
  };
  public value = '';
  public eventListeners: Record<string, Function[]> = {};
  public attributes: Map<string, string> = new Map();

  setAttribute(name: string, val: string) {
    const old = this.attributes.get(name);
    this.attributes.set(name, String(val));
    if (typeof (this as any).attributeChangedCallback === 'function') {
      (this as any).attributeChangedCallback(name, old, String(val));
    }
  }

  getAttribute(name: string) {
    return this.attributes.get(name) || null;
  }

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  addEventListener(event: string, handler: Function) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
    }
  }

  dispatchEvent(event: string, data?: any) {
    const handlers = this.eventListeners[event] || [];
    for (const h of handlers) {
      h(data || {});
    }
  }

  getBoundingClientRect() {
    return { left: 100, top: 200, width: 120, height: 40, right: 220, bottom: 240 };
  }
}

class MockHTMLElement extends MockElement {
  public shadowRoot: MockShadowRoot | null = null;

  constructor() {
    super('HTMLElement');
  }

  attachShadow(options: { mode: string }) {
    this.shadowRoot = new MockShadowRoot();
    return this.shadowRoot;
  }
}

// 模拟 CustomElementRegistry
const customElementRegistry = new Map<string, any>();
(globalThis as any).customElements = {
  get: (name: string) => customElementRegistry.get(name),
  define: (name: string, constructor: any) => customElementRegistry.set(name, constructor)
};
(globalThis as any).HTMLElement = MockHTMLElement;

// 模拟 window 和 navigator
(globalThis as any).window = {
  location: {
    pathname: '/mountains/detail',
    search: '?id=42',
    hash: '#reviews'
  },
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  addEventListener: () => {},
  removeEventListener: () => {}
};

Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    onLine: true
  },
  configurable: true,
  writable: true
});

(globalThis as any).document = {
  readyState: 'complete',
  body: {
    appendChild: (el: any) => el
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag: string) => {
    if (tag === 'agent-feedback-widget') {
      const cls = customElementRegistry.get('agent-feedback-widget') || MockHTMLElement;
      return new cls();
    }
    return new MockElement(tag);
  },
  addEventListener: () => {}
};

// 模拟原生 fetch (解决 Node 下相对 URL 抛出 ERR_INVALID_URL)
(globalThis as any).fetch = async (url: string, init?: any) => {
  return {
    ok: true,
    status: 200,
    json: async () => []
  };
};

// 引入待测客户端模块 (使用动态 import 保证全局 DOM Mock 先生效)
const {
  setupConsoleProxy,
  getRecentLogs,
  clearRecentLogs,
  detectPlatform,
  collectTelemetry,
  captureScreenshot,
  AgentFeedbackWidget,
  registerAgentFeedbackWidget,
  autoMountWidget,
  registerExtensionTab
} = await import('../src/index.ts');

describe('@agent-feedback/client Full-Spectrum Telemetry Engine', () => {
  beforeEach(() => {
    clearRecentLogs();
  });

  it('should intercept console.log, console.warn, console.error and preserve native behavior', () => {
    let nativeLogCalled = false;
    let nativeWarnCalled = false;
    let nativeErrorCalled = false;

    // 捕获测试过程中的原生输出
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    setupConsoleProxy();

    console.log('User navigated to mountain view', { mountainId: 42 });
    console.warn('Slow map tile response');
    console.error(new Error('Tile fetch failed'));

    const logs = getRecentLogs();
    assert.strictEqual(logs.length, 3);

    // 验证第 1 条 log
    assert.strictEqual(logs[0].type, 'log');
    assert.match(logs[0].message, /User navigated to mountain view/);
    assert.match(logs[0].message, /"mountainId":42/);
    assert.strictEqual(typeof logs[0].timestamp, 'number');

    // 验证第 2 条 warn
    assert.strictEqual(logs[1].type, 'warn');
    assert.strictEqual(logs[1].message, 'Slow map tile response');

    // 验证第 3 条 error 包含 stack
    assert.strictEqual(logs[2].type, 'error');
    assert.match(logs[2].message, /Tile fetch failed/);
    assert.ok(logs[2].stack, 'Error log should contain stack trace');
  });

  it('should maintain a circular ring buffer with a maximum capacity of 30 items', () => {
    setupConsoleProxy();

    // 写入 35 条日志
    for (let i = 1; i <= 35; i++) {
      console.log(`Log message #${i}`);
    }

    const logs = getRecentLogs();
    assert.strictEqual(logs.length, 30, 'Buffer must cap at exactly 30 entries');

    // 最早的 5 条 (1-5) 应该被丢弃，第 1 条应该是 #6，最后一条是 #35
    assert.strictEqual(logs[0].message, 'Log message #6');
    assert.strictEqual(logs[29].message, 'Log message #35');
  });

  it('should return a defensive copy in getRecentLogs', () => {
    setupConsoleProxy();
    console.log('Original message');

    const logs = getRecentLogs();
    assert.strictEqual(logs.length, 1);

    // 修改返回的数组和对象
    logs.pop();
    assert.strictEqual(logs.length, 0);

    // 再次获取，内部环形缓冲区不应受损
    const freshLogs = getRecentLogs();
    assert.strictEqual(freshLogs.length, 1);
    assert.strictEqual(freshLogs[0].message, 'Original message');
  });

  it('should clear the ring buffer completely with clearRecentLogs', () => {
    setupConsoleProxy();
    console.log('Msg 1');
    console.warn('Msg 2');
    assert.strictEqual(getRecentLogs().length, 2);

    clearRecentLogs();
    assert.strictEqual(getRecentLogs().length, 0);
  });
});

describe('@agent-feedback/client Platform & Telemetry Extractor', () => {
  it('should detect platforms correctly based on userAgent and runtime flags', () => {
    // iOS
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
      'ios'
    );
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)'),
      'ios'
    );

    // Android
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36'),
      'android'
    );

    // Desktop app (Electron / Tauri / explicit desktop)
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/28.1.0'),
      'desktop'
    );
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 Tauri/1.5 (X11; Linux x86_64)'),
      'desktop'
    );

    // Standard Desktop Browser (Web)
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'),
      'web'
    );
    assert.strictEqual(
      detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'),
      'web'
    );
  });

  it('should extract comprehensive telemetry snapshot from current environment', () => {
    (globalThis as any).window.location = {
      pathname: '/mountains/detail',
      search: '?id=42',
      hash: '#reviews'
    };
    (globalThis as any).window.innerWidth = 412;
    (globalThis as any).window.innerHeight = 915;
    (globalThis as any).window.devicePixelRatio = 2.625;
    (globalThis as any).navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';
    (globalThis as any).navigator.onLine = true;

    const telemetry = collectTelemetry();

    assert.strictEqual(telemetry.route, '/mountains/detail?id=42#reviews');
    assert.strictEqual(telemetry.viewport.width, 412);
    assert.strictEqual(telemetry.viewport.height, 915);
    assert.strictEqual(telemetry.viewport.dpr, 2.625);
    assert.strictEqual(telemetry.platform, 'android');
    assert.strictEqual(telemetry.network?.online, true);
    assert.strictEqual(telemetry.userAgent, 'Mozilla/5.0 (Linux; Android 14; Pixel 8)');
  });

  it('should safely fallback when window or navigator properties are missing', () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = undefined;

    const telemetry = collectTelemetry();
    assert.strictEqual(telemetry.route, '/');
    assert.strictEqual(telemetry.viewport.width, 1920);
    assert.strictEqual(telemetry.viewport.height, 1080);
    assert.strictEqual(telemetry.viewport.dpr, 1);

    (globalThis as any).window = originalWindow;
  });

  it('should handle captureScreenshot gracefully without throwing in Node environment', async () => {
    const screenshot = await captureScreenshot();
    // 在无真实 Canvas/DOM 环境下安全返回 null，不抛出任何异常
    assert.strictEqual(screenshot, null);
  });
});

describe('@agent-feedback/client <agent-feedback-widget> Web Component', () => {
  it('should register <agent-feedback-widget> Custom Element and auto mount', () => {
    registerAgentFeedbackWidget();
    const registered = (globalThis as any).customElements.get('agent-feedback-widget');
    assert.ok(registered, 'Custom element should be registered');

    autoMountWidget();
  });

  it('should instantiate and render Shadow DOM with Scoped CSS isolation', () => {
    const widget = new AgentFeedbackWidget();
    assert.ok(widget.shadow, 'Shadow root must be created');

    widget.connectedCallback();

    // 检查 Shadow DOM 渲染内容
    assert.ok(widget.shadow.innerHTML.includes(':host'), 'Must contain scoped host styles');
    assert.ok(widget.shadow.innerHTML.includes('pill-trigger'), 'Must render floating pill');
    assert.ok(widget.shadow.innerHTML.includes('反馈给 AI'), 'Must render pill label');
    assert.ok(widget.shadow.innerHTML.includes('modal-backdrop'), 'Must render modal backdrop');
    assert.ok(widget.shadow.innerHTML.includes('新建反馈'), 'Must render submit tab');
    assert.ok(widget.shadow.innerHTML.includes('历史与进度'), 'Must render history tab');
  });

  it('should support toggleModal and tab switching', () => {
    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();

    // 初始状态弹窗关闭
    assert.ok(widget.shadow.innerHTML.includes('display: none'), 'Modal should be closed by default');

    // 呼出弹窗
    widget.toggleModal(true);
    assert.ok(widget.shadow.innerHTML.includes('display: flex'), 'Modal should be open');

    // 切换至历史 Tab
    widget.setTab('history');
    assert.ok(widget.shadow.innerHTML.includes('共 0 条记录') || widget.shadow.innerHTML.includes('暂无反馈记录'));

    // 切换回新建 Tab
    widget.setTab('submit');
    assert.ok(widget.shadow.innerHTML.includes('问题描述 / 优化建议'));

    // 关闭弹窗
    widget.toggleModal(false);
    assert.ok(widget.shadow.innerHTML.includes('display: none'));
  });

  it('should reject empty submission with friendly prompt', async () => {
    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();
    widget.toggleModal(true);

    // 尝试直接提交空内容
    await widget.submitFeedback();

    assert.ok(widget.shadow.innerHTML.includes('请填写反馈内容'), 'Should warn when submitting empty content');
  });

  it('should submit feedback via fetch to /api/__agent_feedback/submit', async () => {
    let fetchCalled = false;
    let postedUrl = '';
    let postedBody: any = null;

    (globalThis as any).fetch = async (url: string, init?: any) => {
      fetchCalled = true;
      postedUrl = url;
      postedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ success: true, id: postedBody.id })
      };
    };

    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();
    widget.toggleModal(true);

    // 模拟用户在文本框输入
    (widget as any).feedbackContent = '移动端真机顶部导航栏在刘海屏下有 5px 遮挡';

    await widget.submitFeedback();

    assert.strictEqual(fetchCalled, true);
    assert.strictEqual(postedUrl, '/api/__agent_feedback/submit');
    assert.strictEqual(postedBody.content, '移动端真机顶部导航栏在刘海屏下有 5px 遮挡');
    assert.strictEqual(postedBody.status, 'pending');
    assert.ok(postedBody.telemetry, 'Telemetry must be included');
    assert.ok(postedBody.consoleLogs, 'Console logs must be included');

    // 成功提示展示
    assert.ok(widget.shadow.innerHTML.includes('反馈已递交！'));
  });

  it('should load history and render items and agent replies from /api/__agent_feedback/list', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url === '/api/__agent_feedback/list') {
        return {
          ok: true,
          json: async () => [
            {
              id: 1793000000001,
              content: '首屏地图加载慢',
              status: 'completed',
              receivedAt: '2026-10-28T10:00:00.000Z',
              reply: '已为高德瓦片添加本地 IndexedDB 缓存'
            },
            {
              id: 1793000000002,
              content: '搜索栏在深色模式下背景色太刺眼',
              status: 'processing',
              receivedAt: '2026-10-28T10:05:00.000Z'
            }
          ]
        };
      }
      return { ok: false };
    };

    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();
    widget.setTab('history');
    await widget.loadHistory();

    assert.ok(widget.shadow.innerHTML.includes('共 2 条记录'));
    assert.ok(widget.shadow.innerHTML.includes('首屏地图加载慢'));
    assert.ok(widget.shadow.innerHTML.includes('✓ 修复完成'));
    assert.ok(widget.shadow.innerHTML.includes('已为高德瓦片添加本地 IndexedDB 缓存'));
    assert.ok(widget.shadow.innerHTML.includes('搜索栏在深色模式下背景色太刺眼'));
    assert.ok(widget.shadow.innerHTML.includes('AI 修复中'));
  });

  it('should inject Theme Token System CSS variables and support theme switching', () => {
    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();

    const html = widget.shadow.innerHTML;
    assert.ok(html.includes('--af-primary: #4edea3'));
    assert.ok(html.includes('--af-bg-base: #12151c'));
    assert.ok(html.includes('--af-bg-surface: #181f2a'));
    assert.ok(html.includes('--af-text-main: #f3f4f6'));
    assert.ok(html.includes('--af-text-muted: #9ca3af'));
    assert.ok(html.includes('--af-border: rgba(255, 255, 255, 0.08)'));
    assert.ok(html.includes('--af-radius: 12px'));
    assert.ok(html.includes(':host([theme="light"])'));
    assert.ok(html.includes('--af-primary: #2563eb'));

    // 静态方法与属性切换
    AgentFeedbackWidget.setTheme('light');
    assert.strictEqual(AgentFeedbackWidget.getTheme(), 'light');

    widget.setAttribute('theme', 'dark');
    assert.strictEqual(widget.getAttribute('theme'), 'dark');
    AgentFeedbackWidget.setTheme('dark');
  });

  it('should render streaming timeline UI grouped by date with notice card highlight and pagination', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url === '/api/__agent_feedback/dates') {
        return {
          ok: true,
          json: async () => ({
            dates: ['2026-10-28', '2026-10-27'],
            totalCount: 3,
            latestDate: '2026-10-28'
          })
        };
      }
      if (url.includes('date=2026-10-28') || url === '/api/__agent_feedback/list') {
        return {
          ok: true,
          json: async () => [
            {
              id: 2001,
              type: 'user_feedback',
              content: '今日地图瓦片模糊',
              status: 'pending',
              receivedAt: '2026-10-28T09:00:00.000Z',
              date: '2026-10-28'
            },
            {
              id: 2002,
              type: 'agent_notice',
              content: 'Agent 修复通知：已切换高分瓦片服务',
              status: 'completed',
              reply: '已自动部署',
              receivedAt: '2026-10-28T10:00:00.000Z',
              date: '2026-10-28'
            }
          ]
        };
      }
      if (url.includes('date=2026-10-27')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 1999,
              type: 'user_feedback',
              content: '昨日离线包下载中断',
              status: 'completed',
              receivedAt: '2026-10-27T15:00:00.000Z',
              date: '2026-10-27'
            }
          ]
        };
      }
      return { ok: false };
    };

    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();
    widget.setTab('history');
    await widget.loadHistory();

    const html = widget.shadow.innerHTML;
    // 验证时间轴元素
    assert.ok(html.includes('timeline-day-group'));
    assert.ok(html.includes('timeline-dot'));
    assert.ok(html.includes('timeline-v-line'));
    assert.ok(html.includes('2026-10-28'));
    assert.ok(html.includes('当日共 2 条'));

    // 验证 Agent 系统通知高光卡片与徽章
    assert.ok(html.includes('card-agent-notice'));
    assert.ok(html.includes('🤖 Agent 系统通知'));
    assert.ok(html.includes('Agent 修复通知：已切换高分瓦片服务'));

    // 验证加载前一天记录按钮
    assert.ok(html.includes('btn-load-previous-day'));
    assert.ok(html.includes('2026-10-27'));

    // 点击加载前一天记录
    await widget.loadPreviousDay();
    const updatedHtml = widget.shadow.innerHTML;
    assert.ok(updatedHtml.includes('2026-10-27'));
    assert.ok(updatedHtml.includes('昨日离线包下载中断'));
  });

  it('should support extension tabs API with dynamic header tabs, container render, and lifecycle cleanup', () => {
    let cleanupCalled = false;
    let renderContext: any = null;
    let renderContainer: any = null;

    registerExtensionTab({
      id: 'custom-diagnostics',
      label: '设备诊断',
      icon: '🩺',
      badge: 5,
      render: (container, context) => {
        renderContainer = container;
        renderContext = context;
        return () => {
          cleanupCalled = true;
        };
      }
    });

    const widget = new AgentFeedbackWidget();
    widget.connectedCallback();
    widget.toggleModal(true);

    // 验证 Header 动态渲染了自定义 Tab
    const html = widget.shadow.innerHTML;
    assert.ok(html.includes('tab-btn-custom-diagnostics'));
    assert.ok(html.includes('设备诊断'));
    assert.ok(html.includes('🩺'));
    assert.ok(html.includes('5'));

    // 切换至自定义 Tab
    widget.setTab('custom-diagnostics');
    assert.ok(widget.shadow.innerHTML.includes('ext-tab-container'));
    assert.ok(widget.shadow.innerHTML.includes('data-tab-id="custom-diagnostics"'));
    assert.ok(renderContainer, 'Container should be passed to render');
    assert.strictEqual(typeof renderContext.closeModal, 'function');
    assert.strictEqual(typeof renderContext.openTab, 'function');

    // 切换离开时触发清理函数
    widget.setTab('submit');
    assert.strictEqual(cleanupCalled, true, 'Extension cleanup should be invoked when tab switches');
  });
});
