# 交接文档：工单存储目录与触发指令对齐优化 (StorageDir & Prompt Alignment)

## 任务背景与目标
- **背景**：用户敏锐地指出在 `README.md` 与多 Agent 指南中，示例代码的 `storageDir`（配置为 `scratch/feedback`）与 `webhookCommand` 中的路径（曾混有 `.agent/feedback`）存在未对齐现象。同时询问两者之间的强关联性以及文档说明策略。
- **目标**：
  1. 阐明 `storageDir` 与 Prompt 中工单检索路径强关联的底层逻辑；
  2. 在 `packages/sentinel` 中增加 `$FEEDBACK_DIR` 环境变量注入，实现目录变量解耦；
  3. 彻底统一 `README.md` 与 `docs/multi-agent-integration-guide.md` 中的示例与说明；
  4. 为开发人员提供醒目的目录匹配说明与使用建议。

## 执行状态
- **状态**：已完成待交付 (Completed)
- **已修改文件**：
  - `packages/vite-plugin/src/index.ts`：支持 `webhookCommand` 与 `webhookCmd` 双向同义别名；
  - `packages/sentinel/src/index.ts`：在执行外部命令时新增环境变量 `FEEDBACK_DIR: relStorageDir` 注入；
  - `README.md`：修正 Recipe B 路径为 `scratch/feedback`，并在章节开头增设高亮核心对应关系 Callout；
  - `docs/multi-agent-integration-guide.md`：增设核心对应关系与环境变量解耦说明 Callout。

## 自测与验证结果
- 执行 `npm run build` 全模块编译通过，TypeScript 类型检查与生产产物构建无报错；
- 执行 `git diff --check` 前置检查无行尾空格或格式告警；
- 遵循严禁擅自 commit 规约，待用户确认。
