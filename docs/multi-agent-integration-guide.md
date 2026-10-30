# 智能体底层通信架构与技术白皮书 (Multi-Agent Integration Architecture Whitepaper)

> **Agent Feedback Bridge** 是一套面向所有现代 AI Coding Agent 的开放式端侧神经系统。它**绝不仅限于某一款特定的 Agent**，而是通过解耦的「端侧全息采证 ➔ 本地分片存储 ➔ 静默防抖哨兵 ➔ 多模态唤醒适配器」流水线，全面支持市场上所有主流与自研智能体。

---

## 1. 架构总览：多 Agent 唤醒与分发拓扑

哨兵（Sentinel）内部包含**通用防抖收集内核**与**可插拔适配器（Pluggable Adapters）**：

```mermaid
flowchart TD
    Device["📱 移动端真机 / 浏览器端"] -->|"全息采证打包 (截屏+堆栈+路由)"| DevServer["⚡ Vite / Webpack 中间件"]
    DevServer -->|".agent/feedback/ 日级分片落盘"| Storage[("📁 本地分片工单存储")]
    Storage -->|"静默轮询 (0% CPU, 0 Token)"| Sentinel["🛰️ agent-feedback 哨兵内核"]

    Sentinel -->|"捕获第 1 条新反馈"| Debounce["⏱️ 10s 防抖聚合窗口 (归并连发截图/补充说明)"]
    Debounce -->|"启发式安全分诊"| Dispatcher{"🔄 适配器路由器<br>(--adapter)"}

    Dispatcher -->|"antigravity"| Antigravity["🪐 Antigravity<br>(工作区反查 -> 毫秒级主动唤醒当前会话)"]
    Dispatcher -->|"webhook (--webhook-cmd)"| CLI_Agents["💻 Headless CLI Agents<br>• Claude Code (claude -p)<br>• OpenAI Codex (codex exec)<br>• DSH / DeepSeek Shell<br>• ZCode 内部自研 CLI"]
    Dispatcher -->|"webhook (--webhook-url)"| Webhook_Agents["🌐 云端 / 平台级 Agents<br>• ZCode 任务调度中心<br>• 自建 Webhook 服务 / 企业微信 / 钉钉"]
    Dispatcher -->|"mcp (Stdio Server)"| MCP_Agents["🔌 MCP 协议智能体<br>• Cursor / Windsurf<br>• Claude Desktop / Code<br>• VS Code (Cline / Roo Code)"]

    Antigravity -->|"源码诊断修复 + 测试闭环"| Fix["🛠️ 自动化排查与源码修复"]
    CLI_Agents -->|"源码诊断修复 + 测试闭环"| Fix
    Webhook_Agents -->|"源码诊断修复 + 测试闭环"| Fix
    MCP_Agents -->|"源码诊断修复 + 测试闭环"| Fix

    Fix -->|"npx agent-feedback update-status"| Callback["✅ 状态回写与分析报告"]
    Callback --> Device
```

---

## 2. 核心心智模型：Agent 怎么找到对应的会话？

许多开发者在接入其他 Agent 时会有最大的疑问：
> **“Agent 怎么知道哪个会话处理哪条反馈？是 Agent 自己去寻找会话，还是我们需要在提示词里给出复杂指令？”**

### 核心答案：
> **“不是 Agent 满地找会话，而是哨兵把工单精确送到了 Agent 嘴边！”**
> 业务 Agent 根本不需要知道“底层会话是怎么路由的”，它只需要专注做它最擅长的事：**读工单、改代码、跑单测、回写状态**。

### 各大形态的会话确立原理：

| 智能体形态 | 会话是如何定位与确立的？ | 开发者需要做什么？ |
| :--- | :--- | :--- |
| **Google Antigravity** | 哨兵反向查询本地 SQLite 数据库，通过比对活跃会话打开的工作区路径（`CWD Matching`）自动定位会话 ID，调用官方 `agentapi send-message <id>` 把高优工单塞入会话。 | **0 配置**。哨兵原生自动完成路由。 |
| **Claude Code / Codex** | 哨兵通过 `webhookCommand` 调用 Shell 命令拉起 `claude -p "..."`，拉起的命令行进程本身就是一个独立的修复任务会话，修改完代码后自动退出。 | 在 `vite.config.ts` 里配好命令即可。 |
| **DSH (DeepSeek Shell)** | 哨兵调用 `dsh headless "..."`，自动创建基于 DeepSeek 模型的轻量 CLI 修复会话，自动定位并修复代码。 | 在 `vite.config.ts` 里配置 `dsh` 命令。 |
| **ZCode (企业内部平台)** | 哨兵通过 `zcode task dispatch` 命令行或 HTTP Webhook 推送，由企业内部调度系统自动分发到对应的项目专属修复实例。 | 配置 `zcode` 命令或指定内部 Webhook URL。 |
| **Cursor / Windsurf / VS Code** | 开发者是在当前 IDE 打开的项目工程上下文里与 Agent 对话，通过 MCP 协议挂载工具，Agent 在当前窗口调用 `get_pending_feedback()` 拉取，工作区上下文天然绑定。 | 在 `.cursor/mcp.json` 注册一次 MCP 服务。 |
| **通用企业 Webhook** | 哨兵将包含报错堆栈与截图的 JSON 数据 POST 到企业网关，企业的任务调度器根据仓库地址自动分配一个后台 Agent 实例去跑任务。 | 在 `vite.config.ts` 里填上 HTTP Webhook URL。 |

---

---

## 3. 架构深度思考：为什么大部分 Agent 适配器都是 Webhook？

在查阅各智能体的接入方案时，许多开发者会产生一个直观的疑问：
> **“为什么除了 Google Antigravity 和 MCP 之外，像 Claude Code、DSH、Codex、ZCode、钉钉飞书等绝大多数 Agent，在配置里使用的都是 `adapter: 'webhook'`？”**

这背后并非巧合，而是源于 **AI 智能体的底层通信物理规律** 与 **框架的通用解耦哲学**。

### 3.1 行业物理规律：AI 智能体的底层通信本质只有「3 种形态」

抛开市场上五花八门的产品叫法（Claude Code、Cursor、DeepSeek DSH、Antigravity、OpenAI Codex、Cline 等），从操作系统进程与网络通信层来看，智能体与外部工具的交互机制在物理层面上只有 **3 种流派**：

```mermaid
flowchart TD
    subgraph ThreeParadigms["3 大主流通信机制"]
        A["🪐 流派 1：原生宿主私有 IPC<br>(如 Google Antigravity)"]
        B["🔌 流派 2：标准化上下文拉取<br>(如 Cursor / Windsurf MCP)"]
        C["⚡ 流派 3：外部事件钩子 Hook<br>(如 Claude / DSH / Codex / 企业网关)"]
    end

    A -->|"深潜机制"| A1["反查本地会话 SQLite + 底层管道<br>主动唤醒当前窗口会话"]
    B -->|"协议机制"| B1["MCP Stdio/RPC 协议<br>Agent 调用 get_pending_feedback 拉取"]
    C -->|"万能机制"| C1["广义 Webhook 调度器<br>• 本地子进程 CLI (webhookCommand)<br>• 远程 HTTP POST (webhookUrl)"]
```

| 通信机制流派 | 代表智能体 / 平台 | 底层物理协议 | 谁是主动方？ | 适用适配器类型 |
| :--- | :--- | :--- | :--- | :--- |
| **流派 1：原生宿主私有 IPC (Deep Native)** | **Google Antigravity** | 本地 SQLite 会话数据库反查 + 私有底层 IPC 管道 (`agentapi send-message`) | **哨兵主动**：直接把高优消息注入开发者当前正打开的 IDE 对话流中 | `adapter: 'antigravity'` |
| **流派 2：标准协议拉取 (Standard Pull)** | **Cursor、Windsurf、VS Code (Cline / Roo)** | Model Context Protocol (MCP) Stdio / JSON-RPC 协议 | **Agent 主动**：Agent 在当前 IDE 上下文内调用 `get_pending_feedback()` 工具拉取工单 | `adapter: 'mcp'` |
| **流派 3：事件钩子触发 (Event Hook)** | **Claude Code、DeepSeek DSH、OpenAI Codex、ZCode、企业调度中心** | **系统子进程创建 (`child_process.exec`) 或 HTTP POST 请求** | **哨兵主动**：在工单防抖聚合完成后，对外拉起新进程或推送结构化数据 | `adapter: 'webhook'` |

从上表可以看出：**除了 Antigravity（深度私有 API）与 Cursor（MCP 工具拉取）之外，市面上 80% 以上的智能体和平台，全部物理归属于「流派 3」！**

---

### 3.2 概念澄清：广义 Webhook vs 狭义 Webhook

许多开发者对 Webhook 的理解往往局限于**狭义 Webhook**：
> *通过 HTTP POST 向远程 Web 地址（如钉钉机器人、自建服务器）推送一段 JSON 数据。*

但在系统设计与事件驱动架构（EDA）中，**广义的 Webhook / Hook（钩子）** 代表的是一种**“事件发生后的外部触发机制”**：
> *“当手机端工单聚合完毕这个事件发生时，对外触发一个特定动作。”*

这个对外触发的动作在操作系统层面只有两种选择：
1. **触发本地命令行子进程（Command Hook）**：
   - 配置 `webhookCommand: 'claude -p "..."'` 或 `'dsh headless "..."'`；
   - 哨兵通过 Node.js 原生 `child_process.exec()` 拉起独立的 CLI Agent 进程，携带环境变量 `$FEEDBACK_DIR` 与 `$FEEDBACK_IDS` 前往工作区排查代码。
2. **触发远程网络端点（HTTP Webhook）**：
   - 配置 `webhookUrl: 'https://...'`；
   - 哨兵通过 HTTP POST 将包含截图和堆栈的标准 JSON 推送到企业网关或自动化集群。

为了避免让开发者在 `vite.config.ts` 中面对 `cli-adapter`、`command-adapter`、`shell-adapter`、`http-adapter` 等繁琐琐碎的细分概念，SDK 框架将这两种**“向外部派单触发”**的通用行为，统一收拢在 **`webhook`（外部钩子调度器）** 这一个总适配器下。

---

### 3.3 为什么 Webhook 是连接百家争鸣生态的“最大公约数”？

命令行（CLI）与网络请求（HTTP）是整个软件工程世界**最通用、最无技术壁垒的“通用普通话”**：
* 无论未来市场上涌现出多少种全新的终端 Agent 工具（如 X-Agent、Y-Code）；
* 无论你的企业是用 Python、Go 还是 Java 搭建的私有 AI 任务派单系统；
* **你完全不需要等待 `agent-feedback` 针对新工具发布专用适配器**，只需在 `webhookCommand` 或 `webhookUrl` 中填入一行命令或一个网址，就能在 1 分钟内完成接入闭环。

这就是为什么 Webhook 承担了连接绝大多数智能体的“万能通用胶水”角色。

---

## 4. 各智能体专项接入教程与实测状态矩阵 (Agent Hands-on & Matrix)

为了保持工程实测的严谨性，避免将“理论配置”与“真机验证”混淆，所有主流智能体的实操配置、测试脚本与避坑指南已**分文件独立沉淀于 [`docs/agents/`](agents/README.md) 体系**中。

### 4.1 全景验证状态看板

| 智能体 / 平台 | 适配器模式 (`adapter`) | 实测状态 | 专属实操接入指南 | 核心交付能力 |
| :--- | :--- | :---: | :--- | :--- |
| **Google Antigravity** | `antigravity` (默认) | 🟢 **已全流程实测** | [**01-google-antigravity.md**](agents/01-google-antigravity.md) | 原生工作区会话反查，毫秒级主动唤醒当前会话（0 配置） |
| **DeepSeek DSH** | `webhook` | 🟡 **实机联测中** | [**02-deepseek-dsh.md**](agents/02-deepseek-dsh.md) | `dsh headless` CLI 子进程单次任务独立会话调度 |
| **Cursor / Windsurf** | `mcp` | ⏳ **待实测验证** | [**03-cursor-windsurf-mcp.md**](agents/03-cursor-windsurf-mcp.md) | 标准 MCP Stdio 协议挂载，Agent 主动拉取工单 |
| **Claude Code** | `webhook` | ⏳ **待实测验证** | [**04-claude-code.md**](agents/04-claude-code.md) | `claude -p` Headless CLI 单次任务独立修复会话 |
| **OpenAI Codex** | `webhook` | ⏳ **待实测验证** | [**05-openai-codex.md**](agents/05-openai-codex.md) | `codex exec` 命令行任务派单与自动修复 |
| **ZCode (企业定制)** | `webhook` | ⏳ **待实测验证** | [**06-zcode.md**](agents/06-zcode.md) | 本地 CLI 派单 / 企业私有云 Webhook 网关双通道 |
| **通用 Webhook / 飞书企微** | `webhook` | ⏳ **待实测验证** | [**07-generic-webhook.md**](agents/07-generic-webhook.md) | 标准 HTTP POST JSON 推送至自动化 CI/CD 或机器人 |

> 💡 **查阅指引**：点击表格中的各链接，即可进入对应智能体的专属步骤教程，包含：
> 1. 对应智能体所需的 `vite.config.ts` 最小精确配置；
> 2. CLI 调度命令、参数语法与跨平台宏变量展开；
> 3. 实机验证闭环流程（手机提交 ➔ 哨兵防抖 ➔ Agent 自动唤醒 ➔ 状态回写）；
> 4. 已知边界、避坑指南与排查技巧。

### 4.2 核心跨平台宏展开规范与统一契约

在采用 `webhookCommand` 调度任何命令行 Agent 时，哨兵会在执行命令前在 Node.js 运行时内完成宏字符串替换，并抹平 Windows (`cmd.exe`) 与 Linux/macOS (`sh/bash`) 的环境变量语法差异：

| 宏占位符 | 替代环境变量语法 | 含义与示例 |
| :--- | :--- | :--- |
| `%FEEDBACK_DIR%` 或 `$FEEDBACK_DIR` | 内部自动双向解析 | 当前配置的工单存储目录相对路径（如 `scratch/feedback`） |
| `%FEEDBACK_IDS%` 或 `$FEEDBACK_IDS` | 内部自动双向解析 | 本批次聚合的工单 ID 列表（逗号分隔，如 `1793346475734`） |
| `%FEEDBACK_COUNT%` 或 `$FEEDBACK_COUNT` | 内部自动双向解析 | 本批次包含的有效工单数量（如 `1`） |

> [!TIP]
> **最佳实践**：在任何 Agent 的 Prompt 中，直接指引其检索 `%FEEDBACK_DIR%` 或 `$FEEDBACK_DIR`，可彻底避免路径硬编码与配置不一致问题。

---

## 5. Agent 自愈闭环的标准规则 (建议写入项目 AGENTS.md / Cursor Rules)

为了让任何新接手的 Agent 都能严格规范地完成闭环，建议在项目规则文件中加入以下 3 步规范：

```markdown
# 移动端真机反馈自愈规范

1. **现场还原**：收到端侧反馈时，读取 `scratch/feedback/` 目录下对应的 JSON 文件与截屏，提取真实视口尺寸与 Console 报错；
2. **源码修复与测试**：检索对应前端组件与 Store 逻辑，防御性修复缺陷，并运行本地自动化测试验证；
3. **状态闭环回写**：测试通过后，必须执行 CLI 命令回写完成状态与用户答复：
   npx agent-feedback update-status --id <id> --status completed --reply "修复说明..." --dir scratch/feedback
```

通过这一套标准规范，任何外部开发人员、任何团队的任何 Agent，都能以极低的心智成本和最高的工程质量接入 Agent Feedback 自愈生态！

---

## 6. 进阶专题与延伸阅读

* 🎯 **智能体专属接入教程与实测状态矩阵**：查阅 Google Antigravity、DeepSeek DSH、Cursor、Claude Code、Codex 等各大 Agent 独立实操指南与闭环矩阵：➔ [**《智能体接入全景矩阵与专项教程目录》**](agents/README.md)。
* 📦 **生产构建 100% 自动剥离与真机 Debug 包构建**：深入了解编译期常量折叠（AST Constant Folding）、死代码消除（Zero-DCE）以及如何为移动端/桌面端混合应用定制保留悬浮气泡的真机测试包，请参阅专题指南：➔ [**《生产环境 100% 自动剥离 (Zero-DCE) 与真机 Debug 变体构建原理指南》**](production-zero-dce-and-debug-builds.md)。
