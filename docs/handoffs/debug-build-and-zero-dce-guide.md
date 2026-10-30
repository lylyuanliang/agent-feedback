# 交接文档：真机 Debug 包构建与 100% 生产剥离指南 (Debug Build & Zero-DCE Guide)

## 任务背景与目标
- **背景**：用户指出应将 Zero-DCE 自动剥离与真机 Debug 包构建方案独立成文，避免 `README.md` 过于冗长，仅在 `README.md` 与多 Agent 手册中提供快捷跳转入口；同时重点讲透**底层编译求值与死代码消除（DCE）的“核心原理”**，说明具体的打包命令（如 `build:debug`）仅作为参考示例，方便不同项目的开发者依据原理自由定制。
- **目标**：
  1. 独立编写专业专题文档 `docs/production-zero-dce-and-debug-builds.md`，深度剖析 AST 常量折叠、Module Graph 剪枝、`apply: 'serve'` 契约，以及构建保留悬浮气泡的真机测试包的核心本质；
  2. 在 `README.md` 与 `docs/multi-agent-integration-guide.md` 中增设优雅精简的快捷跳转入口；
  3. 执行代码排版检查与交接归档。

## 执行状态
- **状态**：已完成待提交 (Completed)
- **已修改/新增文件**：
  - `docs/production-zero-dce-and-debug-builds.md`：独立专题原理文档；
  - `docs/multi-agent-integration-guide.md`：收拢第 6 节为专题链接推荐；
  - `README.md`：在核心特性与快速上手第 2 步增加快速跳转入口；
  - `docs/handoffs/debug-build-and-zero-dce-guide.md`：任务交付记录。

## 自测与验证结果
- 执行 `git diff --check` 前置检查 100% 洁净无行尾空格；
- 原理深度剖析涵盖 AST 常量折叠、DCE 剪枝与 3 种业界变体方案；
- 遵循精准暂存与 Conventional Commit 规范，待用户确认后提交并推送。
