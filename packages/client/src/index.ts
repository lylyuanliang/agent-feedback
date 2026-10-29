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
} from '@lylyuanliang/agent-feedback-core';

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
 * 格式化本地时间 (HH:mm:ss，依据用户端侧本地时区)
 */
export function formatLocalTime(item: Partial<InAppFeedback>): string {
  const ts = item.timestamp || (item.receivedAt ? new Date(item.receivedAt).getTime() : 0);
  if (!ts || isNaN(ts)) return '';
  const d = new Date(ts);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 格式化本地日期 (YYYY-MM-DD，依据用户端侧本地时区)
 */
export function formatLocalDate(item: Partial<InAppFeedback>): string {
  if (item.date) return item.date;
  const ts = item.timestamp || (item.receivedAt ? new Date(item.receivedAt).getTime() : 0);
  if (!ts || isNaN(ts)) return '今日';
  const d = new Date(ts);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 客户端轻量图片压缩引擎，将手机超大相片/截图自动缩放并压缩为轻量 JPEG (约 60KB~100KB)
 */
export async function compressImage(file: File | Blob, maxDim = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('未提供有效图片'));
    if (typeof FileReader === 'undefined') {
      return reject(new Error('环境不支持 FileReader'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片文件失败'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (typeof Image === 'undefined') {
        return resolve(dataUrl);
      }

      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(dataUrl);

          ctx.fillStyle = '#12151c';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 高保真端侧截图辅助函数 (优先使用宿主环境的 html2canvas)
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  // 1. 获取所有挂载的 feedback widget 并临时隐藏模态框遮罩，防止把遮罩自身截进去
  const widgets = Array.from(document.querySelectorAll('agent-feedback-widget'));
  const backdropsToRestore: HTMLElement[] = [];
  widgets.forEach((w: any) => {
    const backdrop = w.shadowRoot?.querySelector('.modal-backdrop') as HTMLElement;
    if (backdrop && backdrop.style.display !== 'none') {
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'none';
      backdropsToRestore.push(backdrop);
    }
  });

  const restoreBackdrops = () => {
    backdropsToRestore.forEach((b) => {
      b.style.opacity = '1';
      b.style.pointerEvents = '';
    });
  };

  try {
    // 稍等 100ms 保证 DOM 视图重绘且遮罩完全隐去
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 2. 尝试从全局或动态 import 获取 html2canvas
    let html2canvasFn: any = (window as any).html2canvas;
    if (!html2canvasFn) {
      try {
        const dynImport = new Function('specifier', 'return import(specifier)');
        const mod: any = await dynImport('html2canvas');
        html2canvasFn = mod?.default || mod;
      } catch {
        // 宿主环境未安装 html2canvas
      }
    }

    if (typeof html2canvasFn === 'function') {
      const canvas = await html2canvasFn(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        ignoreElements: (el: Element) => el.tagName === 'AGENT-FEEDBACK-WIDGET'
      });

      restoreBackdrops();

      // 导出并使用 Canvas 引擎压缩为 ~80KB 轻量高保真 JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      return await compressImage(dataUrl, 1200, 0.75);
    }

    restoreBackdrops();
    // 若环境未提供 html2canvas，绝不生成破坏性的全黑 SVG 假图，返回 null 触发优雅降级
    return null;
  } catch (err) {
    restoreBackdrops();
    console.warn('[agent-feedback] captureScreenshot failed:', err);
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

  // 大图预览 Lightbox 状态
  private lightboxSrc: string | null = null;
  private lightboxTitle: string = '';

  // 扩展槽生命周期清理钩子
  private extensionCleanups: Map<string, () => void> = new Map();

  // 实时轮询定时器
  private historyPollTimer: any = null;
  private statusPollTimer: any = null;

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

  /**
   * 规范化截图完整访问 URL (兼容日级分片、旧版路径及 cpolar 穿透基地址)
   */
  public getScreenshotUrl(shot: any): string {
    const shotPath = typeof shot === 'string' ? shot : shot?.path || shot?.filename || '';
    if (!shotPath) return '';
    if (shotPath.startsWith('data:') || shotPath.startsWith('http://') || shotPath.startsWith('https://')) {
      return shotPath;
    }
    const clean = shotPath
      .replace(/^[\/\\]*(api[\/\\](__agent_feedback|feedback)[\/\\])?(screenshots?[\/\\])?/i, '')
      .replace(/^[\\\/]+/, '');
    return this.getApiUrl(`/api/__agent_feedback/screenshots/${clean}`);
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
    if (this.historyPollTimer) {
      clearInterval(this.historyPollTimer);
      this.historyPollTimer = null;
    }
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
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
   * 状态与历史实时轮询管理
   */
  private checkAndSyncPolling() {
    // 1. 历史时间轴轮询：仅在弹窗打开且停留在「历史与进度」Tab 时启动
    if (this.isOpen && this.activeTab === 'history') {
      if (!this.historyPollTimer) {
        this.historyPollTimer = setInterval(() => {
          this.pollHistoryUpdates();
        }, 5000);
        if (typeof (this.historyPollTimer as any)?.unref === 'function') {
          (this.historyPollTimer as any).unref();
        }
      }
    } else {
      if (this.historyPollTimer) {
        clearInterval(this.historyPollTimer);
        this.historyPollTimer = null;
      }
    }

    // 2. 悬浮胶囊呼吸灯轮询：仅在存在处理中工单且弹窗关闭时低频检查
    if (!this.isOpen && this.hasProcessingItems) {
      if (!this.statusPollTimer) {
        this.statusPollTimer = setInterval(() => {
          this.fetchHistoryQuickStatus();
        }, 8000);
        if (typeof (this.statusPollTimer as any)?.unref === 'function') {
          (this.statusPollTimer as any).unref();
        }
      }
    } else {
      if (this.statusPollTimer) {
        clearInterval(this.statusPollTimer);
        this.statusPollTimer = null;
      }
    }
  }

  /**
   * 静默轮询工单状态更新并无感刷新
   */
  private async pollHistoryUpdates() {
    if (typeof fetch === 'undefined' || typeof document !== 'undefined' && document.hidden) return;
    if (!this.isOpen || this.activeTab !== 'history') return;

    try {
      const query = this.datesList.length > 0 ? `?date=${encodeURIComponent(this.datesList[0])}` : '';
      const res = await fetch(this.getApiUrl(`/api/__agent_feedback/list${query}`));
      if (!res.ok) return;

      const latestList: InAppFeedback[] = await res.json();
      if (!Array.isArray(latestList)) return;

      const targetDate = this.datesList.length > 0 ? this.datesList[0] : (latestList[0]?.date || '今日');
      const currentList = this.loadedDates.get(targetDate) || [];

      // 检查工单状态、回复说明或数量是否有任何变化
      const hasChanged =
        latestList.length !== currentList.length ||
        latestList.some((item, idx) => {
          const old = currentList[idx];
          return !old || old.id !== item.id || old.status !== item.status || old.reply !== item.reply;
        });

      if (hasChanged) {
        this.loadedDates.set(targetDate, latestList);
        this.historyList = latestList;
        this.hasProcessingItems = latestList.some(i => i.status === 'processing' || i.status === 'pending');
        this.updatePillIndicator();

        // 平滑刷新：记录当前滚动位置，重新渲染后瞬间恢复，绝对不跳顶
        const bodyEl = this.shadow.querySelector('.modal-body') as HTMLElement;
        const prevScrollTop = bodyEl ? bodyEl.scrollTop : 0;

        this.render();
        this.bindEvents();

        const newBodyEl = this.shadow.querySelector('.modal-body') as HTMLElement;
        if (newBodyEl) {
          newBodyEl.scrollTop = prevScrollTop;
        }
      }
    } catch {
      // 网络波动容错
    }
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
        this.checkAndSyncPolling();
      }
    } catch {
      // 离线或后端未就绪
    }
  }

  /**
   * 刷新呼吸灯显示
   */
  private updatePillIndicator() {
    const dots = this.shadow?.querySelectorAll?.('.pill-dot');
    dots?.forEach((dot: any) => {
      if (this.hasProcessingItems) {
        dot.classList?.add('pulsing');
      } else {
        dot.classList?.remove('pulsing');
      }
    });
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
    this.checkAndSyncPolling();

    if (this.isOpen && this.activeTab === 'history') {
      this.loadHistory();
    }
  }

  /**
   * 切换 Tab (原生局部切换，0 毫秒完成，零 DOM 销毁重构，零入场动画重演，杜绝界面闪烁)
   */
  public setTab(tab: string) {
    if (this.activeTab === tab) return;
    const prevTab = this.activeTab;
    this.activeTab = tab;
    this.submitFeedbackMessage = null;

    // 尝试就地轻量切换面板可见性与类名 (绝不销毁 DOM，零闪烁)
    const switched = this.switchTabDom(tab, prevTab);
    if (!switched) {
      // 容错降级：如果 Shadow DOM 未就绪，走全量 render
      this.cleanupExtensionTabs();
      this.render();
      this.bindEvents();
    }
    this.checkAndSyncPolling();

    if (tab === 'history') {
      // 关键优化：若已有加载过的数据，后台静默拉取更新，保持已有列表始终可见，不闪现大块空白！
      this.loadHistory(this.loadedDates.size > 0);
    }
  }

  /**
   * 判断当前是否处于真实浏览器 Shadow DOM 环境 (区分 Node 单元测试环境)
   */
  private isNativeDom(): boolean {
    return typeof ShadowRoot !== 'undefined' && this.shadow instanceof ShadowRoot;
  }

  /**
   * 原生局部 Tab 切换 (0 毫秒完成，零 DOM 重建，零入场动画重演，杜绝界面闪烁)
   */
  private switchTabDom(newTab: string, prevTab: string): boolean {
    if (!this.shadow) return false;
    // 若在 Node 简易 Mock 环境下，降级走全量 render 更新 mock.innerHTML
    if (!this.isNativeDom()) return false;

    // 1. 获取所有 Tab 按钮，更新 active 样式
    const allTabBtns = this.shadow.querySelectorAll?.('.tab-btn');
    if (!allTabBtns || allTabBtns.length === 0) return false;

    allTabBtns.forEach((btn: any) => {
      btn.classList?.remove?.('active');
      if (btn.classList?.contains?.(`tab-btn-${newTab}`)) {
        btn.classList?.add?.('active');
      }
    });

    // 2. 清理前一个扩展 Tab (严格遵循测试契约执行 cleanup)
    if (prevTab !== 'submit' && prevTab !== 'history') {
      const cleanup = this.extensionCleanups.get(prevTab);
      if (typeof cleanup === 'function') {
        try {
          cleanup();
        } catch (err) {
          console.error(`[agent-feedback] Error cleaning up extension tab ${prevTab}:`, err);
        }
        this.extensionCleanups.delete(prevTab);
      }
    }

    // 3. 切换面板可见性
    const panelSubmit = this.shadow.querySelector?.('.af-tab-panel-submit') as HTMLElement;
    const panelHistory = this.shadow.querySelector?.('.af-tab-panel-history') as HTMLElement;
    const allExtPanels = this.shadow.querySelectorAll?.('.af-tab-panel-ext');

    if (panelSubmit) {
      panelSubmit.style.display = newTab === 'submit' ? 'block' : 'none';
    }
    if (panelHistory) {
      panelHistory.style.display = newTab === 'history' ? 'block' : 'none';
    }
    if (allExtPanels) {
      allExtPanels.forEach((p: any) => {
        const id = p.getAttribute?.('data-tab-id');
        p.style.display = id === newTab ? 'block' : 'none';
      });
    }

    // 4. 若新 Tab 是扩展 Tab，挂载或重新渲染该扩展容器
    if (newTab !== 'submit' && newTab !== 'history') {
      const extensions: FeedbackExtensionTab[] =
        typeof window !== 'undefined' ? (window as any).__AGENT_FEEDBACK_EXTENSIONS__ || [] : [];
      const currentExt = extensions.find(e => e.id === newTab);
      const container = this.shadow.querySelector?.(`.ext-tab-container[data-tab-id="${newTab}"]`) as HTMLElement;
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

    return true;
  }

  /**
   * 局部更新历史面板 DOM (不重建整个 Shadow DOM，平滑流畅)
   */
  private updateHistoryDom() {
    if (!this.shadow) return;
    // 若在 Node 简易 Mock 环境下，降级走全量 render 更新 mock.innerHTML
    if (!this.isNativeDom()) {
      this.render();
      this.bindEvents();
      return;
    }
    const historyPanel = this.shadow.querySelector?.('.af-tab-panel-history');
    if (!historyPanel) {
      this.render();
      this.bindEvents();
      return;
    }

    // 局部更新总数文本
    const countEl = historyPanel.querySelector?.('.history-controls span');
    if (countEl) {
      countEl.textContent = `共 ${this.totalTicketsCount || this.historyList.length} 条记录`;
    }

    // 局部更新 Tab 按钮上的徽标数量
    const historyTabBtn = this.shadow.querySelector?.('.tab-btn-history');
    if (historyTabBtn) {
      historyTabBtn.textContent = `历史与进度 ${this.totalTicketsCount > 0 ? `(${this.totalTicketsCount})` : ''}`;
    }

    // 局部更新时间轴内容
    const wrapper = historyPanel.querySelector?.('.timeline-view-wrapper');
    if (wrapper) {
      wrapper.innerHTML = this.renderTimelineView();
      this.bindHistoryEvents(wrapper as HTMLElement);
    }
  }

  /**
   * 加载历史时间轴数据 (首屏极速并发，1 次往返搞定)
   */
  public async loadHistory(silent: boolean = false) {
    if (typeof fetch === 'undefined') return;
    if (!silent || this.loadedDates.size === 0) {
      this.isLoadingHistory = true;
      this.updateHistoryDom();
    }

    try {
      // 并发请求日级索引与首屏最新分片，大幅减少穿透网络往返延迟
      const [datesRes, listRes] = await Promise.all([
        fetch(this.getApiUrl('/api/__agent_feedback/dates')).catch(() => null),
        fetch(this.getApiUrl('/api/__agent_feedback/list')).catch(() => null)
      ]);

      if (datesRes && datesRes.ok) {
        const datesData = await datesRes.json();
        this.datesList = Array.isArray(datesData?.dates) ? datesData.dates : [];
        this.totalTicketsCount = typeof datesData?.totalCount === 'number' ? datesData.totalCount : 0;
      }

      if (listRes && listRes.ok) {
        const data = await listRes.json();
        const list: InAppFeedback[] = Array.isArray(data) ? data : data.list || [];
        this.loadedDates.clear();
        this.currentDateIndex = 0;

        if (this.datesList.length > 0) {
          this.loadedDates.set(this.datesList[0], list);
        } else if (list.length > 0) {
          for (const item of list) {
            const d = item.date || formatLocalDate(item);
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
      this.updateHistoryDom();
      this.checkAndSyncPolling();
    }
  }

  /**
   * 加载前一天历史记录 (保持滚动条位置，彻底解决跳顶问题)
   */
  public async loadPreviousDay() {
    if (typeof fetch === 'undefined') return;
    if (this.currentDateIndex + 1 >= this.datesList.length) return;

    this.currentDateIndex++;
    const prevDate = this.datesList[this.currentDateIndex];

    // 记录当前滚动容器的滚动条高度
    const bodyEl = this.shadow.querySelector('.modal-body') as HTMLElement;
    const prevScrollTop = bodyEl ? bodyEl.scrollTop : 0;

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
      this.updateHistoryDom();

      // 平滑恢复滚动位置，绝不跳顶！
      const newBodyEl = this.shadow.querySelector('.modal-body') as HTMLElement;
      if (newBodyEl) {
        newBodyEl.scrollTop = prevScrollTop;
      }
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
      let touchStartTime = 0;
      let totalMoveDist = 0;
      let startX = 0;
      let startY = 0;
      let initLeft = 0;
      let initTop = 0;
      let pillWidth = 120;
      let pillHeight = 40;

      const onPointerStart = (clientX: number, clientY: number) => {
        isPointerActive = true;
        hasMoved = false;
        touchStartTime = Date.now();
        totalMoveDist = 0;
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
        totalMoveDist = Math.hypot(dx, dy);

        // 仅当位移超过 18px 且触摸时长超过 100ms 时才正式判定为拖拽意图，防止真机边缘轻触抖动误判
        if (totalMoveDist > 18 && Date.now() - touchStartTime > 100) {
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
        const elapsed = Date.now() - touchStartTime;

        // 如果位移达到拖拽阈值且确实拖拽了一定时间，执行磁吸贴边
        if (hasMoved && elapsed > 180 && totalMoveDist > 20) {
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
          // 移动距离小或极短时间轻触（包括在屏幕顶部或底部边缘点击），一律判定为点击！
          hasMoved = false;
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
        if (!this.isOpen && (!hasMoved || totalMoveDist < 20)) {
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

    // 绑定历史控制与交互事件
    this.bindHistoryEvents();

    const captureBtn = this.shadow.querySelector?.('.btn-capture-screen');
    if (captureBtn) {
      captureBtn.addEventListener?.('click', async () => {
        if (this.attachedScreenshots.length >= 6) return;
        const originalText = captureBtn.innerHTML;
        captureBtn.setAttribute('disabled', 'true');
        captureBtn.innerHTML = '📸 正在全景截屏...';

        try {
          const shot = await captureScreenshot();
          if (shot) {
            this.attachedScreenshots.push(shot);
            this.render();
            this.bindEvents();
          } else {
            captureBtn.removeAttribute('disabled');
            captureBtn.innerHTML = originalText;
            alert('当前运行环境自动截屏受限（或存在跨域安全保护），建议使用手机自带快捷键截屏后，点击「上传本地截图」添加图片。');
          }
        } catch {
          captureBtn.removeAttribute('disabled');
          captureBtn.innerHTML = originalText;
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
            // 使用客户端轻量 Canvas 压缩引擎，将 10MB 手机原图秒级压缩为 ~80KB JPEG
            const compressed = await compressImage(file, 1200, 0.75);
            if (compressed) {
              this.attachedScreenshots.push(compressed);
            }
          } catch (err) {
            console.error('[agent-feedback] Failed to compress screenshot file:', err);
          }
        }

        this.render();
        this.bindEvents();
      });
    }

    // 7. 截图点击放大预览 (Lightbox - 支持历史工单截图与新建反馈上传的本地/抓取截图)
    const allThumbs = this.shadow.querySelectorAll?.('.ticket-screenshot-thumb, .screenshot-img');
    allThumbs?.forEach((thumb: any) => {
      thumb.addEventListener?.('click', (e: Event) => {
        e.stopPropagation();
        const src = thumb.getAttribute?.('data-full') || thumb.getAttribute?.('src');
        const title = thumb.getAttribute?.('data-title') || thumb.getAttribute?.('alt') || '截图放大预览';
        if (src) {
          this.lightboxSrc = src;
          this.lightboxTitle = title;
          this.render();
          this.bindEvents();
        }
      });
    });

    // 8. 关闭大图预览 (Lightbox)
    const lightbox = this.shadow.querySelector?.('.af-lightbox');
    if (lightbox) {
      lightbox.addEventListener?.('click', () => {
        this.lightboxSrc = null;
        this.render();
        this.bindEvents();
      });
    }
  }

  /**
   * 绑定历史面板专用交互事件 (刷新、加载前一天、缩略图大图预览)
   */
  private bindHistoryEvents(container?: HTMLElement) {
    const root = container || this.shadow;
    if (!root) return;

    const refreshHistoryBtn = root.querySelector?.('.btn-refresh-history');
    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener?.('click', () => this.loadHistory());
    }

    const loadPrevDayBtn = root.querySelector?.('.btn-load-previous-day');
    if (loadPrevDayBtn) {
      loadPrevDayBtn.addEventListener?.('click', () => this.loadPreviousDay());
    }

    const historyThumbs = root.querySelectorAll?.('.ticket-screenshot-thumb');
    historyThumbs?.forEach((thumb: any) => {
      thumb.addEventListener?.('click', (e: Event) => {
        e.stopPropagation();
        const src = thumb.getAttribute?.('data-full') || thumb.getAttribute?.('src');
        const title = thumb.getAttribute?.('data-title') || thumb.getAttribute?.('alt') || '截图放大预览';
        if (src) {
          this.lightboxSrc = src;
          this.lightboxTitle = title;
          this.render();
          this.bindEvents();
        }
      });
    });
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
    const timeStr = formatLocalTime(item);

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
              .map((shot: any, sIdx: number) => {
                const shotUrl = this.getScreenshotUrl(shot);
                if (!shotUrl) return '';
                const safeTitle = (item.content || '截图').replace(/"/g, '&quot;');
                return `<img src="${shotUrl}" data-full="${shotUrl}" data-title="${safeTitle}" class="ticket-screenshot-thumb" alt="截图凭证 ${sIdx + 1}" loading="lazy" title="点击查看大图" />`;
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

        /* 模态框遮罩与弹窗 (采用顶部对齐与固定基准高度，确保在各 Tab 间切换时顶部标题栏与 Tab 栏永不上下跳动) */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483645;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: ${this.isOpen ? 'flex' : 'none'};
          align-items: flex-start;
          justify-content: center;
          padding: max(env(safe-area-inset-top, 0px) + 20px, 32px) 16px 16px;
        }

        .modal-container {
          background: var(--af-bg-base, #161922);
          border: 1px solid var(--af-border, #2a303c);
          border-radius: var(--af-radius, 12px);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.8);
          width: 100%;
          max-width: 480px;
          height: min(82vh, 700px);
          max-height: calc(100vh - 48px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modal-pop {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* 头部与 Tab 切换 (flex-shrink: 0 保证历史长列表滚动或加载时永不被压缩或截断) */
        .modal-header {
          flex-shrink: 0;
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
          flex-shrink: 0;
          display: flex;
          background: var(--af-bg-surface, #12151c);
          border-bottom: 1px solid var(--af-border, #222734);
          padding: 0 16px;
          gap: 12px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
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

        /* 多面板容器：保持在 DOM 中平滑切换，杜绝全屏重绘闪烁 */
        .af-tab-panel {
          width: 100%;
          min-height: 100%;
        }

        .af-tab-panel-submit,
        .af-tab-panel-history,
        .af-tab-panel-ext {
          width: 100%;
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
          cursor: pointer;
          transition: transform 0.15s ease, filter 0.15s ease;
        }

        .screenshot-img:hover {
          transform: scale(1.06);
          filter: brightness(1.1);
        }

        .screenshot-img:active {
          transform: scale(0.96);
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
          width: 54px;
          height: 54px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid var(--af-border, rgba(255, 255, 255, 0.15));
          background: rgba(0, 0, 0, 0.4);
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }

        .ticket-screenshot-thumb:hover {
          border-color: var(--af-primary, #4edea3);
          transform: scale(1.05);
        }

        .ticket-screenshot-thumb:active {
          transform: scale(0.95);
        }

        /* 全屏 Lightbox 大图预览 */
        .af-lightbox {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(0, 0, 0, 0.92);
          backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 16px;
          cursor: zoom-out;
          animation: modal-pop 0.18s ease-out;
        }

        .af-lightbox-header {
          position: absolute;
          top: 16px;
          left: 16px;
          right: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #fff;
          z-index: 10;
        }

        .af-lightbox-title {
          font-size: 13px;
          font-weight: 600;
          color: #e5e7eb;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 80%;
        }

        .af-lightbox-close {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .af-lightbox-img {
          max-width: 95vw;
          max-height: 85vh;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
          cursor: default;
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
            <!-- 1. 新建反馈面板 -->
            <div class="af-tab-panel af-tab-panel-submit" style="display: ${this.activeTab === 'submit' ? 'block' : 'none'};">
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
                        <img src="${shot}" class="screenshot-img" alt="截图预览 ${idx + 1}" title="点击查看大图" />
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
            </div>

            <!-- 2. 历史与进度面板 -->
            <div class="af-tab-panel af-tab-panel-history" style="display: ${this.activeTab === 'history' ? 'block' : 'none'};">
              <div class="history-controls">
                <span style="font-size: 12px; color: var(--af-text-muted, #9ca3af);">共 ${this.totalTicketsCount || this.historyList.length} 条记录</span>
                <button class="btn-secondary btn-refresh-history">🔄 刷新</button>
              </div>
              <div class="timeline-view-wrapper">
                ${this.renderTimelineView()}
              </div>
            </div>

            <!-- 3. 自定义扩展 Tab 面板 -->
            ${extensions.map(ext => `
              <div
                class="af-tab-panel af-tab-panel-ext ext-tab-container"
                data-tab-id="${ext.id}"
                style="display: ${this.activeTab === ext.id ? 'block' : 'none'};"
              ></div>
            `).join('')}
          </div>
        </div>
        ${
          this.lightboxSrc
            ? `
          <div class="af-lightbox" title="点击任意空白处关闭">
            <div class="af-lightbox-header">
              <span class="af-lightbox-title">${this.lightboxTitle || '截图详情'}</span>
              <button class="af-lightbox-close" type="button" aria-label="关闭">&times;</button>
            </div>
            <img src="${this.lightboxSrc}" class="af-lightbox-img" alt="大图预览" />
          </div>
        `
            : ''
        }
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
