# Changelog

本项目严格遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/) 语义化版本规范。

---

## [1.1.0] - 2026-10-30

### 🚀 重大核心特性 (Key Highlights)

- **Vite 插件原生哨兵全生命周期托管 (DevServer Companion Sentinel)**
  - `@agent-feedback/vite-plugin` 新增原生 `sentinel` 托管选项；
  - 随 `npm run dev` 启动自动在后台静默拉起守护监听（0% CPU、0 Token 消耗）；
  - 随 DevServer 关闭（`SIGINT` / `SIGTERM` / `httpServer.close`）优雅清理并自动退出；
  - 彻底解绑“处理完反馈后必须手动敲命令重启哨兵”的人工提示词软约束，实现与业务开发同生共死、零心智负担。

- **跨终端工作区会话智能感知与零配置升级 (Zero-Config Active Session Auto-Discovery)**
  - 针对开发者在外部常规命令行终端（VS Code 终端、PowerShell、Bash、CMD）手动执行 `npm run dev` 的真实开发场景，突破环境变量沙箱边界；
  - 哨兵与 Vite 插件利用 Node.js 22.5+ 原生内置的 `node:sqlite` 引擎（**零外部 Native 依赖、纯内建检索**），自动读取 `~/.gemini/antigravity/conversation_summaries.db`；
  - 按项目当前工作区路径（`process.cwd()`）精确推断当前打开的 Antigravity 活跃会话 ID；
  - 自动将适配器从 `webhook` 无感提升为 `antigravity` 并无缝绑定，实现真·零配置开箱即用。

- **Antigravity 原生总线主动唤醒 (Zero-Downtime Native Wakeup)**
  - 端侧反馈防抖聚合（默认 10 秒）完成后，直接调用系统级原生 `agentapi send-message <conversationId> "<message>"` 消息总线；
  - 彻底淘汰依赖 `process.exit(0)` 子进程退出触发外层检测的陈旧机制，保证 DevServer 在后台持续稳定运行，会话端侧毫秒级主动唤醒进驻修复；
  - 原生自适应 Windows 批处理（`agentapi.bat`）与 POSIX 脚本（`agentapi`）绝对路径，免除 PATH 丢失风险。

- **全智能体接入生态支持矩阵 (Multi-Agent Ecosystem Matrix)**
  - 落地官方多智能体接入生态系统指南 [`docs/multi-agent-integration-guide.md`](docs/multi-agent-integration-guide.md)；
  - 针对 Antigravity、Claude Code、Codex、DSH、ZCode、Cursor、Cline 等主流智能体，给出适配器选择、生命周期契约与命令行触发规范。

- **测试工程扩充与健壮性保障**
  - 全 Monorepo 单元测试用例扩充至 84 项（100% 绿灯，0 fail, 0 hanging）；
  - 覆盖按天分片流式聚合、启发式安全防线（防 Prompt 注入与破坏性执行）、常驻持续守护、跨终端会话自动推断等核心通路；
  - 客户端历史与状态轮询定时器添加 `.unref()`，彻底消除 Node.js 虚拟 DOM 测试环境下的悬挂问题。

---

### 📦 发布的包版本矩阵 (Package Matrix)

| 包名 (Package Name) | 发布版本 | 说明 |
| :--- | :--- | :--- |
| [`@lylyuanliang/agent-feedback-core`](packages/core) | `v1.1.0` | 协议定义、日级分片索引规范与启发式安全分诊防线 |
| [`@lylyuanliang/agent-feedback-client`](packages/client) | `v1.1.0` | Shadow DOM 移动端悬浮球、遥测采集引擎与时间轴历史面板 |
| [`@lylyuanliang/agent-feedback-sentinel`](packages/sentinel) | `v1.1.0` | 静默哨兵、Antigravity 原生总线唤醒、MCP Server 与 CLI 状态回写工具 |
| [`@lylyuanliang/agent-feedback-vite-plugin`](packages/vite-plugin) | `v1.1.0` | Vite 打包器插件、DevServer 中间件、Zero-DCE 生产剥离与伴生自动托管 |

---

### 💡 接入与升级指南 (Migration Guide)

本版本对 `1.0.0` 保持 **100% 向前兼容**。

#### 1. 升级安装
```bash
npm install -D @lylyuanliang/agent-feedback-vite-plugin@^1.1.0 @lylyuanliang/agent-feedback-client@^1.1.0
```

#### 2. 在 `vite.config.ts` 或 `vite.config.js` 中开启哨兵托管
```javascript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import agentFeedback from '@lylyuanliang/agent-feedback-vite-plugin';

export default defineConfig({
  plugins: [
    vue(),
    agentFeedback({
      storageDir: 'scratch/feedback', // 持久化队列目录
      theme: 'dark',                  // 暗黑/明亮主题
      primaryColor: '#4edea3',       // 品牌主色
      sentinel: {
        autoStart: true,              // 伴随 npm run dev 自动启动哨兵，随服务终止自动销毁
        debounceSeconds: 10           // 捕获首条反馈后 10 秒防抖收集窗口
      }
    })
  ]
});
```

启动 DevServer 后即可看到控制台提示：
```text
[@agent-feedback/vite-plugin] 哨兵已伴随 DevServer 自动启动 (适配器: antigravity (会话: 66cdabf9...), 常驻守护)
```

---

## [1.0.0] - 2026-10-28

- 初始正式版本发布；
- 实现全生命周期端内即时反馈系统：
  - Shadow DOM 完全样式隔离与移动端真机截屏/遥测采集；
  - DevServer Connect 中间件与按天分片存储；
  - 生产打包构建 100% Zero-DCE (Dead-Code Elimination) 剥离；
  - 启发式三道安全防线（防注入、防篡改、防御性实施）。
