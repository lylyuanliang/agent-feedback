# OpenAI Codex CLI 接入指南

> **验证状态**：⏳ **待实测验证 (基准方案)** (Pending Verification)
> **交互流派**：流派 3（Headless CLI 外部命令事件钩子）
> **目标工具**：OpenAI 命令行生态工具 (`codex exec "..."` / `gh copilot`)

---

## 1. 底层通信原理

1. **命令行无状态任务**：
   * 哨兵聚合端侧工单，通过 `webhookCmd` 调用 Codex 执行器；
   * 通过参数将提示词与环境变量传递给 Codex 独立进程；
2. **闭环回写**：
   * Codex 执行代码改写并调用 `npx agent-feedback update-status` 标记完成。

---

## 2. 推荐配置方案 (`vite.config.ts`)

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
        webhookCmd: 'codex exec "检测到移动端上报新缺陷(ID: $FEEDBACK_IDS)，请检索 $FEEDBACK_DIR 目录排查并修复，运行自动化验证后通过 npx agent-feedback update-status 回写结果"'
      }
    })
  ]
});
```

---

## 3. 待回归验证清单 (Verification Checklist)

* [ ] 验证 Codex CLI 的非交互模式参数名与认证凭证加载逻辑；
* [ ] 验证端到端修复成功率与回写稳定性。
