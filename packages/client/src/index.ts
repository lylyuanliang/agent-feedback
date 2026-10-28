/**
 * @agent-feedback/client
 * In-App Agent Feedback Bridge - Shadow DOM Web Component & Telemetry Client
 */

import type {
  InAppFeedback,
  ConsoleLogEntry,
  TelemetrySnapshot,
  PlatformType,
  FeedbackStatus
} from '../../core/src/index.ts';

export type {
  InAppFeedback,
  ConsoleLogEntry,
  TelemetrySnapshot,
  PlatformType,
  FeedbackStatus
};

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

    // 暗黑 Obsidian 背景兜底
    ctx.fillStyle = '#12151c';
    ctx.fillRect(0, 0, width, height);

    // 绘制简要 DOM 结构投影
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
  public shadow: ShadowRoot;
  private isOpen = false;
  private activeTab: 'submit' | 'history' = 'submit';
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

  // 表单状态
  private feedbackContent = '';
  private attachedScreenshot: string | null = null;
  private isSubmitting = false;
  private submitFeedbackMessage: { type: 'success' | 'error'; text: string } | null = null;

  // 历史列表状态
  private historyList: InAppFeedback[] = [];
  private isLoadingHistory = false;

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.shadow = this.attachShadow({ mode: 'open' });
    } else {
      this.shadow = (this as any).shadowRoot || ({} as any);
    }
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
    this.fetchHistoryQuickStatus();
  }

  disconnectedCallback() {
    // 卸载监听
  }

  /**
   * 快速检查是否有处理中状态，控制呼吸灯
   */
  private async fetchHistoryQuickStatus() {
    if (typeof fetch === 'undefined') return;
    try {
      const res = await fetch('/api/__agent_feedback/list');
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
    const dot = this.shadow?.querySelector('.pill-dot');
    if (dot) {
      if (this.hasProcessingItems) {
        dot.classList.add('pulsing');
      } else {
        dot.classList.remove('pulsing');
      }
    }
  }

  /**
   * 切换弹窗展开/关闭
   */
  public toggleModal(open?: boolean) {
    this.isOpen = typeof open === 'boolean' ? open : !this.isOpen;
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
  public setTab(tab: 'submit' | 'history') {
    this.activeTab = tab;
    this.submitFeedbackMessage = null;
    this.render();
    this.bindEvents();
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  /**
   * 加载反馈历史记录
   */
  public async loadHistory() {
    if (typeof fetch === 'undefined') return;
    this.isLoadingHistory = true;
    this.render();
    this.bindEvents();

    try {
      const res = await fetch('/api/__agent_feedback/list');
      if (res.ok) {
        const data = await res.json();
        this.historyList = Array.isArray(data) ? data : data.list || [];
        this.hasProcessingItems = this.historyList.some(i => i.status === 'processing' || i.status === 'pending');
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
        timestamp: Date.now(),
        receivedAt: new Date().toISOString(),
        content,
        status: 'pending',
        telemetry,
        consoleLogs,
        ...(this.attachedScreenshot ? { screenshots: [this.attachedScreenshot] } : {})
      };

      const res = await fetch('/api/__agent_feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
      }

      // 提交成功，清空输入并提示
      this.feedbackContent = '';
      this.attachedScreenshot = null;
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
    const pill = this.shadow.querySelector('.pill-trigger') as HTMLElement;
    if (pill) {
      const onPointerDown = (e: PointerEvent | MouseEvent | TouchEvent) => {
        this.isDragging = true;
        this.dragThresholdMoved = false;

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        this.startPointerX = clientX;
        this.startPointerY = clientY;

        const rect = pill.getBoundingClientRect();
        this.initialLeft = rect.left;
        this.initialTop = rect.top;

        pill.style.transition = 'none';

        const onPointerMove = (moveEvent: PointerEvent | MouseEvent | TouchEvent) => {
          if (!this.isDragging) return;
          const curX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : (moveEvent as MouseEvent).clientX;
          const curY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;

          const deltaX = curX - this.startPointerX;
          const deltaY = curY - this.startPointerY;

          if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            this.dragThresholdMoved = true;
          }

          let newLeft = this.initialLeft + deltaX;
          let newTop = this.initialTop + deltaY;

          const winW = typeof window !== 'undefined' ? window.innerWidth : 400;
          const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

          // 限制在可视区域内
          newLeft = Math.max(10, Math.min(winW - rect.width - 10, newLeft));
          newTop = Math.max(10, Math.min(winH - rect.height - 10, newTop));

          this.currentLeft = newLeft;
          this.currentTop = newTop;

          pill.style.left = `${newLeft}px`;
          pill.style.top = `${newTop}px`;
          pill.style.right = 'auto';
          pill.style.bottom = 'auto';
        };

        const onPointerUp = () => {
          if (!this.isDragging) return;
          this.isDragging = false;

          if (typeof window !== 'undefined') {
            window.removeEventListener('pointermove', onPointerMove as any);
            window.removeEventListener('pointerup', onPointerUp as any);
            window.removeEventListener('mousemove', onPointerMove as any);
            window.removeEventListener('mouseup', onPointerUp as any);
            window.removeEventListener('touchmove', onPointerMove as any);
            window.removeEventListener('touchend', onPointerUp as any);
          }

          if (!this.dragThresholdMoved) {
            // 轻点触发展开
            this.toggleModal();
            return;
          }

          // 磁吸边缘贴靠逻辑
          pill.style.transition = 'left 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
          const winW = typeof window !== 'undefined' ? window.innerWidth : 400;
          const centerX = (this.currentLeft ?? this.initialLeft) + rect.width / 2;

          if (centerX < winW / 2) {
            // 吸附左侧
            this.currentLeft = 16;
            pill.style.left = '16px';
          } else {
            // 吸附右侧
            const rightSnap = winW - rect.width - 16;
            this.currentLeft = rightSnap;
            pill.style.left = `${rightSnap}px`;
          }
        };

        if (typeof window !== 'undefined') {
          window.addEventListener('pointermove', onPointerMove as any);
          window.addEventListener('pointerup', onPointerUp as any);
          window.addEventListener('mousemove', onPointerMove as any);
          window.addEventListener('mouseup', onPointerUp as any);
          window.addEventListener('touchmove', onPointerMove as any);
          window.addEventListener('touchend', onPointerUp as any);
        }
      };

      pill.onpointerdown = onPointerDown as any;
      pill.ontouchstart = onPointerDown as any;
      pill.onmousedown = onPointerDown as any;
    }

    // 2. 模态框内部按钮
    const closeBtn = this.shadow.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleModal(false));
    }

    const backdrop = this.shadow.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.toggleModal(false);
      });
    }

    const tabSubmit = this.shadow.querySelector('.tab-btn-submit');
    if (tabSubmit) {
      tabSubmit.addEventListener('click', () => this.setTab('submit'));
    }

    const tabHistory = this.shadow.querySelector('.tab-btn-history');
    if (tabHistory) {
      tabHistory.addEventListener('click', () => this.setTab('history'));
    }

    const textarea = this.shadow.querySelector('.feedback-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.addEventListener('input', () => {
        this.feedbackContent = textarea.value;
      });
    }

    const submitBtn = this.shadow.querySelector('.btn-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitFeedback());
    }

    const refreshHistoryBtn = this.shadow.querySelector('.btn-refresh-history');
    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener('click', () => this.loadHistory());
    }

    const captureBtn = this.shadow.querySelector('.btn-capture-screen');
    if (captureBtn) {
      captureBtn.addEventListener('click', async () => {
        const shot = await captureScreenshot();
        if (shot) {
          this.attachedScreenshot = shot;
          this.render();
          this.bindEvents();
        }
      });
    }

    const removeShotBtn = this.shadow.querySelector('.btn-remove-shot');
    if (removeShotBtn) {
      removeShotBtn.addEventListener('click', () => {
        this.attachedScreenshot = null;
        this.render();
        this.bindEvents();
      });
    }

    const fileInput = this.shadow.querySelector('.screenshot-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.attachedScreenshot = e.target?.result as string;
            this.render();
            this.bindEvents();
          };
          reader.readAsDataURL(fileInput.files[0]);
        }
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
   * 渲染 Shadow DOM 全景 HTML 与 Scoped CSS
   */
  public render() {
    if (!this.shadow) return;

    const telemetry = collectTelemetry();
    const logs = getRecentLogs();

    // 维持拖拽吸附后的绝对坐标
    const pillPositionStyle =
      this.currentLeft !== null && this.currentTop !== null
        ? `left: ${this.currentLeft}px; top: ${this.currentTop}px; right: auto; bottom: auto;`
        : `right: 16px; bottom: 84px;`;

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          color: #e5e7eb;
          line-height: 1.5;
          font-size: 14px;
        }

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* 悬浮磁吸胶囊 (Obsidian Alpine Explorer 风格) */
        .pill-trigger {
          position: fixed;
          ${pillPositionStyle}
          z-index: 2147483640;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #12151c;
          color: #4edea3;
          border: 1px solid rgba(78, 222, 163, 0.4);
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
          background: #4edea3;
          box-shadow: 0 0 8px #4edea3;
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
          background: #161922;
          border: 1px solid #2a303c;
          border-radius: 16px;
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
          border-bottom: 1px solid #222734;
          background: #12151c;
        }

        .modal-title {
          font-size: 15px;
          font-weight: 700;
          color: #f3f4f6;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .modal-close {
          background: transparent;
          border: none;
          color: #9ca3af;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
        }

        .modal-close:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }

        .tabs {
          display: flex;
          background: #12151c;
          border-bottom: 1px solid #222734;
          padding: 0 16px;
          gap: 12px;
        }

        .tab-btn {
          background: none;
          border: none;
          color: #9ca3af;
          font-size: 13px;
          font-weight: 600;
          padding: 12px 6px;
          cursor: pointer;
          position: relative;
          transition: color 0.2s;
        }

        .tab-btn.active {
          color: #4edea3;
        }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: #4edea3;
          border-radius: 2px;
        }

        /* 视图内容容器 */
        .modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        /* 遥测徽标区 */
        .telemetry-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 16px;
        }

        .tele-chip {
          background: #1e2430;
          color: #9ca3af;
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid #283040;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .tele-chip strong {
          color: #4edea3;
        }

        /* 反馈表单 */
        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #d1d5db;
          margin-bottom: 6px;
        }

        .feedback-textarea {
          width: 100%;
          min-height: 100px;
          background: #0f1218;
          border: 1px solid #2a303c;
          border-radius: 8px;
          padding: 10px 12px;
          color: #f3f4f6;
          font-size: 13px;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }

        .feedback-textarea:focus {
          border-color: #4edea3;
          box-shadow: 0 0 0 2px rgba(78, 222, 163, 0.2);
        }

        /* 截图附件区 */
        .screenshot-section {
          background: #11141b;
          border: 1px dashed #283040;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .screenshot-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .btn-secondary {
          background: #1e2430;
          border: 1px solid #2e374a;
          color: #d1d5db;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-secondary:hover {
          background: #252d3d;
          color: #fff;
        }

        .screenshot-preview {
          position: relative;
          margin-top: 10px;
          display: inline-block;
          border: 1px solid #283040;
          border-radius: 6px;
          overflow: hidden;
        }

        .screenshot-img {
          display: block;
          max-width: 100%;
          max-height: 160px;
          object-fit: cover;
        }

        .btn-remove-shot {
          position: absolute;
          top: 4px;
          right: 4px;
          background: rgba(0, 0, 0, 0.7);
          color: #ef4444;
          border: none;
          border-radius: 4px;
          padding: 2px 6px;
          cursor: pointer;
          font-size: 11px;
        }

        /* 提示信息 */
        .alert {
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12px;
          margin-bottom: 14px;
        }

        .alert-success {
          background: rgba(78, 222, 163, 0.15);
          color: #4edea3;
          border: 1px solid rgba(78, 222, 163, 0.3);
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        /* 提交操作按钮 */
        .btn-submit {
          width: 100%;
          background: #4edea3;
          color: #0b0e14;
          border: none;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s, transform 0.1s;
        }

        .btn-submit:hover:not(:disabled) {
          background: #3ecf94;
          transform: translateY(-1px);
        }

        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 历史列表视图 */
        .history-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .history-card {
          background: #11141b;
          border: 1px solid #222734;
          border-radius: 10px;
          padding: 12px 14px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 12px;
          color: #6b7280;
        }

        .card-content {
          font-size: 13px;
          color: #e5e7eb;
          margin-bottom: 10px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .agent-reply-box {
          background: #181f2a;
          border-left: 3px solid #4edea3;
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 12px;
          color: #cbd5e1;
          margin-top: 8px;
        }

        .agent-reply-header {
          font-weight: 600;
          color: #4edea3;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* 状态微章样式 */
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
          color: #4edea3;
        }

        .badge-rejected {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
        }

        .badge-ignored {
          background: rgba(156, 163, 175, 0.15);
          color: #9ca3af;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .empty-history {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
          font-size: 13px;
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

          <!-- Tab 选项卡 -->
          <div class="tabs">
            <button class="tab-btn tab-btn-submit ${this.activeTab === 'submit' ? 'active' : ''}">新建反馈</button>
            <button class="tab-btn tab-btn-history ${this.activeTab === 'history' ? 'active' : ''}">
              历史与进度 ${this.historyList.length > 0 ? `(${this.historyList.length})` : ''}
            </button>
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

                <!-- 截图附件 -->
                <div class="screenshot-section">
                  <div class="screenshot-actions">
                    <button class="btn-secondary btn-capture-screen">📸 截取当前界面</button>
                    <label class="btn-secondary" style="margin: 0; cursor: pointer;">
                      📁 上传本地截图
                      <input type="file" accept="image/*" class="screenshot-file-input" style="display: none;" />
                    </label>
                  </div>
                  ${
                    this.attachedScreenshot
                      ? `
                    <div class="screenshot-preview">
                      <img src="${this.attachedScreenshot}" class="screenshot-img" alt="截图预览" />
                      <button class="btn-remove-shot" title="删除截图">✕ 移除</button>
                    </div>
                  `
                      : ''
                  }
                </div>

                <button class="btn-submit" ${this.isSubmitting ? 'disabled' : ''}>
                  ${this.isSubmitting ? '正在提交...' : '🚀 提交并通知 AI Agent'}
                </button>
              `
                : `
                <!-- 历史与进度视图 -->
                <div class="history-controls">
                  <span style="font-size: 12px; color: #9ca3af;">共 ${this.historyList.length} 条记录</span>
                  <button class="btn-secondary btn-refresh-history">🔄 刷新</button>
                </div>

                ${
                  this.isLoadingHistory
                    ? `<div style="text-align: center; padding: 30px; color: #9ca3af;">正在获取进度...</div>`
                    : this.historyList.length === 0
                    ? `<div class="empty-history">暂无反馈记录。点击“新建反馈”提交第一条反馈！</div>`
                    : `
                    <div class="history-list">
                      ${this.historyList
                        .slice()
                        .reverse()
                        .map(
                          item => `
                        <div class="history-card">
                          <div class="card-header">
                            <span>#${item.id} · ${item.receivedAt ? item.receivedAt.slice(11, 19) : ''}</span>
                            ${this.renderStatusBadge(item.status)}
                          </div>
                          <div class="card-content">${item.content}</div>
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
                      `
                        )
                        .join('')}
                    </div>
                  `
                }
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
