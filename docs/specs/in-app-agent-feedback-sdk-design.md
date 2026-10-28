# In-App Agent Feedback Bridge SDK 设计规范 (Design Spec)

> **文档版本**: 1.0.0
> **创建日期**: 2026-10-27
> **状态**: 已评审确认 (Approved)
> **独立项目根目录**: `D:\file_save\workspace\github\agent-feedback`
> **灵感与实践源**: 《每周一山 · 成都周边50座山》移动端真机公测

---

## 1. 产品定位与核心价值 (Product Positioning)

**产品定位**：
> **「面向 AI Coding Agent 时代的端侧神经系统与自愈闭环桥」**
> **(The In-App Nervous System & Live Loop for AI Coding Agents)**

不同于传统面向人类团队的工单系统（如 Sentry Feedback / Marker.io，收集后派发 Jira），本工具专门为**“开发者 + AI Coding Agent”**结对开发打造。它连接“正在运行的端侧应用（移动端真机 / 浏览器 / 桌面端）”与“IDE 中沉睡/待命的 Coding Agent”，构建即时感知、主动唤醒、自主修复与状态回写的自愈闭环。

### 核心价值
1. **0 侵入极简接入 (Zero-Code DX)**：开发期只需在 `vite.config.ts` 配置一行插件，业务代码 0 修改。
2. **0 样式污染 (Shadow DOM Isolation)**：端侧界面完全封装在 Custom Element 内，绝不污染也不受业务项目样式影响。
3. **0 Token 静默休眠与秒级唤醒**：无反馈时 0% CPU、0 Token 消耗；捕获反馈后 10 秒防抖聚合，并通过适配器秒级主动唤醒 IDE 中的 AI Agent。
4. **0 配置移动端真机穿透 (Smart HTTPS Tunnel)**：自动生成合法 HTTPS 临时公网隧道与终端扫码二维码，手机无需同一 Wi-Fi 即可秒级调试与截图。
5. **0 生产泄漏 (Zero-DCE)**：生产构建时 100% 物理剥离，Release 包 0 字节体积增加、0 接口与地址泄漏。

---

## 2. 总体架构与 Monorepo 包拓扑

```
agent-feedback/ (Monorepo)
├── packages/
│   ├── core/                  # @agent-feedback/core
│   │   ├── 协议定义 (InAppFeedback Schema、Telemetry Types)
│   │   ├── 状态机 (pending -> processing -> completed / rejected)
│   │   └── 基础工具 (防注入校验、时间戳格式化、防抖算法)
│   │
│   ├── client/                # @agent-feedback/client
│   │   ├── Shadow DOM Web Component (<agent-feedback-widget>)
│   │   ├── 磁吸手势交互与 Safe-Area 感知
│   │   ├── 全息遥测抓取 (Console Logs 环形缓冲、路由追踪、Window 错误捕获)
│   │   ├── 三级截屏策略 (轻量 SVG DOM 序列化 / 平台原生 / 相册上传)
│   │   └── 进度与历史面板 (实时追踪 Agent 修复进度与答复详情)
│   │
│   ├── vite-plugin/           # @agent-feedback/vite-plugin
│   │   ├── Dev 模式：自动注入虚拟脚本 /@agent-feedback/client
│   │   ├── DevServer Connect 中间件：挂载 /api/__agent_feedback/*
│   │   ├── 智能穿透管理：自动启动 Cloudflare Quick Tunnel / Pinggy 并打印终端二维码
│   │   ├── 本地持久化：自动管理 .agent/feedback/ 队列及自动追加 .gitignore
│   │   └── Build 模式：100% 物理剔除 (Zero-DCE)
│   │
│   └── sentinel/              # @agent-feedback/sentinel (CLI & Agent 桥梁)
│       ├── Node 原生静默监听器 (无依赖、2秒轮询、0% CPU)
│       ├── 10 秒防抖聚合窗口 (Debounce Window)
│       ├── 插件式唤醒适配器矩阵 (Antigravity 退出码 / MCP Server / Webhook)
│       └── 三道安全防线审查与状态回写
```

---

## 3. 端侧组件与全息遥测引擎规范 (`@agent-feedback/client`)

### 3.1 Shadow DOM 封装
- 自定义元素标签：`<agent-feedback-widget>`；
- 内部采用 `mode: 'closed'` 或 `open` 的 Shadow Root，内置全部 Scoped CSS；
- 触发胶囊支持拖拽移动，在松手时计算屏幕中线，平滑吸附贴靠屏幕左侧或右侧边缘；
- 内置呼吸灯：绿色（就绪）、橙色脉冲（正在处理，展示排队数）、蓝色/徽标（历史完成项）。

### 3.2 全息遥测数据协议 (Telemetry Protocol)
```typescript
export interface InAppFeedback {
  id: number;                   // 毫秒时间戳 ID (如 1793009756156)
  timestamp: number;
  receivedAt: string;           // ISO 8601 字符串
  content: string;              // 用户描述
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'ignored';
  reply?: string;               // Agent 分析修复后的回复内容
  updatedAt?: string;

  telemetry: {
    route: string;              // 页面路径与 Query
    viewport: { width: number; height: number; dpr: number };
    userAgent: string;
    platform: 'android' | 'ios' | 'web' | 'desktop';
    appVersion?: string;
  };

  screenshots?: string[];       // 截图 Base64 或持久化图片相对路径
  consoleLogs?: Array<{
    type: 'log' | 'warn' | 'error';
    message: string;
    timestamp: number;
  }>;
}
```

### 3.3 遥测抓取细节
1. **控制台代理 (Console Proxy)**：代理 `console.log`、`warn`、`error`，维护最近 30 条日志环形队列，原汁原味透传原生控制台。
2. **全局异常监听**：捕获 `window.onerror` 与 `window.onunhandledrejection` 报错堆栈。
3. **路由感知**：拦截 `history.pushState`、`history.replaceState` 与 `window.onhashchange`。
4. **轻量截屏策略**：
   - 首选：基于 SVG `<foreignObject>` 将可视区域 DOM 渲染至 Canvas（体积 < 8KB）；
   - 次选：Electron/Tauri 原生截图 API 或 Web API `navigator.mediaDevices.getDisplayMedia`；
   - 保底：系统相册图片选择控件。

---

## 4. 构建插件与中继中间件规范 (`@agent-feedback/vite-plugin`)

### 4.1 开发者接入体验
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import agentFeedback from '@agent-feedback/vite-plugin'

export default defineConfig({
  plugins: [
    agentFeedback({
      tunnel: true // 开启手机真机 HTTPS 穿透 (默认 false)
    })
  ]
})
```

### 4.2 核心行为矩阵
1. **虚拟模块注入 (`transformIndexHtml`)**：
   - 拦截 `index.html`，在 `command === 'serve'` 时动态注入：
     `<script type="module" src="/@agent-feedback/client"></script>`
   - 通过 `resolveId` 和 `load` 在内存中输出 Web Component 客户端脚本。
2. **DevServer Connect 中间件**：
   - 挂载路由：
     - `POST /api/__agent_feedback/submit` -> 写入 `.agent/feedback/feedback_queue.json`，Base64 截图转存 `.agent/feedback/screenshots/<id>.png`。
     - `GET /api/__agent_feedback/list` -> 返回最新反馈队列与处理状态。
     - `GET /api/__agent_feedback/stream` -> SSE 实时事件流，通知端侧状态更新。
3. **智能穿透与终端二维码**：
   - 若 `tunnel: true` 或 CLI `--tunnel`，启动临时 HTTPS 隧道子进程；
   - 自动适配 Vite `server.allowedHosts: true`；
   - 在终端通过 `qrcode-terminal` 输出真机可扫的 HTTPS 二维码。
4. **生产零泄漏 (Zero-DCE)**：
   - 在 `command === 'build'` 时直接返回空插件；
   - 打包产物体积增加 0 字节，0 调试接口与地址残留。

---

## 5. Node 原生哨兵与 Agent 闭环规范 (`@agent-feedback/sentinel`)

### 5.1 CLI 启动与监听
```bash
# 启动静默哨兵 (默认适配 Antigravity)
npx agent-feedback watch

# 启动为标准 MCP Server (供 Cursor / Claude Desktop / VS Code)
npx agent-feedback mcp
```

### 5.2 核心机制
1. **静默休眠**：纯 Node/TS 实现，2 秒轮询一次本地 JSON 文件的修改时间戳，0% CPU 占用，0 Token 消耗。
2. **10 秒防抖聚合窗口 (Debounce Window)**：
   - 捕获第 1 条新反馈后，开启 10 秒倒计时；
   - 合并此期间连发的多条补充说明与截图为单一结构化批次；
   - 将批次状态更新为 `processing` 并写入初始提示。
3. **适配器矩阵 (Pluggable Adapters)**：
   - **Antigravity 适配器**：防抖结束后以 `process.exit(0)` 正常退出，非 daemon 异步任务结束直接触发会话主动唤醒；
   - **MCP 适配器**：暴露 `get_pending_feedback()` 与 `update_feedback_status(id, status, reply)` 工具；
   - **Webhook / Shell 适配器**：支持检测到新反馈后触发外部脚本或桌面通知。

### 5.3 三道安全防御防线 (Security & Triage)
- **第 1 防线：防 Prompt 注入与指令劫持**：识别诱导“忽略之前规则”、“删除系统文件”、“执行 rm -rf / 格式化”、“更改系统密钥”等注入文本，直接拦截标记为 `rejected`。
- **第 2 防线：可行性与破坏性设计审查**：拒绝推翻核心设计系统、清空业务数据等非理性诉求。
- **第 3 防线：防御性安全实施与测试闭环**：Agent 修复代码 -> 运行回归测试 -> 状态标记为 `completed` 并在 `reply` 中交代关键决策。
- **哨兵重启铁律**：Agent 完成修复并更新状态后，必须重新拉起新的哨兵进程，保持持续无损监听。
