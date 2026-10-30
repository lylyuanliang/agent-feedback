# DSH (DeepSeek Shell) 接入与实测指南

> **验证状态**：🟡 **实机联测进行中** (In Progress)
> **当前环境**：Windows 11 / Node v22 / Vite 5 / DSH CLI
> **交互流派**：流派 3（Headless CLI 外部命令事件钩子）

---

## 1. 底层通信原理

DSH 是基于 DeepSeek 代码推理大模型的本地命令行终端智能体：
1. **单次任务独立会话**：
   * 哨兵在防抖窗口结束后，通过 `child_process.exec()` 在系统后台执行 `dsh headless "<prompt>"`；
   * DSH 启动一个**独立的一次性子进程任务**，携带环境变量与工单线索前往工作区读取代码并修复；
   * 任务完成后，DSH 在单次会话内调用 CLI 工具回写工单状态并正常退出。
2. **与交互式会话的区别**：
   * `dsh headless` 不会向当前打开的聊天终端窗口注入文本，它是一个专注执行该 Bugfix 的后台独立自愈工人。

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
        // 关键：调用 dsh headless 任务模式
        webhookCmd: 'dsh headless "检测到手机端新工单(ID: $FEEDBACK_IDS)，请读取 $FEEDBACK_DIR 目录排查并修复源码，通过单测后调用 npx agent-feedback update-status 回写结果"'
      }
    })
  ]
});
```

---

## 3. 实机联调踩坑与排错备忘录 (Quirks & Troubleshooting)

在与真实 DSH CLI 联测过程中，已发现并修复以下关键细节：

1. **真实 CLI 命令规范**：
   * ❌ 错误写法：`dsh --auto-confirm -q "..."`（真实 CLI 不存在此参数）；
   * ✅ 正确写法：`dsh headless "..."`。
2. **配置字段名别名**：
   * 在 npm `1.1.0` 版本中，配置字段名应使用 `webhookCmd`；`1.1.1` 起同时兼容 `webhookCommand`。
3. **Windows `cmd.exe` 环境变量展开**：
   * Windows 下系统的 `exec()` 默认走 `cmd.exe`，原生不识别 Linux/Bash 的 `$VAR`；
   * **已在哨兵内核修复**：哨兵会在 Node 运行时内部先做**宏替换（Macro replacement）**，自动将 `$FEEDBACK_IDS`、`%FEEDBACK_IDS%`、`$FEEDBACK_DIR` 替换为真实字符串，跨平台无感！
4. **异常直接回写**：
   * 若 DSH 执行报错或异常退出，哨兵会捕获真实的 `stderr` 错误信息并直接写入工单 `reply` 字段，方便手机端直接查看具体错误堆栈。
