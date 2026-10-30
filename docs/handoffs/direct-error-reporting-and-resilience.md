# 交接文档：Agent 调度异常直出报错与命令宏替换优化 (Direct Error Reporting & Macro Replacement)

## 任务背景与目标
- **背景**：用户明确指示：当调用 Agent 失败时，工单的 `reply` 必须直接使用真实、硬核的报错信息（例如命令失败的 stderr / 错误原因），不要写“通知人工排查”等客套话，因为该系统纯供开发者自己排查调试使用。
- **目标**：
  1. 在 `packages/sentinel` 的 `webhookCommand`、`webhookUrl`、未配置告警及 `antigravity` 调度捕获异常时，直接将真实报错内容（`cmdErr?.stderr || cmdErr?.message`）通过 `updateFeedbackStatus` 回写到工单数据中，让手机端和工单列表即刻可见真实错误堆栈；
  2. 在执行 `webhookCommand` 前，进行多模式跨平台宏替换（支持 `$VAR`、`${VAR}`、`%VAR%`），彻底根治 Windows `cmd.exe` 下环境变量无法展开的问题；
  3. 修复 ESM 模式下动态读取 `node:sqlite` 的 `createRequire` 语法，确保外部终端下能正常进行 SQLite 会话反查；
  4. 验证测试并记录交接。

## 执行状态
- **状态**：已完成 (Completed)
- **已修改文件**：
  - `packages/sentinel/src/index.ts`：实现命令宏替换、ESM createRequire 兼容以及异常直出回写；
  - `docs/handoffs/direct-error-reporting-and-resilience.md`：任务交付记录。

## 自测与验证结果
- 执行 `npm run build` 全模块编译通过，TypeScript 类型检查无报错；
- 执行 `git diff --check` 前置检查 100% 洁净无行尾空格；
- 遵循严禁擅自 commit 规约，待用户确认后提交并推送。
