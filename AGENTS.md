# 项目智能体协作与发版规约 (AGENTS.md)

本项目为 `@lylyuanliang/agent-feedback` 智能体端侧闭环与反馈桥接套件 Monorepo（Node 24 + pnpm workspace + TypeScript + Vite 5）。所有智能体（主代理与子代理）必须严格遵循本规约与全局安全红线。

---

## 1. CHANGELOG 与发版文档智能体自主维护（硬门禁）
- **CHANGELOG.md 自主维护**：**`CHANGELOG.md` 完全由 Agent 根据实际代码变更和版本迭代自行更新与维护，严禁要求用户手动编写**。
- **格式与段落规范**：
  - 严格遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 与 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/) 规范；
  - 每次发版前，Agent 必须在 `CHANGELOG.md` 顶部追加或补充 `## [X.Y.Z] - YYYY-MM-DD` 章节；
  - 章节内容使用规范中文清晰梳理：
    - `### 🚀 核心特性` (Added / Features)
    - `### 🐛 问题修复` (Fixed / Bugfixes)
    - `### 🔧 工程与测试调优` (Changed / Improvements / Chore)
- **CI 流水线依赖一致性**：`.github/workflows/release.yml` 的 `scripts/extract_release_notes.js` 依赖正则表达式匹配 `## [X.Y.Z]` 段落自动生成 GitHub Release 正文，Agent 在更新 `CHANGELOG.md` 时必须保证版本号标记严谨完整，避免流水线提取空说明。

---

## 2. 版本号命名与自动发布流程 (Release Workflow)
版本号采用三位标准语义化格式：`X.Y.Z`（主版本号.次版本号.修订号）。

- **进位规则**：
  - **Major (X)**：架构彻底重构或破坏性变更，须用户明确确认；
  - **Minor (Y)**：向后兼容地引入全新独立大模块或核心特性；
  - **Patch (Z)**：既有功能的缺陷修复（Bugfix）、性能调优与样式微调。
- **发版闭环全流程（由 Agent 驱动完成）**：
  1. **同步版本号**：原子更新根目录 `package.json` 及各子包（`packages/core`、`packages/client`、`packages/sentinel`、`packages/vite-plugin`）的 `version` 字段；
  2. **维护 CHANGELOG**：Agent 根据本轮 commits 和功能改动自动补充 `CHANGELOG.md`；
  3. **质量前置验证**：本地执行 `pnpm -r run build` 与 `pnpm -r run test`，确保全量编译与 103+ 项测试 100% 绿灯；
  4. **精准提交与打标**：提交发版代码（commit 信息严格使用中文 Conventional Commit 如 `chore(release): 发布 vX.Y.Z ...`），打上纯净 Git Tag（如 `vX.Y.Z`）并推送到远程；
  5. **自动化 Release**：推送 Tag 后由 GitHub Actions 流水线自动完成多包构建、逐包测试、离线 tarball 与 zip 打包、生成并挂载 GitHub Release，无需用户在网页端手动创建。

---

## 3. 安全防护与零凭据泄漏红线
- **凭据零泄漏**：严禁在代码、注释、提交信息、日志或会话中暴露任何敏感秘钥、Token 或连接串明文，统一采用 `<REDACTED>`。
- **动态内测密钥隔离**：DevServer 启动时自动生成的内测秘钥文件 `scratch/.agent-feedback-secret` 与 `scratch/` 必须保留在 `.gitignore` 中，严禁提交到 Git。
- **客户端构建脱敏**：前端虚拟模块与打包产物中仅能包含脱敏的 SHA-256 哈希值（`keyHash`），严禁打包真实 `accessKey`。

---

## 4. Git 提交与代码规范
- **严禁擅自 Commit**：**除非用户明确要求提交，否则严禁擅自执行 `git commit`**。
- **质量前置检查**：提交前必须检查暂存区并运行 `git diff --cached --check`。
- **提交信息格式**：严格统一使用中文 Conventional Commit 格式（如 `feat(client): ...`、`fix(sentinel): ...`、`ci(release): ...`）。
- **代码与注释排版**：代码注释统一使用中文，声明与语句独立成行，杜绝压缩单行代码。
