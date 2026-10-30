# 通用企业 Webhook / 群机器人通知接入指南

> **验证状态**：⏳ **待实测验证 (理论配方)** (Pending Verification)
> **交互流派**：流派 3（广义事件钩子 · 远程 HTTP POST）
> **面向对象**：钉钉机器人、飞书机器人、企业微信机器人、团队自建 Webhook 网关

---

## 1. 底层通信原理

1. **结构化 JSON 载荷**：
   * 哨兵在防抖聚合结束后，以 `POST application/json` 发送标准结构化批次载荷；
   * 载荷中包含工单 ID、时间、页面路由、视口分辨率（width/height/dpr）、平台、报错日志及截图相对路径；
2. **轻量无侵入**：
   * 无需在开发机拉起任何重型进程，完全通过 HTTP 协议与外部服务对接。

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
        webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
      }
    })
  ]
});
```

### 标准 Payload 结构示意：
```json
{
  "batch": [
    {
      "id": 1793259000123,
      "type": "user_feedback",
      "status": "processing",
      "content": "页面组件层级遮挡",
      "timestamp": 1793259000123,
      "date": "2026-10-30",
      "telemetry": {
        "route": "/explore",
        "viewport": { "width": 369, "height": 821, "dpr": 3.25 },
        "platform": "android"
      },
      "screenshots": ["screenshots/1793259000123.jpg"]
    }
  ]
}
```

---

## 3. 待回归验证清单 (Verification Checklist)

* [ ] 验证钉钉/飞书自定义机器人格式适配转换中间层（或提供内置模板解析器）；
* [ ] 验证 HTTP 状态码非 200 时的哨兵自动异常捕获与工单回写提示。
