/**
 * @agent-feedback/client
 * In-App Agent Feedback Bridge - Shadow DOM Web Component & Telemetry Client
 */

import type {
  InAppFeedback,
  ConsoleLogEntry,
  TelemetrySnapshot,
  PlatformType,
  FeedbackStatus,
  FeedbackTheme,
  FeedbackExtensionTab,
  ExtensionContext
} from '@agent-feedback/core';

export type {
  InAppFeedback,
  ConsoleLogEntry,
  TelemetrySnapshot,
  PlatformType,
  FeedbackStatus,
  FeedbackTheme,
  FeedbackExtensionTab,
  ExtensionContext
};

// 全局扩展槽注册表
if (typeof window !== 'undefined') {
  (window as any).__AGENT_FEEDBACK_EXTENSIONS__ = (window as any).__AGENT_FEEDBACK_EXTENSIONS__ || [];
}

/**
 * 注册自定义扩展 Tab
 */
export function registerExtensionTab(tab: FeedbackExtensionTab): void {
  if (typeof window === 'undefined') return;
  const list: FeedbackExtensionTab[] = (window as any).__AGENT_FEEDBACK_EXTENSIONS__ || [];
  const idx = list.findIndex(t => t.id === tab.id);
  if (idx >= 0) {
    list[idx] = tab;
  } else {
    list.push(tab);
  }
  (window as any).__AGENT_FEEDBACK_EXTENSIONS__ = list;

  // 通知页面上已挂载的组件刷新
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    const widgets = document.querySelectorAll('agent-feedback-widget');
    widgets.forEach((w: any) => {
      if (typeof w.refreshWidget === 'function') {
        w.refreshWidget();
      }
    });
  }
}

/**
 * 设置全域 API 基地址 (用于移动端真机、内网穿透或原生容器环境)
 */
export function setApiBase(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = (url || '').trim().replace(/\/+$/, '');
  (window as any).__AGENT_FEEDBACK_API_BASE__ = clean;

  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    const widgets = document.querySelectorAll('agent-feedback-widget');
    widgets.forEach((w: any) => {
      if (typeof (w as any).setApiBase === 'function') {
        (w as any).setApiBase(clean);
      }
    });
  }
}

/**
 * 获取当前配置的 API 基地址
 */
export function getApiBase(): string {
  if (typeof window !== 'undefined' && (window as any).__AGENT_FEEDBACK_API_BASE__) {
    return (window as any).__AGENT_FEEDBACK_API_BASE__;
  }
  return '';
}

/**
 * 编程范式呼出反馈弹窗
 */
export function openFeedbackModal(tab: 'submit' | 'history' | string = 'submit'): void {
  if (typeof document === 'undefined') return;
  const widget = document.querySelector('agent-feedback-widget') as any;
  if (widget) {
    if (typeof widget.toggleModal === 'function') {
      widget.toggleModal(true);
    }
    if (typeof widget.setTab === 'function') {
      widget.setTab(tab);
    }
  }
}

/**
 * 编程范式关闭反馈弹窗
 */
export function closeFeedbackModal(): void {
  if (typeof document === 'undefined') return;
  const widget = document.querySelector('agent-feedback-widget') as any;
  if (widget && typeof widget.toggleModal === 'function') {
    widget.toggleModal(false);
  }
}

if (typeof window !== 'undefined') {
  (window as any).openAgentFeedbackModal = openFeedbackModal;
  (window as any).closeAgentFeedbackModal = closeFeedbackModal;
}

// 内存中的控制台日志环形缓冲区 (最大 30 条)
const MAX_LOGS = 30;
const logRingBuffer: ConsoleLogEntry[] = [];
let isConsoleProxied = false;
let origLog: typeof console.log | null = null;
let origWarn: typeof console.warn | null = null;
let origError: typeof console.error | null = null;

/**
 * 格式化参数并安全转为日志文本
 */
function formatLogArgs(args: any[]): { message: string; stack?: string } {
  let stack: string | undefined = undefined;
  const parts: string[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      if (!stack && arg.stack) {
        stack = arg.stack;
      }
      parts.push(arg.stack || arg.message || String(arg));
    } else if (typeof arg === 'object' && arg !== null) {
      try {
        parts.push(JSON.stringify(arg));
      } catch {
        parts.push(String(arg));
      }
    } else {
      parts.push(String(arg));
    }
  }

  return { message: parts.join(' '), stack };
}

/**
 * 内部记录日志至环形缓冲区
 */
function pushLogToRingBuffer(type: 'log' | 'warn' | 'error', args: any[]) {
  try {
    const { message, stack } = formatLogArgs(args);
    const entry: ConsoleLogEntry = {
      type,
      message,
      timestamp: Date.now(),
      ...(stack ? { stack } : {})
    };

    logRingBuffer.push(entry);
    if (logRingBuffer.length > MAX_LOGS) {
      logRingBuffer.shift();
    }
  } catch {
    // 容错处理，保障业务不崩溃
  }
}

/**
 * 设置控制台全息代理，拦截 log, warn, error 到 30 条环形缓冲区，并保留原生输出行为
 */
export function setupConsoleProxy(): void {
  if (isConsoleProxied || typeof console === 'undefined') {
    return;
  }

  origLog = console.log;
  origWarn = console.warn;
  origError = console.error;

  console.log = function (...args: any[]) {
    pushLogToRingBuffer('log', args);
    origLog?.apply(console, args);
  };

  console.warn = function (...args: any[]) {
    pushLogToRingBuffer('warn', args);
    origWarn?.apply(console, args);
  };

  console.error = function (...args: any[]) {
    pushLogToRingBuffer('error', args);
    origError?.apply(console, args);
  };

  // 在浏览器中捕获全局未捕获异常
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('error', (event: any) => {
      pushLogToRingBuffer('error', [event.message || 'Uncaught Error', event.error]);
    });
    window.addEventListener('unhandledrejection', (event: any) => {
      pushLogToRingBuffer('error', ['Unhandled Promise Rejection:', event.reason]);
    });
  }

  isConsoleProxied = true;
}

/**
 * 获取当前环形缓冲区中的控制台日志快照副本
 */
export function getRecentLogs(): ConsoleLogEntry[] {
  return logRingBuffer.map(entry => ({ ...entry }));
}

/**
 * 清空环形缓冲区中的控制台日志
 */
export function clearRecentLogs(): void {
  logRingBuffer.length = 0;
}

/**
 * 检测运行平台: 'ios' | 'android' | 'web' | 'desktop'
 */
export function detectPlatform(userAgent: string = ''): PlatformType {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  if (/Electron|Tauri|desktop/i.test(ua)) {
    return 'desktop';
  }
  if (typeof window !== 'undefined') {
    const win = window as any;
    if (win.__TAURI__ || win.process?.type === 'renderer' || win.electron) {
      return 'desktop';
    }
  }

  return 'web';
}

/**
 * 采集端侧全息遥测快照
 */
export function collectTelemetry(): TelemetrySnapshot {
  const win = typeof window !== 'undefined' ? window : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  const ua = nav?.userAgent || '';
  const route = win?.location
    ? (win.location.pathname || '') + (win.location.search || '') + (win.location.hash || '')
    : '/';

  const width = win?.innerWidth ?? 1920;
  const height = win?.innerHeight ?? 1080;
  const dpr = win?.devicePixelRatio ?? 1;
  const online = nav?.onLine ?? true;

  return {
    route: route || '/',
    viewport: {
      width,
      height,
      dpr
    },
    userAgent: ua,
    platform: detectPlatform(ua),
    network: {
      online
    }
  };
}

/**
 * 轻量端侧截图辅助函数
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  try {
    const width = window.innerWidth || 390;
    const height = window.innerHeight || 844;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#12151c';
    ctx.fillRect(0, 0, width, height);

    const docClone = document.documentElement.cloneNode(true) as HTMLElement;
    const widgetInClone = docClone.querySelector('agent-feedback-widget');
    if (widgetInClone) {
      widgetInClone.remove();
    }

    const svgData = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#12151c;color:#fff;">
            ${docClone.innerHTML.slice(0, 50000)}
          </div>
        </foreignObject>
      </svg>
    `;
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    return await new Promise<string>((resolve) => {
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

// 防御性基类：若运行在纯 Node 环境下未 mock HTMLElement，不直接报错
const CustomElementBase: { new (): HTMLElement } =
  typeof HTMLElement !== 'undefined'
    ? HTMLElement
    : (class {} as any);

/**
 * <agent-feedback-widget> Custom Element
 * 采用 Open Shadow DOM 实现 100% Scoped CSS 样式隔离
 */
export class AgentFeedbackWidget extends CustomElementBase {
  private static globalTheme: FeedbackTheme = 'dark';

  /**
   * 静态方法：全局切换主题
   */
  public static setTheme(theme: FeedbackTheme): void {
    AgentFeedbackWidget.globalTheme = theme;
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const widgets = document.querySelectorAll('agent-feedback-widget');
      widgets.forEach((w: any) => {
        if (typeof w.setAttribute === 'function') {
          w.setAttribute('theme', theme);
        }
      });
    }
  }

  /**
   * 静态方法：获取当前主题
   */
  public static getTheme(): FeedbackTheme {
    return AgentFeedbackWidget.globalTheme;
  }

  static get observedAttributes() {
    return ['theme', 'primary-color', 'api-base'];
  }

  public shadow: ShadowRoot;
  public apiBase: string = '';
  private isOpen = false;
  private activeTab: string = 'submit';
  private hasProcessingItems = false;

  // 拖拽与磁吸边缘贴靠状态
  private isDragging = false;
  private startPointerX = 0;
  private startPointerY = 0;
  private initialLeft = 0;
  private initialTop = 0;
  private currentLeft: number | null = null;
  private currentTop: number | null = null;
  private dragThresholdMoved = false;
  private modalOpenedAt = 0;

  // 表单状态
  private feedbackContent = '';
  private attachedScreenshots: string[] = [];
  private isSubmitting = false;
  private submitFeedbackMessage: { type: 'success' | 'error'; text: string } | null = null;

  // 历史时间轴状态
  private datesList: string[] = [];
  private loadedDates: Map<string, InAppFeedback[]> = new Map();
  private currentDateIndex = 0;
  private totalTicketsCount = 0;
  private historyList: InAppFeedback[] = [];
  private isLoadingHistory = false;

  // 扩展槽生命周期清理钩子
  private extensionCleanups: Map<string, () => void> = new Map();

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.shadow = this.attachShadow({ mode: 'open' });
    } else {
      this.shadow = (this as any).shadowRoot || ({} as any);
    }
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'theme') {
      this.render();
      this.bindEvents();
    } else if (name === 'primary-color') {
      if ((this as any).style) {
        (this as any).style.setProperty('--af-primary', newValue || '#4edea3');
      }
    } else if (name === 'api-base') {
      this.apiBase = (newValue || '').trim().replace(/\/+$/, '');
      this.fetchHistoryQuickStatus();
    }
  }

  public setApiBase(url: string) {
    this.apiBase = (url || '').trim().replace(/\/+$/, '');
    this.fetchHistoryQuickStatus();
  }

  public getApiUrl(endpoint: string): string {
    const base = this.apiBase || getApiBase();
    if (!base) return endpoint;
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanPath}`;
  }

  connectedCallback() {
    // 初始化主题与 API 基地址
    const injectedOptions = typeof window !== 'undefined' ? (window as any).__AGENT_FEEDBACK_OPTIONS__ : undefined;
    const initialTheme: FeedbackTheme =
      (this.getAttribute?.('theme') as FeedbackTheme) ||
      injectedOptions?.theme ||
      AgentFeedbackWidget.globalTheme ||
      'dark';

    if (this.setAttribute && !this.getAttribute?.('theme')) {
      this.setAttribute('theme', initialTheme);
    }

    if (injectedOptions?.primaryColor && (this as any).style) {
      (this as any).style.setProperty('--af-primary', injectedOptions.primaryColor);
    }

    const initialApiBase =
      this.getAttribute?.('api-base') ||
      injectedOptions?.apiBase ||
      getApiBase() ||
      '';
    this.apiBase = initialApiBase.trim().replace(/\/+$/, '');

    this.render();
    this.bindEvents();
    this.fetchHistoryQuickStatus();
  }

  disconnectedCallback() {
    this.cleanupExtensionTabs();
  }

  public refreshWidget() {
    this.render();
    this.bindEvents();
  }

  private cleanupExtensionTabs() {
    for (const cleanup of this.extensionCleanups.values()) {
      try {
        cleanup();
      } catch {}
    }
    this.extensionCleanups.clear();
  }

  /**
   * 快速检查是否有处理中状态，控制呼吸灯
   */
  private async fetchHistoryQuickStatus() {
    if (typeof fetch === 'undefined') return;
    try {
      const res = await fetch(this.getApiUrl('/api/__agent_feedback/list'));
      if (res.ok) {
        const data = await res.json();
        const list: InAppFeedback[] = Array.isArray(data) ? data : data.list || [];
        this.historyList = list;
        this.hasProcessingItems = list.some(i => i.status === 'processing' || i.status === 'pending');
        this.updatePillIndicator();
      }
    } catch {
      // 离线或后端未就绪
    }
  }

  /**
   * 刷新呼吸灯显示
   */
  private updatePillIndicator() {
    const dot = this.shadow?.querySelector?.('.pill-dot');
    if (dot) {
      if (this.hasProcessingItems) {
        dot.classList?.add('pulsing');
      } else {
        dot.classList?.remove('pulsing');
      }
    }
  }

  /**
   * 切换弹窗展开/关闭
   */
  public toggleModal(open?: boolean) {
    this.isOpen = typeof open === 'boolean' ? open : !this.isOpen;
    if (this.isOpen) {
      this.modalOpenedAt = Date.now();
    }
    this.submitFeedbackMessage = null;
    this.render();
    this.bindEvents();

    if (this.isOpen && this.activeTab === 'history') {
      this.loadHistory();
    }
  }

  /**
   * 切换 Tab
   */
  public setTab(tab: string) {
    this.cleanupExtensionTabs();
    this.activeTab = tab;
    this.submitFeedbackMessage = null;
    this.render();
    this.bindEvents();
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  /**
   * 加载历史时间轴数据
   */
  public async loadHistory() {
    if (typeof fetch === 'undefined') return;
    this.isLoadingHistory = true;
    this.render();
    this.bindEvents();

    try {
      // 1. 获取日级索引
      try {
        const datesRes = await fetch(this.getApiUrl('/api/__agent_feedback/dates'));
        if (datesRes.ok) {
          const datesData = await datesRes.json();
          this.datesList = Array.isArray(datesData?.dates) ? datesData.dates : [];
          this.totalTicketsCount = typeof datesData?.totalCount === 'number' ? datesData.totalCount : 0;
        }
      } catch {}

      // 2. 加载首屏数据 (最新一天工单)
      const query = this.datesList.length > 0 ? `?date=${encodeURIComponent(this.datesList[0])}` : '';
      const res = await fetch(this.getApiUrl(`/api/__agent_feedback/list${query}`));
      if (res.ok) {
        const data = await res.json();
        const list: InAppFeedback[] = Array.isArray(data) ? data : data.list || [];
        this.loadedDates.clear();
        this.currentDateIndex = 0;

        if (this.datesList.length > 0) {
          this.loadedDates.set(this.datesList[0], list);
        } else if (list.length > 0) {
          // 兜底：直接按条目内部 date 分组
          for (const item of list) {
            const d = item.date || (item.receivedAt ? item.receivedAt.slice(0, 10) : '今日');
            if (!this.loadedDates.has(d)) this.loadedDates.set(d, []);
            this.loadedDates.get(d)!.push(item);
          }
        }

        this.historyList = list;
        this.hasProcessingItems = list.some(i => i.status === 'processing' || i.status === 'pending');
        if (this.totalTicketsCount === 0) {
          this.totalTicketsCount = list.length;
        }
      }
    } catch (err: any) {
      console.warn('[agent-feedback] Failed to load history:', err);
    } finally {
      this.isLoadingHistory = false;
      this.render();
      this.bindEvents();
    }
  }

  /**
   * 加载前一天历史记录
   */
  public async loadPreviousDay() {
    if (typeof fetch === 'undefined') return;
    if (this.currentDateIndex + 1 >= this.datesList.length) return;

    this.currentDateIndex++;
    const prevDate = this.datesList[this.currentDateIndex];
    try {
      const res = await fetch(this.getApiUrl(`/api/__agent_feedback/list?date=${encodeURIComponent(prevDate)}`));
      if (res.ok) {
        const list: InAppFeedback[] = await res.json();
        if (Array.isArray(list)) {
          this.loadedDates.set(prevDate, list);
        }
      }
    } catch (err: any) {
      console.warn('[agent-feedback] Failed to load previous day:', err);
    } finally {
      this.render();
      this.bindEvents();
    }
  }

  /**
   * 提交反馈至 DevServer
   */
  public async submitFeedback() {
    const content = this.feedbackContent.trim();
    if (!content) {
      this.submitFeedbackMessage = { type: 'error', text: '请填写反馈内容' };
      this.render();
      this.bindEvents();
      return;
    }

    this.isSubmitting = true;
    this.submitFeedbackMessage = null;
    this.render();
    this.bindEvents();

    try {
      const telemetry = collectTelemetry();
      const consoleLogs = getRecentLogs();
      const payload: Partial<InAppFeedback> = {
        id: Date.now(),
        type: 'user_feedback',
        timestamp: Date.now(),
        receivedAt: new Date().toISOString(),
        content,
        status: 'pending',
        telemetry,
        consoleLogs,
        ...(this.attachedScreenshots.length > 0 ? { screenshots: this.attachedScreenshots } : {})
      };

      const res = await fetch(this.getApiUrl('/api/__agent_feedback/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let resJson: any = null;
      try {
        resJson = await res.json();
      } catch {
        resJson = null;
      }

      if (!res.ok || !resJson || resJson.success !== true) {
        throw new Error(resJson?.error || resJson?.message || `提交异常 (HTTP ${res.status})`);
      }

      this.feedbackContent = '';
      this.attachedScreenshots = [];
      this.submitFeedbackMessage = {
        type: 'success',
        text: '反馈已递交！AI Agent 哨兵将在 10 秒防抖后自动唤醒分析修复。'
      };
      this.hasProcessingItems = true;
      this.isSubmitting = false;

      this.render();
      this.bindEvents();

      // 自动切到历史进度
      const autoSwitchTimer = setTimeout(() => {
        if (this.isOpen) {
          this.setTab('history');
        }
      }, 1500);
      if (typeof (autoSwitchTimer as any)?.unref === 'function') {
        (autoSwitchTimer as any).unref();
      }
    } catch (err: any) {
      this.isSubmitting = false;
      this.submitFeedbackMessage = {
        type: 'error',
        text: `提交失败: ${err.message || '网络连接异常'}`
      };
      this.render();
      this.bindEvents();
    }
  }

  /**
   * 绑定 DOM 事件（包括手势拖拽、磁吸贴边与各按钮交互）
   */
  private bindEvents() {
    if (!this.shadow) return;

    // 1. 胶囊按钮点击与拖拽
    const pill = this.shadow.querySelector?.('.pill-trigger') as HTMLElement;
    if (pill) {
      let isPointerActive = false;
      let hasMoved = false;
      let startX = 0;
      let startY = 0;
      let initLeft = 0;
      let initTop = 0;
      let pillWidth = 120;
      let pillHeight = 40;

      const onPointerStart = (clientX: number, clientY: number) => {
        isPointerActive = true;
        hasMoved = false;
        startX = clientX;
        startY = clientY;

        const rect = pill.getBoundingClientRect ? pill.getBoundingClientRect() : { left: 0, top: 0, width: 120, height: 40 };
        initLeft = rect.left;
        initTop = rect.top;
        pillWidth = rect.width || 120;
        pillHeight = rect.height || 40;

        if (pill.style) pill.style.transition = 'none';
      };

      const onPointerMove = (clientX: number, clientY: number) => {
        if (!isPointerActive) return;
        const dx = clientX - startX;
        const dy = clientY - startY;

        if (Math.hypot(dx, dy) > 10) {
          hasMoved = true;
        }

        if (!hasMoved) return;

        const winW = typeof window !== 'undefined' ? window.innerWidth : 400;
        const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

        let newLeft = Math.max(10, Math.min(winW - pillWidth - 10, initLeft + dx));
        let newTop = Math.max(10, Math.min(winH - pillHeight - 10, initTop + dy));

        this.currentLeft = newLeft;
        this.currentTop = newTop;

        if (pill.style) {
          pill.style.left = `${newLeft}px`;
          pill.style.top = `${newTop}px`;
          pill.style.right = 'auto';
          pill.style.bottom = 'auto';
        }
      };

      const onPointerEnd = (e?: PointerEvent) => {
        if (!isPointerActive) return;
        isPointerActive = false;

        if (hasMoved) {
          // 吸附贴边
          if (pill.style) {
            pill.style.transition = 'left 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
            const winW = typeof window !== 'undefined' ? window.innerWidth : 400;
            const centerX = (this.currentLeft ?? initLeft) + pillWidth / 2;

            if (centerX < winW / 2) {
              this.currentLeft = 16;
              pill.style.left = '16px';
            } else {
              const rightSnap = winW - pillWidth - 16;
              this.currentLeft = rightSnap;
              pill.style.left = `${rightSnap}px`;
            }
          }
          setTimeout(() => {
            hasMoved = false;
          }, 250);
        } else {
          // 未发生有效拖拽，直接响应点击打开弹窗！
          if (e && typeof e.preventDefault === 'function') {
            try { e.preventDefault(); } catch {}
          }
          this.toggleModal(true);
        }
      };

      // 绑定 Pointer Events (现代浏览器与移动端 WebView 统一推荐标准)
      pill.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        onPointerStart(e.clientX, e.clientY);
        if (typeof pill.setPointerCapture === 'function') {
          try { pill.setPointerCapture(e.pointerId); } catch {}
        }
      });

      pill.addEventListener('pointermove', (e: PointerEvent) => {
        onPointerMove(e.clientX, e.clientY);
      });

      const handlePointerUp = (e: PointerEvent) => {
        if (typeof pill.releasePointerCapture === 'function') {
          try { pill.releasePointerCapture(e.pointerId); } catch {}
        }
        if (!hasMoved && typeof e.preventDefault === 'function') {
          try { e.preventDefault(); } catch {}
        }
        onPointerEnd(e);
      };

      pill.addEventListener('pointerup', handlePointerUp);
      pill.addEventListener('pointercancel', handlePointerUp);

      // 双重保险：兜底 click 事件 (针对辅助功能或合成点击)
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!this.isOpen && !hasMoved) {
          this.toggleModal(true);
        }
      });
    }

    // 2. 模态框内部基础按钮
    const closeBtn = this.shadow.querySelector?.('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener?.('click', () => this.toggleModal(false));
    }

    const backdrop = this.shadow.querySelector?.('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener?.('click', (e: any) => {
        // 关键防御：屏蔽打开弹窗 450ms 内的合成穿透点击，防止手指抬起时的延迟点击误关弹窗
        if (Date.now() - this.modalOpenedAt < 450) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (e.target === backdrop) this.toggleModal(false);
      });
      backdrop.addEventListener?.('pointerup', (e: any) => {
        if (Date.now() - this.modalOpenedAt < 450) {
          e.stopPropagation();
        }
      });
    }

    // 3. Tab 切换 (基础 Tab)
    const tabSubmit = this.shadow.querySelector?.('.tab-btn-submit');
    if (tabSubmit) {
      tabSubmit.addEventListener?.('click', () => this.setTab('submit'));
    }

    const tabHistory = this.shadow.querySelector?.('.tab-btn-history');
    if (tabHistory) {
      tabHistory.addEventListener?.('click', () => this.setTab('history'));
    }

    // 4. 自定义扩展 Tab 按钮监听
    const extensions: FeedbackExtensionTab[] =
      typeof window !== 'undefined' ? (window as any).__AGENT_FEEDBACK_EXTENSIONS__ || [] : [];
    for (const ext of extensions) {
      const extBtn = this.shadow.querySelector?.(`.tab-btn-${ext.id}`);
      if (extBtn) {
        extBtn.addEventListener?.('click', () => this.setTab(ext.id));
      }
    }

    // 5. 渲染当前自定义扩展 Tab 内容
    if (this.activeTab !== 'submit' && this.activeTab !== 'history') {
      const currentExt = extensions.find(e => e.id === this.activeTab);
      const container = this.shadow.querySelector?.(`.ext-tab-container[data-tab-id="${this.activeTab}"]`) as HTMLElement;
      if (currentExt && container) {
        try {
          const context: ExtensionContext = {
            closeModal: () => this.toggleModal(false),
            openTab: (id: string) => this.setTab(id),
            theme: this.getAttribute?.('theme') || 'dark'
          };
          const cleanup = currentExt.render(container, context);
          if (typeof cleanup === 'function') {
            this.extensionCleanups.set(currentExt.id, cleanup);
          }
        } catch (err) {
          console.error(`[agent-feedback] Error rendering extension tab ${currentExt.id}:`, err);
        }
      }
    }

    // 6. 表单输入与提交
    const textarea = this.shadow.querySelector?.('.feedback-textarea') as HTMLTextAreaElement;
    if (textarea) {
      // 关键优化：明确失焦，保证弹窗呼出时绝不自动激活软键盘破坏移动端布局
      try {
        textarea.blur();
        if (typeof document !== 'undefined' && document.activeElement === textarea) {
          (document.activeElement as HTMLElement)?.blur?.();
        }
      } catch {}

      // 拦截刚打开 450ms 内的合成点击聚焦，确保用户必须主动二次点击输入框才激活软键盘
      textarea.addEventListener?.('click', (e) => {
        if (Date.now() - this.modalOpenedAt < 450) {
          e.preventDefault();
          e.stopPropagation();
          try { textarea.blur(); } catch {}
        }
      });
      textarea.addEventListener?.('pointerdown', (e) => {
        if (Date.now() - this.modalOpenedAt < 450) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      textarea.addEventListener?.('input', () => {
        this.feedbackContent = textarea.value;
      });
    }

    const submitBtn = this.shadow.querySelector?.('.btn-submit');
    if (submitBtn) {
      submitBtn.addEventListener?.('click', () => this.submitFeedback());
    }

    const refreshHistoryBtn = this.shadow.querySelector?.('.btn-refresh-history');
    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener?.('click', () => this.loadHistory());
    }

    const loadPrevDayBtn = this.shadow.querySelector?.('.btn-load-previous-day');
    if (loadPrevDayBtn) {
      loadPrevDayBtn.addEventListener?.('click', () => this.loadPreviousDay());
    }

    const captureBtn = this.shadow.querySelector?.('.btn-capture-screen');
    if (captureBtn) {
      captureBtn.addEventListener?.('click', async () => {
        if (this.attachedScreenshots.length >= 6) return;
        const shot = await captureScreenshot();
        if (shot) {
          this.attachedScreenshots.push(shot);
          this.render();
          this.bindEvents();
        }
      });
    }

    const removeShotBtns = this.shadow.querySelectorAll?.('.btn-remove-shot');
    removeShotBtns?.forEach((btn: any) => {
      btn.addEventListener?.('click', (e: Event) => {
        e.stopPropagation();
        const idxStr = btn.getAttribute?.('data-index');
        const idx = parseInt(idxStr || '0', 10);
        if (!isNaN(idx) && idx >= 0 && idx < this.attachedScreenshots.length) {
          this.attachedScreenshots.splice(idx, 1);
          this.render();
          this.bindEvents();
        }
      });
    });

    const fileInput = this.shadow.querySelector?.('.screenshot-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener?.('change', async () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;

        const remaining = Math.max(0, 6 - this.attachedScreenshots.length);
        const filesToRead = files.slice(0, remaining);

        for (const file of filesToRead) {
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            if (dataUrl) {
              this.attachedScreenshots.push(dataUrl);
            }
          } catch (err) {
            console.error('[agent-feedback] Failed to read screenshot file:', err);
          }
        }

        this.render();
        this.bindEvents();
      });
    }
  }

  /**
   * 格式化状态徽标
   */
  private renderStatusBadge(status: FeedbackStatus): string {
    switch (status) {
      case 'processing':
        return `<span class="badge badge-processing"><span class="badge-dot pulse"></span>AI 修复中</span>`;
      case 'completed':
        return `<span class="badge badge-completed">✓ 修复完成</span>`;
      case 'rejected':
        return `<span class="badge badge-rejected">✕ 安全驳回</span>`;
      case 'ignored':
        return `<span class="badge badge-ignored">已忽略</span>`;
      case 'pending':
      default:
        return `<span class="badge badge-pending">⏱ 排队中</span>`;
    }
  }

  /**
   * 渲染单个工单卡片
   */
  private renderTicketCard(item: InAppFeedback): string {
    const isNotice = item.type === 'agent_notice';
    const cardClass = isNotice ? 'history-card card-agent-notice' : 'history-card';
    const timeStr = item.receivedAt ? item.receivedAt.slice(11, 19) : '';

    return `
      <div class="${cardClass}">
        <div class="card-header">
          <span>#${item.id} · ${timeStr}</span>
          ${
            isNotice
              ? `<span class="badge badge-notice">🤖 Agent 系统通知</span>`
              : this.renderStatusBadge(item.status)
          }
        </div>
        <div class="card-content">${item.content}</div>
        ${
          Array.isArray(item.screenshots) && item.screenshots.length > 0
            ? `
          <div class="ticket-screenshots">
            ${item.screenshots
              .map((shot: any) => {
                const shotPath = typeof shot === 'string' ? shot : shot.path || shot.filename || '';
                if (!shotPath) return '';
                const shotUrl = shotPath.startsWith('data:')
                  ? shotPath
                  : this.getApiUrl(shotPath.startsWith('/') ? shotPath : `/${shotPath}`);
                return `<img src="${shotUrl}" class="ticket-screenshot-thumb" alt="截图凭证" loading="lazy" />`;
              })
              .join('')}
          </div>
        `
            : ''
        }
        ${
          item.reply
            ? `
          <div class="agent-reply-box">
            <div class="agent-reply-header">🤖 Agent 修复说明:</div>
            <div>${item.reply}</div>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * 渲染时间轴视图
   */
  private renderTimelineView(): string {
    if (this.isLoadingHistory) {
      return `<div style="text-align: center; padding: 30px; color: var(--af-text-muted, #9ca3af);">正在获取进度...</div>`;
    }

    if (this.loadedDates.size === 0) {
      return `<div class="empty-history">暂无反馈记录。点击“新建反馈”提交第一条反馈！</div>`;
    }

    const daySections: string[] = [];
    for (const [date, items] of this.loadedDates.entries()) {
      daySections.push(`
        <div class="timeline-day-group">
          <div class="timeline-day-header">
            <span class="timeline-dot"></span>
            <span class="timeline-date-title">${date}</span>
            <span class="timeline-date-badge">当日共 ${items.length} 条</span>
          </div>
          <div class="timeline-day-content">
            <div class="timeline-v-line"></div>
            <div class="timeline-cards">
              ${items.map(item => this.renderTicketCard(item)).join('')}
            </div>
          </div>
        </div>
      `);
    }

    const hasMore = this.currentDateIndex + 1 < this.datesList.length;
    const nextDate = hasMore ? this.datesList[this.currentDateIndex + 1] : '';

    return `
      <div class="timeline-container">
        ${daySections.join('')}
        ${
          hasMore
            ? `<button class="btn-load-previous-day">📅 加载前一天记录 (${nextDate})</button>`
            : ''
        }
      </div>
    `;
  }

  /**
   * 渲染 Shadow DOM 全景 HTML 与 Scoped CSS
   */
  public render() {
    if (!this.shadow) return;

    const telemetry = collectTelemetry();
    const logs = getRecentLogs();
    const extensions: FeedbackExtensionTab[] =
      typeof window !== 'undefined' ? (window as any).__AGENT_FEEDBACK_EXTENSIONS__ || [] : [];

    const pillPositionStyle =
      this.currentLeft !== null && this.currentTop !== null
        ? `left: ${this.currentLeft}px; top: ${this.currentTop}px; right: auto; bottom: auto;`
        : `right: 16px; bottom: 84px;`;

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          --af-primary: #4edea3;
          --af-bg-base: #12151c;
          --af-bg-surface: #181f2a;
          --af-text-main: #f3f4f6;
          --af-text-muted: #9ca3af;
          --af-border: rgba(255, 255, 255, 0.08);
          --af-radius: 12px;
          color: var(--af-text-main, #f3f4f6);
          line-height: 1.5;
          font-size: 14px;
        }

        :host([theme="light"]) {
          --af-primary: #2563eb;
          --af-bg-base: #ffffff;
          --af-bg-surface: #f8fafc;
          --af-text-main: #0f172a;
          --af-text-muted: #64748b;
          --af-border: rgba(0, 0, 0, 0.08);
        }

        :host([theme="dark"]) {
          --af-primary: #4edea3;
          --af-bg-base: #12151c;
          --af-bg-surface: #181f2a;
          --af-text-main: #f3f4f6;
          --af-text-muted: #9ca3af;
          --af-border: rgba(255, 255, 255, 0.08);
        }

        @media (prefers-color-scheme: light) {
          :host([theme="auto"]) {
            --af-primary: #2563eb;
            --af-bg-base: #ffffff;
            --af-bg-surface: #f8fafc;
            --af-text-main: #0f172a;
            --af-text-muted: #64748b;
            --af-border: rgba(0, 0, 0, 0.08);
          }
        }

        @media (prefers-color-scheme: dark) {
          :host([theme="auto"]) {
            --af-primary: #4edea3;
            --af-bg-base: #12151c;
            --af-bg-surface: #181f2a;
            --af-text-main: #f3f4f6;
            --af-text-muted: #9ca3af;
            --af-border: rgba(255, 255, 255, 0.08);
          }
        }

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* 悬浮磁吸胶囊 */
        .pill-trigger {
          position: fixed;
          ${pillPositionStyle}
          z-index: 2147483640;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: var(--af-bg-base, #12151c);
          color: var(--af-primary, #4edea3);
          border: 1px solid var(--af-primary, rgba(78, 222, 163, 0.4));
          border-radius: 9999px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(78, 222, 163, 0.2);
          cursor: grab;
          user-select: none;
          touch-action: none;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.3px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .pill-trigger:active {
          cursor: grabbing;
          transform: scale(0.97);
        }

        .pill-trigger:hover {
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.7), 0 0 16px rgba(78, 222, 163, 0.35);
        }

        .pill-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--af-primary, #4edea3);
          box-shadow: 0 0 8px var(--af-primary, #4edea3);
          flex-shrink: 0;
        }

        .pill-dot.pulsing {
          background: #f59e0b;
          box-shadow: 0 0 10px #f59e0b;
          animation: pulse-ring 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.8; }
        }

        /* 模态框遮罩与弹窗 */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483645;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: ${this.isOpen ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .modal-container {
          background: var(--af-bg-base, #161922);
          border: 1px solid var(--af-border, #2a303c);
          border-radius: var(--af-radius, 12px);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.8);
          width: 100%;
          max-width: 480px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modal-pop {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* 头部与 Tab 切换 */
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--af-border, #222734);
          background: var(--af-bg-surface, #12151c);
        }

        .modal-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--af-text-main, #f3f4f6);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .modal-close {
          background: transparent;
          border: none;
          color: var(--af-text-muted, #9ca3af);
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
        }

        .modal-close:hover {
          color: var(--af-text-main, #fff);
          background: rgba(255, 255, 255, 0.1);
        }

        .tabs {
          display: flex;
          background: var(--af-bg-surface, #12151c);
          border-bottom: 1px solid var(--af-border, #222734);
          padding: 0 16px;
          gap: 12px;
          overflow-x: auto;
        }

        .tab-btn {
          background: none;
          border: none;
          color: var(--af-text-muted, #9ca3af);
          font-size: 13px;
          font-weight: 600;
          padding: 12px 6px;
          cursor: pointer;
          position: relative;
          transition: color 0.2s;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .tab-btn.active {
          color: var(--af-primary, #4edea3);
        }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--af-primary, #4edea3);
          border-radius: 2px;
        }

        .tab-badge {
          background: var(--af-primary, #4edea3);
          color: var(--af-bg-base, #12151c);
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 9999px;
        }

        /* 视图内容容器 */
        .modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          color: var(--af-text-main, #f3f4f6);
        }

        /* 遥测徽标区 */
        .telemetry-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 16px;
        }

        .tele-chip {
          background: var(--af-bg-surface, #1e2430);
          color: var(--af-text-muted, #9ca3af);
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          padding: 4px 8px;
          border-radius: calc(var(--af-radius, 12px) - 6px);
          border: 1px solid var(--af-border, #283040);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .tele-chip strong {
          color: var(--af-primary, #4edea3);
        }

        /* 反馈表单 */
        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--af-text-main, #d1d5db);
          margin-bottom: 6px;
        }

        .feedback-textarea {
          width: 100%;
          min-height: 100px;
          background: var(--af-bg-surface, #0f1218);
          border: 1px solid var(--af-border, #2a303c);
          border-radius: calc(var(--af-radius, 12px) - 4px);
          padding: 10px 12px;
          color: var(--af-text-main, #f3f4f6);
          font-size: 13px;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }

        .feedback-textarea:focus {
          border-color: var(--af-primary, #4edea3);
          box-shadow: 0 0 0 2px rgba(78, 222, 163, 0.2);
        }

        /* 截图附件区 */
        .screenshot-section {
          background: var(--af-bg-surface, #11141b);
          border: 1px dashed var(--af-border, #283040);
          border-radius: calc(var(--af-radius, 12px) - 4px);
          padding: 12px;
          margin-bottom: 16px;
        }

        .screenshot-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .btn-secondary {
          background: var(--af-bg-surface, #1e2430);
          border: 1px solid var(--af-border, #2e374a);
          color: var(--af-text-main, #d1d5db);
          padding: 6px 12px;
          border-radius: calc(var(--af-radius, 12px) - 6px);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--af-text-main, #fff);
        }

        .screenshot-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }

        .screenshot-item {
          position: relative;
          width: 72px;
          height: 72px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--af-border, #283040);
          background: #000;
          flex-shrink: 0;
        }

        .screenshot-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .btn-remove-shot {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.75);
          color: #ef4444;
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 11px;
          line-height: 1;
          padding: 0;
          transition: background 0.15s ease;
        }

        .btn-remove-shot:hover {
          background: #ef4444;
          color: #fff;
        }

        /* 提示信息 */
        .alert {
          padding: 10px 12px;
          border-radius: calc(var(--af-radius, 12px) - 4px);
          font-size: 12px;
          margin-bottom: 14px;
        }

        .alert-success {
          background: rgba(78, 222, 163, 0.15);
          color: var(--af-primary, #4edea3);
          border: 1px solid var(--af-primary, rgba(78, 222, 163, 0.3));
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        /* 提交操作按钮 */
        .btn-submit {
          width: 100%;
          background: var(--af-primary, #4edea3);
          color: #0b0e14;
          border: none;
          padding: 10px 16px;
          border-radius: calc(var(--af-radius, 12px) - 4px);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: filter 0.15s, transform 0.1s;
        }

        .btn-submit:hover:not(:disabled) {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }

        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 时间轴样式 */
        .history-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .timeline-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .timeline-day-group {
          position: relative;
        }

        .timeline-day-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }

        .timeline-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--af-primary, #4edea3);
          box-shadow: 0 0 10px var(--af-primary, #4edea3);
          flex-shrink: 0;
        }

        .timeline-date-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--af-text-main, #f3f4f6);
        }

        .timeline-date-badge {
          font-size: 11px;
          background: var(--af-bg-surface, #1e2430);
          color: var(--af-text-muted, #9ca3af);
          padding: 2px 8px;
          border-radius: 9999px;
          border: 1px solid var(--af-border, rgba(255,255,255,0.08));
        }

        .timeline-day-content {
          position: relative;
          padding-left: 20px;
        }

        .timeline-v-line {
          position: absolute;
          left: 4px;
          top: -4px;
          bottom: 0;
          width: 2px;
          background: var(--af-border, rgba(255,255,255,0.12));
        }

        .timeline-cards {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .history-card {
          background: var(--af-bg-surface, #11141b);
          border: 1px solid var(--af-border, #222734);
          border-radius: calc(var(--af-radius, 12px) - 2px);
          padding: 12px 14px;
        }

        .card-agent-notice {
          border: 1px solid var(--af-primary, #4edea3);
          box-shadow: 0 0 12px rgba(78, 222, 163, 0.15);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 12px;
          color: var(--af-text-muted, #6b7280);
        }

        .card-content {
          font-size: 13px;
          color: var(--af-text-main, #e5e7eb);
          margin-bottom: 10px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .agent-reply-box {
          background: var(--af-bg-base, #181f2a);
          border-left: 3px solid var(--af-primary, #4edea3);
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 12px;
          color: var(--af-text-main, #cbd5e1);
          margin-top: 8px;
        }

        .ticket-screenshots {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }

        .ticket-screenshot-thumb {
          width: 52px;
          height: 52px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid var(--af-border, rgba(255, 255, 255, 0.1));
          background: rgba(0, 0, 0, 0.3);
        }

        .agent-reply-header {
          font-weight: 600;
          color: var(--af-primary, #4edea3);
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* 状态徽章 */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-pending {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }

        .badge-processing {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
        }

        .badge-completed {
          background: rgba(78, 222, 163, 0.15);
          color: var(--af-primary, #4edea3);
        }

        .badge-rejected {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
        }

        .badge-ignored {
          background: rgba(156, 163, 175, 0.15);
          color: #9ca3af;
        }

        .badge-notice {
          background: rgba(78, 222, 163, 0.15);
          color: var(--af-primary, #4edea3);
          border: 1px solid var(--af-primary, rgba(78, 222, 163, 0.3));
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .btn-load-previous-day {
          width: 100%;
          background: var(--af-bg-surface, #1e2430);
          border: 1px dashed var(--af-border, #2e374a);
          color: var(--af-text-muted, #9ca3af);
          padding: 8px 12px;
          border-radius: calc(var(--af-radius, 12px) - 4px);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          margin-top: 12px;
        }

        .btn-load-previous-day:hover {
          color: var(--af-text-main, #fff);
          border-color: var(--af-primary, #4edea3);
        }

        .empty-history {
          text-align: center;
          padding: 40px 20px;
          color: var(--af-text-muted, #6b7280);
          font-size: 13px;
        }

        .ext-tab-container {
          width: 100%;
          min-height: 200px;
        }
      </style>

      <!-- 悬浮触发胶囊 -->
      <div class="pill-trigger" title="点击呼出 AI Coding 反馈桥">
        <span class="pill-dot ${this.hasProcessingItems ? 'pulsing' : ''}"></span>
        <span>反馈给 AI</span>
      </div>

      <!-- 弹窗遮罩 -->
      <div class="modal-backdrop">
        <div class="modal-container">
          <!-- 弹窗顶栏 -->
          <div class="modal-header">
            <div class="modal-title">
              <span class="pill-dot ${this.hasProcessingItems ? 'pulsing' : ''}"></span>
              <span>AI Coding Feedback Bridge</span>
            </div>
            <button class="modal-close" title="关闭">&times;</button>
          </div>

          <!-- Tab 选项卡 (包含原生 Tab 与动态注册的扩展槽) -->
          <div class="tabs">
            <button class="tab-btn tab-btn-submit ${this.activeTab === 'submit' ? 'active' : ''}">新建反馈</button>
            <button class="tab-btn tab-btn-history ${this.activeTab === 'history' ? 'active' : ''}">
              历史与进度 ${this.totalTicketsCount > 0 ? `(${this.totalTicketsCount})` : ''}
            </button>
            ${extensions.map(ext => `
              <button class="tab-btn tab-btn-${ext.id} ${this.activeTab === ext.id ? 'active' : ''}">
                ${ext.icon ? `<span>${ext.icon}</span>` : ''}
                <span>${ext.label}</span>
                ${ext.badge !== undefined ? `<span class="tab-badge">${ext.badge}</span>` : ''}
              </button>
            `).join('')}
          </div>

          <!-- 弹窗主体 -->
          <div class="modal-body">
            ${
              this.activeTab === 'submit'
                ? `
                <!-- 遥测快照徽标预览 -->
                <div class="telemetry-bar">
                  <div class="tele-chip">📍 <strong>${telemetry.route}</strong></div>
                  <div class="tele-chip">📱 <strong>${telemetry.viewport.width}×${telemetry.viewport.height}</strong> (DPR ${telemetry.viewport.dpr})</div>
                  <div class="tele-chip">💻 <strong>${telemetry.platform.toUpperCase()}</strong></div>
                  <div class="tele-chip">📝 <strong>${logs.length}</strong> 条日志</div>
                </div>

                ${
                  this.submitFeedbackMessage
                    ? `<div class="alert alert-${this.submitFeedbackMessage.type}">${this.submitFeedbackMessage.text}</div>`
                    : ''
                }

                <div class="form-group">
                  <label class="form-label">问题描述 / 优化建议</label>
                  <textarea
                    class="feedback-textarea"
                    placeholder="描述你在真机或浏览器中发现的问题、样式走位、交互异常或建议..."
                  >${this.feedbackContent}</textarea>
                </div>

                <!-- 截图附件 (支持多张上传，最多 6 张) -->
                <div class="screenshot-section">
                  <div class="screenshot-actions">
                    <button class="btn-secondary btn-capture-screen" ${this.attachedScreenshots.length >= 6 ? 'disabled' : ''}>
                      📸 截取当前界面
                    </button>
                    <label class="btn-secondary ${this.attachedScreenshots.length >= 6 ? 'disabled' : ''}" style="margin: 0; cursor: pointer;">
                      📁 上传本地截图 ${this.attachedScreenshots.length > 0 ? `(${this.attachedScreenshots.length}/6)` : ''}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        class="screenshot-file-input"
                        style="display: none;"
                        ${this.attachedScreenshots.length >= 6 ? 'disabled' : ''}
                      />
                    </label>
                  </div>
                  ${
                    this.attachedScreenshots.length > 0
                      ? `
                    <div class="screenshot-grid">
                      ${this.attachedScreenshots
                        .map(
                          (shot, idx) => `
                        <div class="screenshot-item">
                          <img src="${shot}" class="screenshot-img" alt="截图预览 ${idx + 1}" />
                          <button class="btn-remove-shot" data-index="${idx}" title="移除此截图">✕</button>
                        </div>
                      `
                        )
                        .join('')}
                    </div>
                  `
                      : ''
                  }
                </div>

                <button class="btn-submit" ${this.isSubmitting ? 'disabled' : ''}>
                  ${this.isSubmitting ? '正在提交...' : '🚀 提交并通知 AI Agent'}
                </button>
              `
                : this.activeTab === 'history'
                ? `
                <div class="history-controls">
                  <span style="font-size: 12px; color: var(--af-text-muted, #9ca3af);">共 ${this.totalTicketsCount || this.historyList.length} 条记录</span>
                  <button class="btn-secondary btn-refresh-history">🔄 刷新</button>
                </div>
                ${this.renderTimelineView()}
              `
                : `
                <!-- 自定义扩展 Tab 容器 -->
                <div class="ext-tab-container" data-tab-id="${this.activeTab}"></div>
              `
            }
          </div>
        </div>
      </div>
    `;
  }
}

/**
 * 注册 <agent-feedback-widget> Custom Element
 */
export function registerAgentFeedbackWidget(): void {
  if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
    if (!customElements.get('agent-feedback-widget')) {
      customElements.define('agent-feedback-widget', AgentFeedbackWidget);
    }
  }
}

/**
 * 自动挂载至页面 DOM
 */
export function autoMountWidget(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  setupConsoleProxy();
  registerAgentFeedbackWidget();

  const mount = () => {
    if (!document.querySelector('agent-feedback-widget')) {
      const widget = document.createElement('agent-feedback-widget');
      document.body.appendChild(widget);
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}

// 浏览器环境中自动初始化
if (typeof window !== 'undefined') {
  autoMountWidget();
}
