# 主题：docs-architecture-and-multi-agent-recipes (重构文档架构体系与多 Agent 配置配方库)

- 当前状态：已完成 (Completed)
- 最后更新时间：2026-10-30 14:35
- 恢复入口：`docs/handoffs/docs-architecture-and-multi-agent-recipes.md`

---

## 1. 目标与背景
1. 在 `README.md` 与 `docs/multi-agent-integration-guide.md` 中补充显式的 **DSH (DeepSeek Shell Agent)** 与 **ZCode (企业内部定制/平台级 Agent)** 的独立 `vite.config.ts` 配置配方；
2. 在 `README.md` 核心位置提供直达 [`docs/multi-agent-integration-guide.md`](file:///d:/file_save/workspace/github/agent-feedback/docs/multi-agent-integration-guide.md) 的快捷导航与高亮入口卡片；
3. 完成代码修改、检查暂存区、规范分批提交并推送到 GitHub 远端。

---

## 2. 落地实施清单
- **`README.md` 全面重组与配方显式化**：
  - 顶部与配方库区域增加醒目的 `docs/multi-agent-integration-guide.md` 官方指南快捷入口；
  - 配方库全面补齐 6 大主流场景：
    - 🟢 配方 A：Google Antigravity（0 配置原生伴生）
    - 🟣 配方 B：Claude Code / OpenAI Codex（Headless CLI 自动拉起）
    - ⚡ 配方 C：DSH (DeepSeek Shell Agent)（轻量终端自动执行）
    - 🏢 配方 D：ZCode (企业内部平台级 Agent)（CLI 本地调度与云端 Webhook 双模式）
    - 🔵 配方 E：Cursor / Windsurf / VS Code (Cline)（MCP 标准协议）
    - 🟠 配方 F：通用企业 Webhook / 钉钉飞书企微机器人（标准 JSON 派单）
  - 专门保留并深化《🧠 深度剖析：哨兵是如何找到并唤醒 Agent 会话的？》章节与 Mermaid 流程图；
- **`docs/multi-agent-integration-guide.md` 深度对齐**：
  - 详细补全六大形态下的会话确立原理与开发者心智模型；
  - 给出 DSH 与 ZCode 的完整参数配置与代码片段。
