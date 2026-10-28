# Agent Feedback Bridge (@agent-feedback)

> **The In-App Nervous System & Live Loop for AI Coding Agents**<br>
> 面向 AI Coding Agent 时代的端侧神经系统、自愈闭环桥梁与可扩展开发者浮动工作台

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero-DCE](https://img.shields.io/badge/Production-Zero--DCE-green.svg)](#)
[![Zero-Token-Sleep](https://img.shields.io/badge/Sentinel-0%25%20CPU%20%7C%200%20Token-purple.svg)](#)
[![Theme-Ready](https://img.shields.io/badge/Design%20System-Theme%20Token%20Ready-orange.svg)](#)

---

## 🌟 为什么需要 Agent Feedback Bridge？

在 AI Coding Agent（Antigravity、Cursor、Claude Code 等）时代，开发者与 AI 结对编程的痛点依然存在于**“运行时感知与真机还原”**：
- 在手机真机、移动端 Web 或桌面端测试时发现 Bug，传统方式需要切出应用、手工截屏、打开 IDE 聊天框打字描述；
- 现场报错、控制台异常、网络状态、DOM 快照与精确视口难以一并提供给 AI；
- 传统 APM/反馈工具（Sentry、Marker.io）是将工单发给人（Jira/Slack），而我们需要的是**直接唤醒本地 IDE 中的 Coding Agent 自行分析并热修复**。

**Agent Feedback Bridge 提供的革命性自愈闭环**：
```
[真机/端侧一键点击] ──(截图+路由+报错全息打包)──> [本地 DevServer 日级分片队列]
                                                          │
                                                    (10s 防抖聚合)
                                                          │
                                                          ▼
[端侧时间轴实时同步修复进展] <──(CLI/状态回写)── [唤醒 IDE 中的 Coding Agent 自愈闭环]
```

---

## ✨ 核心特性

- 🚀 **0 侵入一行接入 (Zero-Code DX)**：只需在 `vite.config.ts` 加入插件，业务代码无需修改即可自动在页面挂载磁吸胶囊。
- 🛡️ **0 样式污染 (Shadow DOM Isolation)**：端侧悬浮窗完全运行在独立 Open Shadow Root 中，与业务 CSS 100% 隔离。
- 🎨 **三层 Theme Token 主题系统**：
  - 内置 `dark`（暗黑极客）、`light`（清爽浅色）与 `auto`（自适应系统/宿主暗黑类名）预设；
  - CSS 自定义属性（`--af-primary`、`--af-bg-base`、`--af-bg-surface` 等）天然穿透 Shadow DOM，1 行 CSS 即可统一全组件品牌色。
- 🔌 **扩展槽插件体系 (Extension Tabs API)**：
  - 不仅是反馈工具，更是通用的开发者浮动工作台！
  - 宿主项目可通过 `registerExtensionTab` 自由注册自定义 Tab（例如：内测在线更新、Mock 控制台、通信穿透诊断等）。
- 📅 **日级分片存储架构 (Daily Sharded Queue)**：
  - 工单按天归档为 `feedback_YYYY-MM-DD.json` + `feedback_index.json`，彻底告别单文件膨胀与读写冲突，海量历史毫秒级加载。
- ⏱️ **流式时间轴与双向通知 (Timeline UI)**：
  - 首屏秒开最新一天工单，支持向上流式触底加载历史记录；
  - 独立支持 `[🤖 Agent 系统通知]`（高光青绿卡片）与 `[👤 用户反馈]`，支持流水线或 Agent 主动向端侧推送通知。
- 💤 **0 Token 静默休眠与秒级唤醒**：无反馈时保持休眠（0% CPU 占用、0 大模型 Token 消耗）；捕获新反馈后开启 10 秒防抖聚合，并通过适配器主动唤醒 IDE 中的 AI 会话。
- 🌐 **0 生产残留 (100% Zero-DCE)**：生产构建（`vite build`）全量物理剥离，构建产物增加 0 字节，0 调试接口泄露。

---

## 📦 Monorepo 子包结构

| 包名 | 职责与能力 |
| :--- | :--- |
| [`@agent-feedback/core`](packages/core) | 标准数据契约（InAppFeedback）、日级索引接口、扩展槽规范与启发式注入/破坏指令安全防御 |
| [`@agent-feedback/client`](packages/client) | `<agent-feedback-widget>` Web Component、磁吸手势、流式时间轴、Theme Token 与扩展槽挂载器 |
| [`@agent-feedback/vite-plugin`](packages/vite-plugin) | Vite/Rollup 构建插件、日级分片落盘引擎、DevServer 中间件与生产 Zero-DCE 剥离 |
| [`@agent-feedback/sentinel`](packages/sentinel) | Node 原生静默哨兵 CLI（`npx agent-feedback watch/notice`）、10s 防抖聚合与多 IDE 适配器 |

---

## 🚀 快速上手 (Quick Start)

### 1. 安装依赖

```bash
npm install -D @agent-feedback/vite-plugin
# 或
pnpm add -D @agent-feedback/vite-plugin
```

### 2. 在 Vite 中启用

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue' // 或 react()
import agentFeedback from '@agent-feedback/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    agentFeedback({
      storageDir: 'scratch/feedback', // 工单日级分片本地存储目录 (默认: .agent/feedback)
      theme: 'dark',                  // 主题模式: 'dark' | 'light' | 'auto' (默认: 'dark')
      primaryColor: '#4edea3',        // 自定义核心主色 (可选)
      tunnel: false                   // 是否自动开启临时 HTTPS 穿透 (默认: false)
    })
  ]
})
```

### 3. 启动开发服务与哨兵

```bash
# 终端 1：启动应用 (此时页面已自动出现磁吸悬浮胶囊)
npm run dev

# 终端 2：启动 AI 哨兵守候 (当收到端侧反馈时自动防抖并唤醒 IDE 中的 Agent)
npx agent-feedback watch --dir scratch/feedback
```

---

## 🔌 扩展槽功能指南 (Extension Tabs API)

`@agent-feedback/client` 提供了灵活的扩展槽机制，允许宿主应用在同一个悬浮胶囊中挂载专属的开发者功能页签（如环境切换、离线包更新、通信诊断等），使移动端调试体验高度聚合，无需在界面上摆放多个悬浮按钮。

### 注册自定义扩展 Tab 示例

```typescript
import { registerExtensionTab } from '@agent-feedback/client'
import { createApp } from 'vue' // 支持 Vue / React / 原生 HTML
import MyCustomDebugPanel from './components/MyCustomDebugPanel.vue'

// 在应用入口 (如 main.ts) 中注册
if (import.meta.env.DEV) {
  registerExtensionTab({
    id: 'my-custom-tools',            // 唯一 ID
    label: '🛠️ 联调与工具',             // Tab 显示文本 (支持 Emoji 或图标)
    render(container, context) {
      // 方式 A: 挂载 Vue 组件
      const app = createApp(MyCustomDebugPanel, {
        onClose: context.closeModal,
        onSwitchTab: context.openTab
      })
      app.mount(container)

      // 返回清理回调 (切走 Tab 或销毁时触发)
      return () => {
        app.unmount()
      }

      /* 方式 B: 原生 DOM 渲染
      container.innerHTML = `
        <div style="padding: 16px; color: var(--af-text-main);">
          <h3>自定义开发面板</h3>
          <button id="btn-action" style="background: var(--af-primary);">执行动作</button>
        </div>
      `
      */
    }
  })
}
```

> **提示 (Shadow DOM 样式隔离注意项)**：
> 由于扩展内容挂载在 Web Component 的 Shadow DOM 内部，宿主页面的全局外部 CSS（如 Tailwind 全局原子类）默认不会穿透进去。
> 建议在自定义扩展组件内使用内嵌样式或 Scoped CSS，并优先复用 `@agent-feedback` 提供的 `--af-*` 语义化设计 Token。

---

## 🎨 主题与样式定制 (Theme Token System)

组件内部使用 CSS Custom Properties 组织样式，完全支持穿透 Shadow DOM 进行品牌定制：

```css
/* 在宿主项目的任意全局 CSS 文件中 */
:root {
  --af-primary: #2563eb;       /* 核心主色：胶囊边框、按钮、高亮焦点 */
  --af-bg-base: #ffffff;       /* 底层背景：模态框底层、输入框背景 */
  --af-bg-surface: #f8fafc;    /* 卡片表面：工单卡片、选项容器 */
  --af-text-main: #0f172a;     /* 一级文本颜色 */
  --af-text-muted: #64748b;    /* 次级文本颜色、时间戳 */
  --af-border: rgba(0,0,0,0.08); /* 边框与分割线颜色 */
  --af-radius: 12px;           /* 核心容器圆角 */
}
```

---

## 🛠️ CLI 命令行工具链

`@agent-feedback/sentinel` 提供了便捷的命令行能力：

```bash
# 1. 启动静默监听哨兵
npx agent-feedback watch --dir scratch/feedback --adapter antigravity

# 2. 向端侧时间轴主动插入一条 Agent 系统通知 (支持 CI/CD 或任务完成后自动调用)
npx agent-feedback notice "🎉 新版本已部署，修复了详情页图片偶发白屏问题，请在手机端复验。" --dir scratch/feedback

# 3. 更新工单状态并写入自愈说明 (闭环通知端侧)
npx agent-feedback update-status <feedback-id> completed "经排查问题已修复并在当前版本生效，请在端侧下拉刷新验证。" --dir scratch/feedback
```

---

## 📱 完整工业级参考项目 (Reference Implementation)

本项目已在开源户外拓扑应用 **《每周一山 · 成都周边50座山》** 中完成端到端全链路落地与实战检验：

- 🔗 **参考工程 GitHub 仓库**：[lylyuanliang/weekly-mountain](https://github.com/lylyuanliang/weekly-mountain)
- 🌿 **完整接入代码分支**：[`feat/integrate-agent-feedback`](https://github.com/lylyuanliang/weekly-mountain/tree/feat/integrate-agent-feedback)

### 架构落地与最佳实践亮点

1. **职责正交解耦 (Clean Separation of Concerns)**：
   在宿主工程的 [`vite.config.js`](https://github.com/lylyuanliang/weekly-mountain/blob/feat/integrate-agent-feedback/vite.config.js) 中，业务专属的构建逻辑与服务（如业务发布下载、离线包、特定 API Mock 等）保持在独立的轻量插件中，而将所有的真机现场抓取、日级分片落盘与哨兵唤醒彻底委托给 `agentFeedback()` 插件，实现极高内聚与清晰解耦。
2. **统一开发者入口与扩展槽 (Unified Developer Hub via Extension Tabs)**：
   通过 [`src/debug/setupAgentFeedback.js`](https://github.com/lylyuanliang/weekly-mountain/blob/feat/integrate-agent-feedback/src/debug/setupAgentFeedback.js) 调用 `registerExtensionTab`，将应用专属的内测在线更新、下载进度展示、WakeLock 切屏防中断以及局域网穿透诊断等能力无缝注入为同一个悬浮模态框的自定义 Tab（`🛠️ 联调与更新`），手机屏幕上只有一个悬浮胶囊即可纵览全部开发者能力，彻底避免多悬浮球相互遮挡。
3. **沉浸式主题系统融合 (Design System Integration)**：
   展示了在强风格化的暗黑拓扑应用中，如何仅通过配置主题模式（`theme: 'dark'`、`primaryColor: '#4edea3'`）并声明基础 CSS Token，使悬浮组件与宿主既有的黑曜石半透明高山设计系统融为一体，保持专业一致的视觉体验。

---

## 📄 开源许可证

本项目采用 [MIT 许可证](LICENSE)。
