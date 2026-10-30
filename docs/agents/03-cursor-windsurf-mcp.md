# Cursor / Windsurf / VS Code (Cline) MCP 模式接入指南

> **验证状态**：⏳ **待实测验证 (基准方案)** (Pending Verification)
> **交互流派**：流派 2（标准化上下文主动拉取 · MCP 协议）
> **协议标准**：Anthropic Model Context Protocol (MCP) Stdio

---

## 1. 底层通信原理

在 Cursor、Windsurf 或安装了 Cline / Roo Code 的 VS Code 中：
1. **工作区天然绑定**：开发者是在当前 IDE 打开的项目工程上下文里与 AI 对话；
2. **主动调用协议**：哨兵提供官方标准 MCP Stdio Server（`agent-feedback-sentinel mcp`），向 IDE 暴露 `get_pending_feedback` 与 `update_feedback_status` 两大工具；
3. **对话流无缝拉取**：开发者在聊天窗口中输入 `@agent-feedback 检查是否有手机端提交的新问题`，Agent 自动调用工具拉取最新工单并开始修复。

---

## 2. 推荐配置方案

### 步骤 1：在 `vite.config.ts` 中开启 MCP 模式
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { agentFeedback } from '@lylyuanliang/agent-feedback-vite-plugin';

export default defineConfig({
  plugins: [
    agentFeedback({
      storageDir: 'scratch/feedback',
      sentinel: {
        autoStart: true,
        debounceSeconds: 10,
        adapter: 'mcp'
      }
    })
  ]
});
```

### 步骤 2：在项目根目录 `.cursor/mcp.json`（或 IDE 全局 MCP 设置）注册服务
```json
{
  "mcpServers": {
    "agent-feedback": {
      "command": "npx",
      "args": ["-y", "@lylyuanliang/agent-feedback-sentinel", "mcp", "--dir", "scratch/feedback"]
    }
  }
}
```

---

## 3. 待回归验证清单 (Verification Checklist)

* [ ] 在 Cursor Composer / Windsurf 中通过 `@agent-feedback` 成功识别暴露的两个 MCP 工具；
* [ ] 验证 `get_pending_feedback` 能够解析 Base64 截屏与 Console 堆栈；
* [ ] 验证 Agent 修复代码后调用 `update_feedback_status` 能正常回写完成状态。
