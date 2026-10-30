# Google Antigravity 接入与实测指南

> **验证状态**：🟢 **已真机全流程验证** (Verified)
> **验证环境**：Windows 11 / Node v22 / Vite 5 / Google Antigravity IDE 2.0
> **交互流派**：流派 1（原生宿主私有 IPC 深度通信）

---

## 1. 底层通信原理

Google Antigravity 接入是体验最好、响应最敏捷的模式：
1. **活跃会话反查**：
   * 若在 Antigravity 内置终端运行，优先读取环境变量 `$env:ANTIGRAVITY_CONVERSATION_ID`；
   * 若在独立终端运行，哨兵通过 Node 原生 SQLite 引擎只读检索 `~/.gemini/antigravity/conversation_summaries.db`，通过工作区路径比对（CWD Matching）自动定位当前打开的会话 ID。
2. **毫秒级主动唤醒**：
   * 哨兵聚合端侧反馈后，调用底层 IPC 工具 `agentapi send-message <id>` 将高优消息直接插入会话输入流，**无需开发者手动刷新或敲回车，Agent 在聊天框中即刻弹出接单**！

---

## 2. 极简配置方案 (`vite.config.ts`)

无需指定任何命令，哨兵默认自适应为 Antigravity 模式：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { agentFeedback } from '@lylyuanliang/agent-feedback-vite-plugin';

export default defineConfig({
  plugins: [
    agentFeedback({
      storageDir: 'scratch/feedback',
      sentinel: {
        autoStart: true,         // 随 npm run dev 自动常驻守护，0 心智负担
        debounceSeconds: 10      // 10 秒防抖聚合窗口
        // adapter 默认自适应为 'antigravity'
      }
    })
  ]
});
```

---

## 3. 端到端实测验证步骤 (Runbook)

1. **启动服务**：在终端运行 `npm run dev`；
2. **手机端提单**：在真机应用上点击悬浮胶囊，截屏并输入缺陷描述（如“海报截断无法滑动”），点击提交；
3. **观察控制台输出**：
   ```
   [*] 📥 捕获到新反馈 (初始 1 条)，启动 10 秒防抖收集窗口...
   [*] ✅ 防抖收集完毕，共聚合 1 条端侧反馈！
   [*] 🔔 触发 Antigravity 响应式唤醒机制...
   [*] 🚀 已通过 agentapi 向 Antigravity 会话 [66cdabf9-...] 发送主动唤醒消息！
   ```
4. **Agent 接单与自愈**：
   Antigravity 会话窗口自动弹出 `📥 [Agent Feedback 自动唤醒]`，Agent 自动读取 `scratch/feedback/` 下的快照进行排查、修复源码、运行自动化测试，并调用 CLI 回写完成状态。

---

## 4. 常见避坑与技术细节 (Troubleshooting)

* **ESM 兼容性**：哨兵使用 `createRequire(import.meta.url)` 动态加载 `node:sqlite`，兼顾 CJS 与 ESM 打包环境；
* **权限说明**：读取 `conversation_summaries.db` 为只读模式（`readOnly: true`），绝不篡改 Antigravity 内部数据库。
