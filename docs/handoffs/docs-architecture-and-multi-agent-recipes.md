# 主题：docs-architecture-and-multi-agent-recipes (重构文档架构体系与多 Agent 配置配方库)

- 当前状态：已完成 (Completed)
- 最后更新时间：2026-10-30 14:11
- 恢复入口：`docs/handoffs/docs-architecture-and-multi-agent-recipes.md`

---

## 1. 目标与背景
1. 重构 `README.md` 与 `docs/multi-agent-integration-guide.md` 的文档体系，解决现有文档“内容过多但重点不突出、新开发者抓不住接入抓手”的痛点；
2. 保持 SDK 的核心定位、四大核心优势、自愈工作闭环流程图与生产 Zero-DCE 规约等关键资产不缺失；
3. 建立 4 层金字塔式文档模型：
   - 第 1 层：核心定位、四大优势与端到端自愈工作闭环图（30 秒抓住价值）；
   - 第 2 层：通用 3 步极简接入 SOP（1 分钟挂载前端组件）；
   - 第 3 层：各主流 Coding Agent 的 `vite.config.js` 开箱即用配置配方库（Antigravity、Claude Code、Cursor/Windsurf MCP、企业自研 Webhook）；
   - 第 4 层：原理深度剖析（解答“哨兵如何精准路由与唤醒 Agent 会话”机制）与高阶扩展槽规范；
4. 确保所有外部开发者不管使用何种 Agent，都能按图索骥，复制即用，顺畅跑通闭环。

---

## 2. 落地实施清单
- **`README.md` 全面重组**：
  - 提炼 30 秒价值主张与四大优势；
  - 推出 3 步极简上手步骤；
  - 新增配方库：Antigravity、Claude Code、Cursor/Windsurf (MCP)、企业 Webhook 四大主流场景的 `vite.config.ts` 代码模板，开发者 1 秒复制；
  - 专门增加《🧠 深度剖析：哨兵是如何找到并唤醒 Agent 会话的？》章节，配合 Mermaid 图解彻底阐述底层路由原理；
- **`docs/multi-agent-integration-guide.md` 深度对齐**：
  - 详细补全四大形态下的会话确立原理与开发者心智模型；
  - 给出标准 AGENTS.md 规则注入模板。

---

## 3. 自测验证
- 检查 Markdown 语法无误，Mermaid 流程图无特殊字符转义语法错误；
- 本地 `weekly-mountain` 与 `agent-feedback` 工作区均保持干净与一致性。
