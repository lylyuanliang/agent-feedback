/**
 * @agent-feedback/sentinel
 * In-App Agent Feedback Bridge - Silent Sentinel & Wakeup CLI
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { sanitizeFeedbackContent } from '../../core/src/index.ts';
import type {
  InAppFeedback,
  FeedbackStatus,
  SecurityTriageResult
} from '../../core/src/index.ts';

export type {
  InAppFeedback,
  FeedbackStatus,
  SecurityTriageResult
};

const execAsync = promisify(exec);

export type WatcherAdapter = 'antigravity' | 'mcp' | 'webhook';

export interface WatcherOptions {
  /** 本地反馈存储目录 (默认: .agent/feedback) */
  storageDir?: string;
  /** 队列文件绝对或相对路径 (可选，覆盖 storageDir/feedback_queue.json) */
  queueFile?: string;
  /** 上次处理时间戳/ID文件路径 (可选，覆盖 storageDir/last_processed_id.txt) */
  lastProcessedFile?: string;
  /** 防抖收集窗口时长 (秒，默认: 10) */
  debounceSeconds?: number;
  /** 防抖收集窗口时长 (毫秒，用于测试快速运行，优先级高于 debounceSeconds) */
  debounceMs?: number;
  /** 静默轮询间隔 (毫秒，默认: 2000) */
  pollIntervalMs?: number;
  /** 唤醒适配器类型 (默认: antigravity) */
  adapter?: WatcherAdapter;
  /** Webhook 适配器触发的外部 Shell 脚本/命令 */
  webhookCommand?: string;
  /** Webhook 适配器触发的 HTTP POST 端点 */
  webhookUrl?: string;
  /** 唤醒回调钩子 (常用于测试拦截或自定义事件通知) */
  onWakeup?: (batch: InAppFeedback[], adapter: string) => void | Promise<void>;
  /** 防抖收集期间捕获到新反馈时的进度回调 */
  onDebounceProgress?: (count: number) => void;
  /** 唤醒后是否调用 process.exit(0) (默认 true；当提供 onWakeup 时默认 false) */
  exitOnWakeup?: boolean;
  /** 是否仅捕获处理单次批次即退出 (默认 true) */
  once?: boolean;
  /** 外部中止信号 (用于优雅终止轮询) */
  signal?: AbortSignal;
  /** 是否静默控制台输出 (测试时开启可保持输出整洁) */
  silent?: boolean;
}

/**
 * 读取上次已处理的最大反馈 ID
 */
export function getLastProcessedId(lastProcessedFile: string): number {
  if (!fs.existsSync(lastProcessedFile)) return 0;
  try {
    const content = fs.readFileSync(lastProcessedFile, 'utf-8').trim();
    const id = parseInt(content, 10);
    return isNaN(id) ? 0 : id;
  } catch {
    return 0;
  }
}

/**
 * 记录本次已处理的最大反馈 ID
 */
export function setLastProcessedId(lastProcessedFile: string, id: number): void {
  const dir = path.dirname(lastProcessedFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(lastProcessedFile, String(id), 'utf-8');
}

/**
 * 原子化写入 JSON 数据到文件，防并发读脏
 */
export function atomicWriteJson(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = JSON.stringify(data, null, 2);
  const tmpFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmpFile, content, 'utf-8');
    fs.renameSync(tmpFile, filePath);
  } catch {
    // Windows 平台文件锁或跨卷降级直接覆写
    fs.writeFileSync(filePath, content, 'utf-8');
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}

/**
 * 批量处理并分诊端侧反馈
 * 1. 执行第 1 道启发式安全防线 (防 Prompt 注入与破坏性指令)
 * 2. 恶意请求标记为 rejected 并记录原因
 * 3. 合法请求标记为 processing 并附带聚合批次通知
 * 4. 原子化持久化至队列文件并更新 last_processed_id.txt
 *
 * @param queueFile 队列文件路径
 * @param items 本批次捕获的反馈数组
 * @param options 可选配置
 * @returns 更新后的反馈数组
 */
export function processQueueBatch(
  queueFile: string,
  items: InAppFeedback[],
  options: WatcherOptions = {}
): InAppFeedback[] {
  const lastProcessedFile =
    options.lastProcessedFile ||
    path.resolve(path.dirname(queueFile), 'last_processed_id.txt');

  let curQueue: InAppFeedback[] = [];
  if (fs.existsSync(queueFile)) {
    try {
      const raw = fs.readFileSync(queueFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        curQueue = parsed;
      }
    } catch {
      curQueue = [];
    }
  }

  let maxId = getLastProcessedId(lastProcessedFile);
  const nowIso = new Date().toISOString();
  const processedItems: InAppFeedback[] = [];

  for (const item of items) {
    maxId = Math.max(maxId, item.id);
    const triage: SecurityTriageResult = sanitizeFeedbackContent(item.content);

    if (!triage.isSafe) {
      item.status = 'rejected';
      item.reply = `系统安全防线已拦截：${triage.reason}`;
    } else {
      item.status = 'processing';
      item.reply = `AI 智能体已被自动唤醒，已聚合批次 (共 ${items.length} 条)，正在分析排查...`;
    }
    item.updatedAt = nowIso;
    processedItems.push(item);

    // 同步更新至全局队列中的对应条目
    const existingIndex = curQueue.findIndex(q => q.id === item.id);
    if (existingIndex >= 0) {
      curQueue[existingIndex] = { ...curQueue[existingIndex], ...item };
    } else {
      curQueue.unshift(item);
    }
  }

  // 原子化写回队列
  atomicWriteJson(queueFile, curQueue);

  // 更新已处理最大 ID 游标
  setLastProcessedId(lastProcessedFile, maxId);

  return processedItems;
}

/**
 * 手动更新单个反馈状态 (支持 CLI 和 MCP 回写)
 */
export function updateFeedbackStatus(
  queueFileOrDir: string,
  id: number,
  status: FeedbackStatus,
  reply?: string
): InAppFeedback | null {
  const queueFile = fs.existsSync(queueFileOrDir) && fs.statSync(queueFileOrDir).isFile()
    ? queueFileOrDir
    : path.resolve(queueFileOrDir, 'feedback_queue.json');

  if (!fs.existsSync(queueFile)) return null;

  try {
    const raw = fs.readFileSync(queueFile, 'utf-8');
    const queue: InAppFeedback[] = JSON.parse(raw);
    const item = queue.find(i => i.id === Number(id));

    if (!item) return null;

    item.status = status;
    if (reply !== undefined) {
      item.reply = reply;
    }
    item.updatedAt = new Date().toISOString();

    atomicWriteJson(queueFile, queue);
    return item;
  } catch {
    return null;
  }
}

/**
 * 获取待处理反馈列表
 */
export function getPendingFeedback(
  queueFileOrDir: string,
  statusFilter?: FeedbackStatus | 'all'
): InAppFeedback[] {
  const queueFile = fs.existsSync(queueFileOrDir) && fs.statSync(queueFileOrDir).isFile()
    ? queueFileOrDir
    : path.resolve(queueFileOrDir, 'feedback_queue.json');

  if (!fs.existsSync(queueFile)) return [];

  try {
    const raw = fs.readFileSync(queueFile, 'utf-8');
    const queue: InAppFeedback[] = JSON.parse(raw);
    if (!Array.isArray(queue)) return [];

    if (!statusFilter || statusFilter === 'pending') {
      return queue.filter(i => i.status === 'pending');
    }
    if (statusFilter === 'all') {
      return queue;
    }
    return queue.filter(i => i.status === statusFilter);
  } catch {
    return [];
  }
}

/**
 * MCP 协议工具定义规范
 */
export const mcpTools = [
  {
    name: 'get_pending_feedback',
    description: 'Retrieve pending or processing in-app feedback submitted from mobile or web devices',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter status (default: pending). Allowed values: pending, processing, all, completed, rejected',
          enum: ['pending', 'processing', 'all', 'completed', 'rejected']
        },
        storageDir: {
          type: 'string',
          description: 'Optional storage directory (default: .agent/feedback)'
        }
      }
    }
  },
  {
    name: 'update_feedback_status',
    description: 'Update the processing status and reply message for a feedback item after diagnosis or fix',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Unique ID of the feedback item to update'
        },
        status: {
          type: 'string',
          description: 'Target status for the feedback',
          enum: ['processing', 'completed', 'rejected', 'ignored']
        },
        reply: {
          type: 'string',
          description: 'Detailed explanation or fix message presented to the mobile user in In-App history'
        },
        storageDir: {
          type: 'string',
          description: 'Optional storage directory (default: .agent/feedback)'
        }
      },
      required: ['id', 'status']
    }
  }
];

/**
 * 执行 MCP 工具调用
 */
export async function executeMcpTool(
  name: string,
  args: Record<string, any> = {},
  defaultStorageDir: string = '.agent/feedback'
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const dir = args.storageDir || defaultStorageDir;

  if (name === 'get_pending_feedback') {
    const items = getPendingFeedback(dir, args.status || 'pending');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ count: items.length, items }, null, 2)
        }
      ]
    };
  }

  if (name === 'update_feedback_status') {
    const updated = updateFeedbackStatus(dir, args.id, args.status, args.reply);
    if (!updated) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Feedback item with id ${args.id} not found.` })
          }
        ]
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, item: updated }, null, 2)
        }
      ]
    };
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: `Unknown tool: ${name}` })
      }
    ]
  };
}

/**
 * 启动标准 Stdio MCP Server 循环
 */
export async function startMcpServer(options: WatcherOptions = {}): Promise<void> {
  const storageDir = path.resolve(process.cwd(), options.storageDir || '.agent/feedback');

  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (id: any, result?: any, error?: any) => {
    const res: any = { jsonrpc: '2.0', id };
    if (error) {
      res.error = error;
    } else {
      res.result = result;
    }
    process.stdout.write(JSON.stringify(res) + '\n');
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      const { id, method, params } = msg;

      if (method === 'initialize') {
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: '@agent-feedback/sentinel',
            version: '1.0.0'
          }
        });
        return;
      }

      if (method === 'notifications/initialized') {
        return;
      }

      if (method === 'ping') {
        sendResponse(id, {});
        return;
      }

      if (method === 'tools/list') {
        sendResponse(id, { tools: mcpTools });
        return;
      }

      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const outcome = await executeMcpTool(toolName, toolArgs, storageDir);
        sendResponse(id, outcome);
        return;
      }

      // 未知方法响应方法未找到错误
      sendResponse(id, undefined, { code: -32601, message: `Method not found: ${method}` });
    } catch (err: any) {
      sendResponse(null, undefined, { code: -32700, message: err?.message || 'Parse error' });
    }
  });
}

/**
 * 静默哨兵核心监听器
 * 1. 静默低开销轮询 feedback_queue.json
 * 2. 捕获第 1 条新 pending 反馈后，自动开启防抖聚合窗口 (默认 10s，支持毫秒配置)
 * 3. 聚合完成后执行启发式安全分诊
 * 4. 触发对应适配器唤醒 (antigravity 正常 exit(0)，mcp / webhook 触发钩子)
 */
export async function startSentinel(options: WatcherOptions = {}): Promise<void> {
  const debounceMs = options.debounceMs ?? ((options.debounceSeconds ?? 10) * 1000);
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const storageDir = path.resolve(process.cwd(), options.storageDir || '.agent/feedback');
  const queueFile = options.queueFile || path.resolve(storageDir, 'feedback_queue.json');
  const lastProcessedFile =
    options.lastProcessedFile || path.resolve(storageDir, 'last_processed_id.txt');
  const adapter = options.adapter || 'antigravity';
  const isOnce = options.once !== false; // 默认单次捕获唤醒即结束
  const log = options.silent
    ? () => {}
    : (...args: any[]) => console.log(...args);
  const warn = options.silent
    ? () => {}
    : (...args: any[]) => console.warn(...args);

  // 确保存储目录就绪
  if (!fs.existsSync(path.dirname(queueFile))) {
    fs.mkdirSync(path.dirname(queueFile), { recursive: true });
  }

  let lastProcessedId = getLastProcessedId(lastProcessedFile);
  log(`[*] Agent Feedback 哨兵已启动 (适配器: ${adapter})...`);
  log(`[*] 静默守候中 (0% CPU, 0 Token，捕获反馈后将启动 ${debounceMs / 1000}s 防抖聚合)...`);

  const stepInterval = Math.min(1500, Math.max(10, Math.floor(debounceMs / 5)));

  return new Promise<void>((resolve, reject) => {
    let isRunning = true;
    let timer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      isRunning = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        cleanup();
        resolve();
      });
    }

    const checkLoop = async () => {
      if (!isRunning || options.signal?.aborted) {
        resolve();
        return;
      }

      try {
        if (fs.existsSync(queueFile)) {
          const raw = fs.readFileSync(queueFile, 'utf-8');
          const queue: InAppFeedback[] = JSON.parse(raw);

          // 寻找所有最新未处理的 pending 反馈
          const newItems = Array.isArray(queue)
            ? queue.filter(item => item.id > lastProcessedId && item.status === 'pending')
            : [];

          if (newItems.length > 0) {
            log(`\n[*] 📥 捕获到新反馈 (初始 ${newItems.length} 条)，启动 ${debounceMs / 1000} 秒防抖收集窗口...`);

            const startTime = Date.now();
            let aggregatedItems = [...newItems];

            while (Date.now() - startTime < debounceMs) {
              if (!isRunning || options.signal?.aborted) break;

              await new Promise(r => setTimeout(r, stepInterval));

              try {
                if (fs.existsSync(queueFile)) {
                  const curQueue: InAppFeedback[] = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
                  const curNew = Array.isArray(curQueue)
                    ? curQueue.filter(item => item.id > lastProcessedId && item.status === 'pending')
                    : [];

                  if (curNew.length > aggregatedItems.length) {
                    log(`[*] ➕ 窗口内捕获追加提交，当前聚合批次数量: ${curNew.length} 条...`);
                    aggregatedItems = curNew;
                    options.onDebounceProgress?.(curNew.length);
                  }
                }
              } catch {
                // 忽略窗口内的读锁瞬态
              }
            }

            log(`[*] ✅ 防抖收集完毕，共聚合 ${aggregatedItems.length} 条端侧反馈！`);

            // 执行安全分诊与状态持久化
            const processedBatch = processQueueBatch(queueFile, aggregatedItems, options);
            lastProcessedId = getLastProcessedId(lastProcessedFile);

            // 适配器调度分发
            if (adapter === 'webhook') {
              if (options.webhookCommand) {
                try {
                  await execAsync(options.webhookCommand, {
                    env: {
                      ...process.env,
                      FEEDBACK_COUNT: String(processedBatch.length),
                      FEEDBACK_IDS: processedBatch.map(i => i.id).join(',')
                    }
                  });
                } catch (cmdErr: any) {
                  warn(`[!] Webhook 命令执行异常: ${cmdErr?.message}`);
                }
              }
              if (options.webhookUrl) {
                try {
                  await fetch(options.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batch: processedBatch })
                  });
                } catch (netErr: any) {
                  warn(`[!] Webhook 请求发送异常: ${netErr?.message}`);
                }
              }
            }

            if (typeof options.onWakeup === 'function') {
              await options.onWakeup(processedBatch, adapter);
            }

            if (adapter === 'antigravity') {
              log('[*] 🔔 触发 Antigravity 响应式任务退出唤醒机制！');
              const shouldExit =
                options.exitOnWakeup !== undefined
                  ? options.exitOnWakeup
                  : !options.onWakeup;
              if (shouldExit) {
                cleanup();
                process.exit(0);
              }
            }

            if (isOnce) {
              cleanup();
              resolve();
              return;
            }
          }
        }
      } catch (err: any) {
        warn(`[!] 哨兵检测异常: ${err?.message}`);
      }

      if (isRunning && !options.signal?.aborted) {
        timer = setTimeout(checkLoop, pollIntervalMs);
      } else {
        resolve();
      }
    };

    timer = setTimeout(checkLoop, 10);
  });
}

export default startSentinel;
