# 主题：universal-features-refactor

- 当前状态：已完成
- 最后更新时间：2026-10-28
- 恢复入口：D:\file_save\workspace\github\agent-feedback\docs\handoffs\universal-features-refactor.md

## 当前目标
在独占目录 `D:\file_save\workspace\github\agent-feedback` 内完成四大通用特性的重构与升级，并保证单元测试全绿以及全量构建成功：
1. `@agent-feedback/core`：协议扩展与类型完善；
2. `@agent-feedback/vite-plugin`：按天分片存储、向后兼容迁移及路由中间件全面升级；
3. `@agent-feedback/client`：Shadow DOM Token CSS 变量系统、流式时间轴 UI 与动态扩展槽机制；
4. `@agent-feedback/sentinel`：按天分片目录监听适配与 CLI notice 系统通知支持；
5. 验证与构建：全包单元测试覆盖并通过，全包构建成功生成 dist。

## 已完成项
1. **`@agent-feedback/core` (src/index.ts)**:
   - 增加 `FeedbackType = 'user_feedback' | 'agent_notice'`；
   - 在 `InAppFeedback` 实体中增加 `type?: FeedbackType; date?: string;`；
   - 增加 `FeedbackDateIndex` 日级索引接口定义；
   - 增加 `ExtensionContext` 与 `FeedbackExtensionTab` 扩展槽接口；
   - 增加 `FeedbackTheme = 'dark' | 'light' | 'auto'` 主题定义；
   - 编写 `packages/core/tests/core.test.ts` 新特性单元测试，10/10 测试通过。

2. **`@agent-feedback/vite-plugin` (src/index.ts)**:
   - 实现按天分片持久化存储：本地日期 `YYYY-MM-DD`、分片文件 `${storageDir}/feedback_${YYYY-MM-DD}.json`、索引文件 `${storageDir}/feedback_index.json`；
   - 启动时自动检查并迁移旧 `feedback_queue.json` 合并至对应日期分片，同时保持 `feedback_queue.json` 全局同步兼容；
   - 升级 API 路由中间件：
     - `POST /api/__agent_feedback/submit`：支持接收 `type`（默认 `user_feedback`），写入当天分片并更新索引；
     - `POST /api/__agent_feedback/notice`：系统通知工单（`type: 'agent_notice'`, `status: 'completed'`）；
     - `GET /api/__agent_feedback/dates`：返回 `{ dates, totalCount, latestDate }`；
     - `GET /api/__agent_feedback/list`：支持 `?date=YYYY-MM-DD` 查询指定日分片；未传时默认返回最新一天列表以保持 API 兼容；
     - `POST /api/__agent_feedback/status`：跨分片检索工单 ID 并持久化更新状态与回复；
   - 支持 options 传入 `theme`（默认 `dark`）与 `primaryColor`，在注入 HTML 虚拟脚本时透传；
   - 编写 `packages/vite-plugin/tests/plugin.test.ts` 新特性单元测试，20/20 测试通过。

3. **`@agent-feedback/client` (src/index.ts)**:
   - **主题 Token 系统 (CSS Variables)**：Shadow DOM `:host` 注入 `--af-primary`, `--af-bg-base`, `--af-bg-surface`, `--af-text-main`, `--af-text-muted`, `--af-border`, `--af-radius`，全面支持 `dark|light|auto` 及通过属性或静态方法 `AgentFeedbackWidget.setTheme(...)` 实时切换，样式全面采用 CSS 变量；
   - **流式时间轴与工单展示 (Timeline UI)**：按天分组，各日期具备发光指示圆点、垂直连接线、日期标题以及当日工单数量徽标；首屏渲染最新一天工单，支持点击“加载前一天记录”分页拉取；对 `type === 'agent_notice'` 工单展示青绿高光边框和 `🤖 Agent 系统通知` 徽章；
   - **扩展槽机制 (Extension Tabs API)**：导出 `registerExtensionTab(tab)` 函数并维护在 `window.__AGENT_FEEDBACK_EXTENSIONS__`；Header 动态渲染原生 Tab 与全部自定义扩展 Tab；切换时渲染独立容器并回调 `tab.render(container, context)`，支持生命周期清理；
   - 编写 `packages/client/tests/client.test.ts` 单元测试，17/17 测试通过。

4. **`@agent-feedback/sentinel` (src/index.ts, bin/cli.js)**:
   - 适配按天分片存储目录的静默监听、防抖聚合与安全分诊处理；
   - 增加 CLI 命令 `notice <content>`（`npx agent-feedback notice "通知内容"`），支持直接向当天分片插入系统通知工单；
   - 编写 `packages/sentinel/tests/sentinel.test.ts` 单元测试，17/17 测试通过。

5. **构建与回归测试闭环**:
   - 配置各子包独立 `tsconfig.json` 并安装 `@types/node`；
   - 运行 `pnpm test`：Monorepo 全量 77 个测试全部绿灯通过（0 failed）；
   - 运行 `pnpm -r build`：全部 5 个工作区项目构建成功输出 `dist`。

## 修改与新建文件
- `packages/core/src/index.ts`
- `packages/core/tests/core.test.ts`
- `packages/core/tsconfig.json`
- `packages/vite-plugin/src/index.ts`
- `packages/vite-plugin/src/index.js`
- `packages/vite-plugin/tests/plugin.test.ts`
- `packages/vite-plugin/tsconfig.json`
- `packages/client/src/index.ts`
- `packages/client/tests/client.test.ts`
- `packages/client/tsconfig.json`
- `packages/sentinel/src/index.ts`
- `packages/sentinel/bin/cli.js`
- `packages/sentinel/tests/sentinel.test.ts`
- `packages/sentinel/tsconfig.json`
- `package.json`
- `docs/handoffs/universal-features-refactor.md`

## 验证结果
- `packages/core`: 10/10 passed (100%)
- `packages/client`: 17/17 passed (100%)
- `packages/vite-plugin`: 20/20 passed (100%)
- `packages/sentinel`: 17/17 passed (100%)
- `examples/vite-demo`: 13/13 passed (100%)
- **全仓回归总计**：77 tests, 16 suites, 77 passed, 0 failed (100% 绿灯)
- **构建输出验证**：`pnpm -r build` 成功完成，各子包 `dist/` 均正常生成。

## 下一步
- 任务已全部闭环完成，向主调用智能体汇报交付成果。
