# Claude Code 接入指南

> **验证状态**：⏳ **待实测验证 (理论配方)** (Pending Verification)
> **交互流派**：流派 3（Headless CLI 外部命令事件钩子）
> **目标工具**：Anthropic Claude Code CLI (`claude -p "..."`)

---

## 1. 底层通信原理

1. **非交互式命令行拉起**：
   * 哨兵在防抖聚合结束后，通过 Shell 调用 `claude -p "<prompt>"`；
   * `-p`（Prompt 模式）允许 Claude Code 在无需人工输入的情况下直接执行一次性代码审查与自愈；
2. **生命周期隔离**：
   * 进程自成一体，执行完毕后自动生成 Git Commit 并退出，不占用常驻会话。

---

## 2. 推荐配置配方 (`vite.config.ts`)

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
        adapter: 'webhook',
        // 自动注入宏替换环境变量 $FEEDBACK_DIR 与 $FEEDBACK_IDS
        webhookCmd: 'claude -p "端侧上报了最新移动端工单(ID: $FEEDBACK_IDS)，请检视 $FEEDBACK_DIR 目录定位源码并修复，完成后调用 npx agent-feedback update-status 回写"'
      }
    })
  ]
});
```

---

## 3. 待回归验证清单 (Verification Checklist)

* [ ] 验证 `claude -p` 在系统子进程非 TTY 终端下的自动授权执行策略（如 `--dangerously-skip-permissions` 是否需要配合使用）；
* [ ] 验证 Claude Code 退出码与 stdout/stderr 捕获。
