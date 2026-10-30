# 智能体生态接入与实测状态矩阵 (Agents Status Matrix)

> 本目录为 **Agent Feedback Bridge** 面向市场上各类 AI Coding Agent 的**专属接入实操手册与真实回归记录**。
> 为保持开源严谨性，所有列出的智能体均明确标注其**真机实测验证状态**，杜绝口头可用。

---

## 🧭 实测验证状态全景看板 (Verification Matrix)

| 智能体 (Agent) | 交互流派 | 调度机制 | 验证状态 | 最新实测说明 | 专属实操教程 |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Google Antigravity** | 原生深潜 IPC | 反查 SQLite + `agentapi` | 🟢 **已真机全流程验证** | 真机扫码提单，IDE 对话框毫秒级弹出高优消息并改代码自愈通过 | [01-google-antigravity.md](01-google-antigravity.md) |
| **DSH (DeepSeek Shell)** | Headless CLI | `dsh headless` 外部命令 | 🟡 **实机联测进行中** | 发现并解决 `webhookCmd` 键名与 Windows 环境变量展开兼容问题 | [02-deepseek-dsh.md](02-deepseek-dsh.md) |
| **Cursor / Windsurf** | MCP 协议拉取 | Stdio MCP 工具服务 | ⏳ **待实测验证 (理论配方)** | 遵循 Anthropic MCP 标准契约，通过 `get_pending_feedback` 拉取 | [03-cursor-windsurf-mcp.md](03-cursor-windsurf-mcp.md) |
| **Claude Code** | Headless CLI | `claude -p` 外部命令 | ⏳ **待实测验证 (理论配方)** | 适用于 Claude Code 非交互式任务子进程 | [04-claude-code.md](04-claude-code.md) |
| **OpenAI Codex** | Headless CLI | `codex exec` 外部命令 | ⏳ **待实测验证 (理论配方)** | 适用于 OpenAI Codex CLI 工具流 | [05-openai-codex.md](05-openai-codex.md) |
| **ZCode (企业平台)** | 双通道 | 平台 CLI / Webhook 网关 | ⏳ **待实测验证 (理论配方)** | 适用于企业内部研发工作台与自动化流水线派单 | [06-zcode.md](06-zcode.md) |
| **通用企业 Webhook** | 远程事件推送 | HTTP POST JSON 载荷 | ⏳ **待实测验证 (理论配方)** | 适用于钉钉、飞书、企业微信群机器人或自建 Webhook 网关 | [07-generic-webhook.md](07-generic-webhook.md) |

---

## 📌 状态图例说明

* 🟢 **已真机全流程验证**：作者与团队在真实操作系统（真机手机 App + 本地开发环境）中完成闭环联测：端侧截屏提交 ➔ 哨兵防抖聚合 ➔ 唤醒智能体排查 ➔ 自动化测试通过 ➔ 回写工单变绿。
* 🟡 **实机联测进行中**：已进入真机联调阶段，正在打磨 CLI 兼容细节、参数展开或退出码感知。
* ⏳ **待实测验证 (理论配方)**：基于标准通信协议（如 MCP 规范、POSIX CLI 命令规范）设计的基准配方，尚未经本仓库真机实录回归，欢迎社区提交 PR 补充回归报告！

---

## 📚 延伸阅读

* 🧠 [《智能体底层通信架构与技术白皮书》](../multi-agent-integration-guide.md)：深入剖析 3 大底层物理通信流派与通用 Webhook 调度哲学。
* 📦 [《生产环境 100% 自动剥离 (Zero-DCE) 与真机 Debug 变体构建原理指南》](../production-zero-dce-and-debug-builds.md)：深入理解编译期死代码消除机制。
