# Agent Feedback Bridge (@agent-feedback)

> **The In-App Nervous System & Live Loop for AI Coding Agents**
> 面向 AI Coding Agent 时代的端侧神经系统与自愈闭环桥梁

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero-DCE](https://img.shields.io/badge/Production-Zero--DCE-green.svg)](#)
[![Zero-Token-Sleep](https://img.shields.io/badge/Sentinel-0%25%20CPU%20%7C%200%20Token-purple.svg)](#)

---

## 🌟 为什么需要 Agent Feedback Bridge？

在 AI Coding Agent（Antigravity、Cursor、Claude Code 等）时代，开发者与 AI 结对编程的痛点依然存在于**“运行时感知”**：
- 当你在手机真机、浏览器或桌面端测试应用时发现 Bug，传统方式需要切出应用、截屏打字、打开聊天框描述；
- 崩溃瞬间的控制台报错、网络状态、DOM 快照与精确视口难以一并交给 AI；
- 传统 APM/反馈工具（Sentry、Marker.io）是将工单发给人（Jira/Slack），而我们需要的是**直接唤醒 IDE 中的 Agent 自行分析并修复**。

**Agent Feedback Bridge 提供的革命性闭环**：
```
[真机/端侧一键点击] ──(截图+路由+报错全息打包)──> [本地 DevServer 队列]
                                                          │
                                                    (10s 防抖聚合)
                                                          │
                                                          ▼
[端侧实时展示修复结论与文件] <──(状态回写)── [唤醒 IDE 中的 Coding Agent 自愈]
```

---

## ✨ 核心特性

- **0 侵入一行接入 (Zero-Code DX)**：只需在 `vite.config.ts` 加入插件，业务前端代码 0 改动。
- **0 样式污染 (Shadow DOM Isolation)**：端侧悬浮窗完全运行在独立 Shadow Root 中，与业务 CSS 100% 隔离。
- **0 Token 静默休眠与秒级唤醒**：无反馈时 0% CPU 占用、0 大模型 Token 消耗；捕获提交后 10 秒防抖聚合，并通过适配器秒级主动唤醒 IDE 中的 AI Agent。
- **0 配置真机穿透 (Smart HTTPS Tunnel)**：支持 `--tunnel` 自动拉起合法 HTTPS 临时公网隧道与终端二维码，手机跨 Wi-Fi / 跨网秒级扫码联调。
- **0 生产泄漏 (Zero-DCE)**：生产环境（`vite build`）全量物理剔除，构建产物增加 0 字节，0 调试接口泄露。
- **多 IDE 适配器矩阵**：开箱即用支持 Antigravity 退出码模式、Cursor / Claude / VS Code 标准 MCP Server 模式。

---

## 📦 Monorepo 包结构

| 包名 | 职责与能力 |
| :--- | :--- |
| [`@agent-feedback/core`](packages/core) | 标准协议、InAppFeedback Schema、状态机与安全防注入校验工具 |
| [`@agent-feedback/client`](packages/client) | `<agent-feedback-widget>` Web Component、磁吸手势、全息遥测抓取与轻量截屏 |
| [`@agent-feedback/vite-plugin`](packages/vite-plugin) | Vite/Rollup 构建插件、DevServer 中间件、HTTPS 隧道生成与生产 Zero-DCE 剥离 |
| [`@agent-feedback/sentinel`](packages/sentinel) | Node 原生静默监听器 CLI（`npx agent-feedback watch`）、10s 防抖聚合与多 IDE 适配器 |

---

## 🚀 快速上手 (Quick Start)

### 1. 安装插件
```bash
npm install -D @agent-feedback/vite-plugin
# 或
pnpm add -D @agent-feedback/vite-plugin
```

### 2. 在 Vite 中启用 (仅需 1 行)
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import agentFeedback from '@agent-feedback/vite-plugin'

export default defineConfig({
  plugins: [
    agentFeedback({
      tunnel: true // 开启手机真机 HTTPS 穿透 (可选)
    })
  ]
})
```

### 3. 启动开发服务与哨兵
```bash
# 终端 1：启动应用
npm run dev

# 终端 2：启动 AI 哨兵守候
npx agent-feedback watch
```

---

## 📖 架构设计文档
详见：[In-App Agent Feedback Bridge SDK 设计规范](docs/specs/in-app-agent-feedback-sdk-design.md)
