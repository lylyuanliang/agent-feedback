# Changelog

本项目严格遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/) 语义化版本规范。

---

## [1.4.0] - 2026-11-05

### 🚀 重大核心特性 (Key Highlights)

- **服务端全面受限访问门禁拦截 (Server-Side Access Gatekeeper - Default Enabled)**
  - `@agent-feedback/vite-plugin` 的 `accessControl` 默认置为开启（`enabled: true`），同时支持传入 `accessControl: { enabled: false }` 或 `accessControl: false` 按需关闭；
  - 严格拦截未授权请求：所有历史工单读取（`GET /list`、`GET /dates`）、反馈提交（`POST /submit`）、工单状态回写（`POST /status`）、通知广播（`POST /notice`）及媒体分块上传（`POST /media/chunk`, `POST /media/upload`）接口全面实施 401 鉴权拦截，彻底阻断未授权用户查看历史工单、日志与排查信息；
  - 自动向后兼容放行静态媒体流读取（`GET /screenshots/` 与 `GET /media/`），确保移动端与浏览器 `<img>`/`<video>` 标签在已授权历史中流畅渲染。

- **动态内测密钥自动生成与零凭据泄漏 (Auto Secret Generation & Bundle Sanitization)**
  - 服务端启动时若未显式指定密钥或环境变量（`AGENT_FEEDBACK_SECRET`），自动在项目根目录生成未追踪的本地密钥文件 `scratch/.agent-feedback-secret`；
  - 客户端构建与虚拟模块加载时自动过滤并剔除明文 `accessKey`，仅下发安全脱敏的 SHA-256 哈希散列值（`keyHash`），严守零凭据泄漏安全红线；
  - 自动将 `scratch/` 与 `.agent-feedback-secret` 纳入 `.gitignore` 保护。

- **远程与混合端（Capacitor/Hybrid）动态密钥配对校验 (Dynamic Remote Verification)**
  - 服务端新增 `GET /api/__agent_feedback/auth/config` 公共探针端点与 `POST /api/__agent_feedback/auth/verify` 鉴权校验端点；
  - `@agent-feedback/client` 客户端增强 `authorize(key)`：当客户端与构建期静态哈希不一致时（如 CI 自动化编译生成的独立 Debug APK 与开发者本地 DevServer 秘钥不一致），自动发起远程 DevServer 校验，通过后动态信任并持久化；
  - 「⚙️ 联调设置」面板在「测试连通性」与「保存地址」时自动向目标服务同步门禁状态；
  - 客户端所有 API 请求自动携带统一授权请求头（`Authorization: Bearer <key>`、`X-Access-Hash`）。

- **客户端历史面板访问保护 (History Tab Lockout Shield)**
  - 「历史与进度」面板新增未授权拦截保护层，未授权状态下阻断列表查询与定时轮询，展示安全遮罩并支持一键跳转「⚙️ 联调设置」完成配对解锁。

---

## [1.3.0] - 2026-11-04

### 🚀 重大核心特性 (Key Highlights)

- **原生受限访问安全门禁 (Access Control & Security Gatekeeper)**
  - `@agent-feedback/core` 新增 `AccessControlConfig` 与 `HostChannelConfig` 契约，支持受限访问启用、明文密钥配对、SHA-256 安全哈希比对与自定义宿主外链；
  - `@agent-feedback/client` 实现本地授权认证引擎与 `localStorage` 凭据持久化（默认 key 为 `af_access_key`，支持自定义 `storageKey`）；
  - 新建反馈面板原生受限保护屏障（Lockout Shield）：未授权时拦截工单提交，提示普通用户前往宿主渠道（如 GitHub Issues）提交反馈，并提供密钥输入与“验证解锁”交互；
  - 导出 `setAccessControl`, `getAccessControl`, `setHostChannel`, `getHostChannel`, `isAuthorized`, `authorize`, `deauthorize` 等完整公共方法。

- **原生内置「⚙️ 联调设置」面板与连通性测试 (In-App Settings & Connectivity Probe)**
  - 客户端选项卡新增原生「⚙️ 联调设置」(Settings Tab)；
  - 支持移动端真机及公测环境下动态配置与持久化 API 基地址（`localStorage: af_api_base`），并提供一键「测试连通性」探针；
  - 支持开发者输入配对密钥进行实时验证、展示授权状态徽标并提供「解除授权」；
  - 内置展示宿主官方渠道快速跳转卡片。

- **Vite 插件原生透传 (Vite Plugin Options Passthrough)**
  - `@agent-feedback/vite-plugin` 的 `agentFeedback` 插件选项新增 `accessControl` 与 `hostChannel`，并在运行时虚拟模块（`window.__AGENT_FEEDBACK_OPTIONS__`）中自动序列化透传至客户端。

---

## [1.2.0] - 2026-11-03

### 🚀 重大核心特性 (Key Highlights)

- **独立分块媒体流式上传 (Multipart Binary Media Storage)**
  - 客户端支持视频录屏文件（`mp4`, `webm`, `quicktime`）选择与 1MB 物理分块二进制流式切片上传（`uploadMediaInChunks`）；
  - 服务端独立 `media/` 存储、分块临时暂存合并（`POST /api/__agent_feedback/media/chunk`）与单文件上传（`POST /api/__agent_feedback/media/upload`）；
  - 服务端媒体接口支持 HTTP 206 Partial Content (Range: bytes=...) 切片传输，支持移动端 WebView 原生流畅播放与拖拽 Seek；
  - 历史时间轴与全屏 Lightbox 内嵌高山暗曜石风格原生 `<video>` 播放器。

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
