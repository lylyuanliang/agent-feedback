# ZCode (企业内部平台级 AI Agent) 接入指南

> **验证状态**：⏳ **待实测验证 (理论配方)** (Pending Verification)
> **交互流派**：流派 3（广义事件钩子 · 本地 CLI 派单 / 企业私有云网关）
> **面向对象**：企业内部私有化研发工作台或平台级自动化任务中心

---

## 1. 底层通信原理

企业自研智能体平台通常具备统一的本地开发 CLI 或远程流水线调度网关：
1. **模式 1：本地 CLI 派发**：
   * 哨兵将聚合的工单元数据文件路径传递给企业 CLI，本地拉起专属修复会话；
2. **模式 2：企业网关 HTTP 推送**：
   * 哨兵将包含报错堆栈与截图的 JSON 数据 POST 到企业网关，由企业调度集群动态分配后台 Agent 容器跑工单。

---

## 2. 推荐配置配方 (`vite.config.ts`)

### 模式 1：本地 CLI 派单
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
        webhookCmd: 'zcode task dispatch --project-path . --task-type bugfix --meta $FEEDBACK_DIR/feedback_queue.json'
      }
    })
  ]
});
```

### 模式 2：企业云端 Webhook 平台调度
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
        webhookUrl: 'https://zcode.internal.company.com/api/v1/agent/tickets/dispatch'
      }
    })
  ]
});
```

---

## 3. 待回归验证清单 (Verification Checklist)

* [ ] 验证企业网关鉴权请求头（`Authorization` / `Token`）自定义透传能力；
* [ ] 验证容器化 Agent 从远端向端侧回写状态的鉴权通路。
