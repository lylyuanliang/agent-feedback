# 交接文档：智能体 3 大通信范式与 Webhook 架构哲学 (Agent Communication Paradigms & Webhook Philosophy)

## 任务背景与目标
- **背景**：用户探讨为什么大部分外部 Agent（Claude Code、DSH、Codex、ZCode 等）的适配器看起来都是通过 `adapter: 'webhook'`（通过 `webhookCommand` 或 `webhookUrl`）来实现的，并要求将该核心架构逻辑与 Mermaid 拓扑图落地到专门的生态文档中（明确要求不写在 README 中），完成后执行规范的分批次原子提交与推送。
- **目标**：
  1. 在 `docs/multi-agent-integration-guide.md` 中增加第 3 章节，系统阐述 AI 智能体底层通信的 3 大流派（深度私有 IPC、标准协议 MCP、外部事件钩子 Hook）；
  2. 阐明广义 Webhook（CLI 外部进程触发 + HTTP 网络推送）与狭义 Webhook（仅 HTTP POST）的架构抽象哲学；
  3. 解释为什么 Webhook 是连接百家争鸣智能体的“最大公约数”与“通用普通话”；
  4. 包含清晰漂亮的 Mermaid 架构图与对比表格；
  5. 检查代码与文档格式，规范提交并推送到 GitHub 远端仓库。

## 执行状态
- **状态**：已完成并提交推送 (Completed)
- **已修改文件**：
  - `docs/multi-agent-integration-guide.md`：新增第 3 节《架构深度思考：为什么大部分 Agent 适配器都是 Webhook？》；
  - `docs/handoffs/agent-communication-paradigms-and-webhook-philosophy.md`：任务交付记录。

## 自测与验证结果
- 执行 `git diff --check` 前置检查 100% 洁净无行尾空格；
- Mermaid 流程图结构符合标准语法；
- 遵循单一职责原子提交与中文 Conventional Commit 规范，已成功推送到 `origin/main`。
