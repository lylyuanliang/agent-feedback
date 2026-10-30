/**
 * @agent-feedback/sentinel
 * In-App Agent Feedback Bridge - Silent Sentinel & Wakeup CLI
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { sanitizeFeedbackContent } from '@lylyuanliang/agent-feedback-core';
import type {
  InAppFeedback,
  FeedbackStatus,
  SecurityTriageResult,
  FeedbackDateIndex
} from '@lylyuanliang/agent-feedback-core';

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
  /** 是否仅捕获处理单次批次即退出 (当 adapter 为 antigravity 时默认 true；当 adapter 为 webhook 或 mcp 时默认 false 持续常驻守护) */
  once?: boolean;
  /** 外部中止信号 (用于优雅终止轮询) */
  signal?: AbortSignal;
  /** Antigravity 目标会话 ID (用于通过 agentapi send-message 主动唤醒) */
  conversationId?: string;
  /** 是否静默控制台输出 (测试时开启可保持输出整洁) */
  silent?: boolean;
}

/**
 * 获取本地 YYYY-MM-DD 日期字符串
 */
export function getLocalDateString(d: Date | number | string = new Date()): string {
  const dateObj = typeof d === 'object' && d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) {
    const fallback = new Date();
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
  }
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
 * 插入系统通知工单到当天分片
 */
export function insertNotice(
  storageDirOrFile: string,
  content: string,
  extra: Partial<InAppFeedback> = {}
): InAppFeedback {
  const isFile = fs.existsSync(storageDirOrFile) && fs.statSync(storageDirOrFile).isFile();
  const storageDir = isFile ? path.dirname(storageDirOrFile) : storageDirOrFile;
  const queueFile = isFile ? storageDirOrFile : path.resolve(storageDir, 'feedback_queue.json');

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const now = Date.now();
  const date = getLocalDateString(extra.timestamp || now);
  const noticeItem: InAppFeedback = {
    id: extra.id || now,
    type: 'agent_notice',
    status: extra.status || 'completed',
    content,
    receivedAt: extra.receivedAt || new Date(now).toISOString(),
    timestamp: extra.timestamp || now,
    date,
    reply: extra.reply || '系统主动推送的 Agent 通知',
    telemetry: extra.telemetry || {
      route: 'cli',
      viewport: { width: 0, height: 0, dpr: 1 },
      userAgent: '@lylyuanliang/agent-feedback-sentinel-cli',
      platform: 'desktop'
    }
  };

  // 1. 写入当天分片
  const shardFile = path.resolve(storageDir, `feedback_${date}.json`);
  let shardItems: InAppFeedback[] = [];
  if (fs.existsSync(shardFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));
      if (Array.isArray(parsed)) shardItems = parsed;
    } catch {}
  }
  shardItems.unshift(noticeItem);
  atomicWriteJson(shardFile, shardItems);

  // 2. 更新索引
  const indexFile = path.resolve(storageDir, 'feedback_index.json');
  let dates: string[] = [date];
  let totalCount = shardItems.length;
  if (fs.existsSync(indexFile)) {
    try {
      const idxData: FeedbackDateIndex = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      if (Array.isArray(idxData.dates)) {
        dates = Array.from(new Set([date, ...idxData.dates]));
        dates.sort((a, b) => b.localeCompare(a));
        totalCount = (idxData.totalCount || 0) + 1;
      }
    } catch {}
  }
  atomicWriteJson(indexFile, {
    dates,
    totalCount,
    updatedAt: new Date().toISOString()
  });

  // 3. 同步写回 feedback_queue.json
  let queueItems: InAppFeedback[] = [];
  if (fs.existsSync(queueFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
      if (Array.isArray(parsed)) queueItems = parsed;
    } catch {}
  }
  queueItems.unshift(noticeItem);
  atomicWriteJson(queueFile, queueItems);

  return noticeItem;
}

/**
 * 从存储目录或队列文件中聚合获取新待处理反馈
 */
export function collectPendingItemsFromStorage(
  storageDir: string,
  queueFile: string,
  lastProcessedId: number
): InAppFeedback[] {
  const map = new Map<number, InAppFeedback>();

  // 1. 优先扫描当天及最近的分片文件
  const today = getLocalDateString();
  const todayShard = path.resolve(storageDir, `feedback_${today}.json`);
  if (fs.existsSync(todayShard)) {
    try {
      const items = JSON.parse(fs.readFileSync(todayShard, 'utf-8'));
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.id > lastProcessedId && item.status === 'pending') {
            map.set(item.id, item);
          }
        }
      }
    } catch {}
  }

  // 扫描 index 中的近期分片
  const indexFile = path.resolve(storageDir, 'feedback_index.json');
  if (fs.existsSync(indexFile)) {
    try {
      const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      if (Array.isArray(index?.dates)) {
        for (const date of index.dates.slice(0, 3)) {
          const shardPath = path.resolve(storageDir, `feedback_${date}.json`);
          if (fs.existsSync(shardPath) && shardPath !== todayShard) {
            const items = JSON.parse(fs.readFileSync(shardPath, 'utf-8'));
            if (Array.isArray(items)) {
              for (const item of items) {
                if (item.id > lastProcessedId && item.status === 'pending') {
                  map.set(item.id, item);
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  // 2. 检查 feedback_queue.json
  if (fs.existsSync(queueFile)) {
    try {
      const raw = fs.readFileSync(queueFile, 'utf-8');
      const queue = JSON.parse(raw);
      if (Array.isArray(queue)) {
        for (const item of queue) {
          if (item.id > lastProcessedId && item.status === 'pending') {
            map.set(item.id, item);
          }
        }
      }
    } catch {}
  }

  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

/**
 * 批量处理并分诊端侧反馈
 */
export function processQueueBatch(
  queueFileOrDir: string,
  items: InAppFeedback[],
  options: WatcherOptions = {}
): InAppFeedback[] {
  const isFile = fs.existsSync(queueFileOrDir) && fs.statSync(queueFileOrDir).isFile();
  const storageDir = isFile ? path.dirname(queueFileOrDir) : queueFileOrDir;
  const queueFile = isFile ? queueFileOrDir : path.resolve(storageDir, 'feedback_queue.json');
  const lastProcessedFile =
    options.lastProcessedFile ||
    path.resolve(storageDir, 'last_processed_id.txt');

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

    // 同步写入对应日期的分片
    const itemDate = item.date || getLocalDateString(item.receivedAt || item.timestamp);
    item.date = itemDate;
    const shardFile = path.resolve(storageDir, `feedback_${itemDate}.json`);
    if (fs.existsSync(shardFile)) {
      try {
        const shardItems: InAppFeedback[] = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));
        const idx = shardItems.findIndex(i => i.id === item.id);
        if (idx >= 0) {
          shardItems[idx] = { ...shardItems[idx], ...item };
        } else {
          shardItems.unshift(item);
        }
        atomicWriteJson(shardFile, shardItems);
      } catch {}
    }

    // 同步更新至全局队列中的对应条目
    const existingIndex = curQueue.findIndex(q => q.id === item.id);
    if (existingIndex >= 0) {
      curQueue[existingIndex] = { ...curQueue[existingIndex], ...item };
    } else {
      curQueue.unshift(item);
    }
  }

  // 原子化写回队列
  if (curQueue.length > 0 || fs.existsSync(queueFile)) {
    atomicWriteJson(queueFile, curQueue);
  }

  // 更新已处理最大 ID 游标
  setLastProcessedId(lastProcessedFile, maxId);

  return processedItems;
}

/**
 * 手动更新单个反馈状态 (支持跨分片检索、CLI 和 MCP 回写)
 */
export function updateFeedbackStatus(
  queueFileOrDir: string,
  id: number,
  status: FeedbackStatus,
  reply?: string
): InAppFeedback | null {
  const isFile = fs.existsSync(queueFileOrDir) && fs.statSync(queueFileOrDir).isFile();
  const storageDir = isFile ? path.dirname(queueFileOrDir) : queueFileOrDir;
  const queueFile = isFile ? queueFileOrDir : path.resolve(storageDir, 'feedback_queue.json');
  const numId = Number(id);

  let updatedItem: InAppFeedback | null = null;

  // 1. 跨分片检索并更新
  if (fs.existsSync(storageDir)) {
    try {
      const files = fs.readdirSync(storageDir);
      const shardFiles = files.filter(f => f.startsWith('feedback_') && f.endsWith('.json') && f !== 'feedback_index.json' && f !== 'feedback_queue.json');
      for (const sf of shardFiles) {
        const shardPath = path.resolve(storageDir, sf);
        try {
          const raw = fs.readFileSync(shardPath, 'utf-8');
          const shardList: InAppFeedback[] = JSON.parse(raw);
          const item = shardList.find(i => i.id === numId);
          if (item) {
            item.status = status;
            if (reply !== undefined) item.reply = reply;
            item.updatedAt = new Date().toISOString();
            atomicWriteJson(shardPath, shardList);
            updatedItem = item;
            break;
          }
        } catch {}
      }
    } catch {}
  }

  // 2. 同步更新 feedback_queue.json
  if (fs.existsSync(queueFile)) {
    try {
      const raw = fs.readFileSync(queueFile, 'utf-8');
      const queue: InAppFeedback[] = JSON.parse(raw);
      const item = queue.find(i => i.id === numId);
      if (item) {
        item.status = status;
        if (reply !== undefined) item.reply = reply;
        item.updatedAt = new Date().toISOString();
        atomicWriteJson(queueFile, queue);
        if (!updatedItem) updatedItem = item;
      }
    } catch {}
  }

  return updatedItem;
}

/**
 * 获取待处理反馈列表
 */
export function getPendingFeedback(
  queueFileOrDir: string,
  statusFilter?: FeedbackStatus | 'all'
): InAppFeedback[] {
  const isFile = fs.existsSync(queueFileOrDir) && fs.statSync(queueFileOrDir).isFile();
  const storageDir = isFile ? path.dirname(queueFileOrDir) : queueFileOrDir;
  const queueFile = isFile ? queueFileOrDir : path.resolve(storageDir, 'feedback_queue.json');

  const map = new Map<number, InAppFeedback>();

  // 优先从分片读取
  if (fs.existsSync(storageDir)) {
    try {
      const files = fs.readdirSync(storageDir);
      const shardFiles = files.filter(f => f.startsWith('feedback_') && f.endsWith('.json') && f !== 'feedback_index.json' && f !== 'feedback_queue.json');
      for (const sf of shardFiles) {
        try {
          const list: InAppFeedback[] = JSON.parse(fs.readFileSync(path.resolve(storageDir, sf), 'utf-8'));
          if (Array.isArray(list)) {
            for (const item of list) {
              map.set(item.id, item);
            }
          }
        } catch {}
      }
    } catch {}
  }

  // 合并 feedback_queue.json
  if (fs.existsSync(queueFile)) {
    try {
      const raw = fs.readFileSync(queueFile, 'utf-8');
      const queue: InAppFeedback[] = JSON.parse(raw);
      if (Array.isArray(queue)) {
        for (const item of queue) {
          if (!map.has(item.id)) {
            map.set(item.id, item);
          }
        }
      }
    } catch {}
  }

  const allItems = Array.from(map.values()).sort((a, b) => b.id - a.id);

  if (!statusFilter || statusFilter === 'pending') {
    return allItems.filter(i => i.status === 'pending');
  }
  if (statusFilter === 'all') {
    return allItems;
  }
  return allItems.filter(i => i.status === statusFilter);
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
            name: '@lylyuanliang/agent-feedback-sentinel',
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
 * 解析本机可用的 agentapi 可执行程序路径
 */
export function getAgentApiExecutable(): string {
  const home = os.homedir();
  const winBat = path.join(home, '.gemini/antigravity/bin/agentapi.bat');
  if (process.platform === 'win32' && fs.existsSync(winBat)) {
    return `"${winBat}"`;
  }
  const nixBin = path.join(home, '.gemini/antigravity/bin/agentapi');
  if (fs.existsSync(nixBin)) {
    return `"${nixBin}"`;
  }
  return 'agentapi';
}

/**
 * 自动检测并推断当前项目工作区对应的活跃 Antigravity 会话 ID
 * 1. 优先读取系统环境变量 ANTIGRAVITY_CONVERSATION_ID (智能体内部子进程环境)
 * 2. 外部终端自适应：读取 ~/.gemini/antigravity/conversation_summaries.db (通过 Node 原生 node:sqlite 零依赖检索)
 */
export function detectAntigravityConversation(cwd: string = process.cwd()): string | null {
  if (process.env.ANTIGRAVITY_CONVERSATION_ID) {
    return process.env.ANTIGRAVITY_CONVERSATION_ID;
  }
  try {
    const home = os.homedir();
    const dbPath = path.join(home, '.gemini/antigravity/conversation_summaries.db');
    if (!fs.existsSync(dbPath)) return null;

    // 动态探测原生 node:sqlite (兼容 CJS 与 ESM 打包环境)
    const req = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
    // @ts-ignore
    const { DatabaseSync } = req('node:sqlite');
    if (!DatabaseSync) return null;

    const db = new DatabaseSync(dbPath, { readOnly: true });
    const normCwd = path.resolve(cwd).replace(/\\/g, '/').toLowerCase();
    const stmt = db.prepare(`
      SELECT conversation_id, workspace_uris, last_modified_time
      FROM conversation_summaries
      WHERE killed = 0
      ORDER BY last_modified_time DESC
      LIMIT 20
    `);
    const rows = stmt.all() as Array<{ conversation_id: string; workspace_uris: string }>;
    db.close();

    for (const row of rows) {
      if (row.workspace_uris) {
        const decodedUris = decodeURIComponent(row.workspace_uris).replace(/\\/g, '/').toLowerCase();
        if (decodedUris.includes(normCwd)) {
          return row.conversation_id;
        }
      }
    }
  } catch {
    // 降级容错
  }
  return null;
}

/**
 * 静默哨兵核心监听器
 * 1. 适配按天分片存储目录及队列文件的静默轮询
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

  const detectedConvId = options.conversationId || detectAntigravityConversation(storageDir || process.cwd());
  const adapter = options.adapter || (detectedConvId ? 'antigravity' : 'webhook');
  const convId = detectedConvId;

  const isOnce = options.once !== false;
  const log = options.silent
    ? () => {}
    : (...args: any[]) => console.log(...args);
  const warn = options.silent
    ? () => {}
    : (...args: any[]) => console.warn(...args);

  // 确保存储目录就绪
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  let lastProcessedId = getLastProcessedId(lastProcessedFile);
  const convInfo = adapter === 'antigravity' && convId ? ` (会话: ${convId.slice(0, 8)}...)` : '';
  log(`[*] Agent Feedback 哨兵已启动 (适配器: ${adapter}${convInfo})...`);
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
        const newItems = collectPendingItemsFromStorage(storageDir, queueFile, lastProcessedId);

        if (newItems.length > 0) {
          log(`\n[*] 📥 捕获到新反馈 (初始 ${newItems.length} 条)，启动 ${debounceMs / 1000} 秒防抖收集窗口...`);

          const startTime = Date.now();
          let aggregatedItems = [...newItems];

          while (Date.now() - startTime < debounceMs) {
            if (!isRunning || options.signal?.aborted) break;

            await new Promise(r => setTimeout(r, stepInterval));

            try {
              const curNew = collectPendingItemsFromStorage(storageDir, queueFile, lastProcessedId);
              if (curNew.length > aggregatedItems.length) {
                log(`[*] ➕ 窗口内捕获追加提交，当前聚合批次数量: ${curNew.length} 条...`);
                aggregatedItems = curNew;
                options.onDebounceProgress?.(curNew.length);
              }
            } catch {
              // 忽略窗口内的读锁瞬态
            }
          }

          log(`[*] ✅ 防抖收集完毕，共聚合 ${aggregatedItems.length} 条端侧反馈！`);

          // 执行安全分诊与状态持久化
          const target = fs.existsSync(queueFile) ? queueFile : storageDir;
          const processedBatch = processQueueBatch(target, aggregatedItems, options);
          lastProcessedId = getLastProcessedId(lastProcessedFile);

          // 适配器调度分发
          if (adapter === 'webhook') {
            let webhookHandled = false;
            if (options.webhookCommand) {
              webhookHandled = true;
              try {
                const relStorageDir = path.relative(process.cwd(), storageDir).replace(/\\/g, '/') || storageDir;
                let executedCmd = options.webhookCommand;
                const envMap: Record<string, string> = {
                  FEEDBACK_COUNT: String(processedBatch.length),
                  FEEDBACK_IDS: processedBatch.map(i => i.id).join(','),
                  FEEDBACK_DIR: relStorageDir
                };
                // 抹平跨平台命令语法差异：在 Node 层直接将 $VAR, ${VAR}, %VAR% 展开替换
                for (const [k, v] of Object.entries(envMap)) {
                  executedCmd = executedCmd
                    .replace(new RegExp(`\\$${k}\\b`, 'g'), v)
                    .replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v)
                    .replace(new RegExp(`%${k}%`, 'g'), v);
                }
                await execAsync(executedCmd, {
                  env: {
                    ...process.env,
                    ...envMap
                  }
                });
              } catch (cmdErr: any) {
                const rawError = (cmdErr?.stderr || cmdErr?.message || String(cmdErr)).trim();
                warn(`[!] Webhook 命令执行异常: ${rawError}`);
                // 开发者专属直出报错，不包装客套话
                const errorReply = `[Agent 调度失败] ${rawError}`;
                for (const item of processedBatch) {
                  updateFeedbackStatus(storageDir, item.id, 'processing', errorReply);
                }
              }
            }
            if (options.webhookUrl) {
              webhookHandled = true;
              try {
                const res = await fetch(options.webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ batch: processedBatch })
                });
                if (!res.ok) {
                  throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }
              } catch (netErr: any) {
                const rawError = (netErr?.message || String(netErr)).trim();
                warn(`[!] Webhook 请求发送异常: ${rawError}`);
                const errorReply = `[Webhook 推送失败] ${rawError}`;
                for (const item of processedBatch) {
                  updateFeedbackStatus(storageDir, item.id, 'processing', errorReply);
                }
              }
            }
            if (!webhookHandled && !options.onWakeup) {
              const tipMsg = '因未配置 webhookCommand 或 webhookUrl，未触发外部通知。';
              log(`[*] 💡 [Webhook 适配器提示] 批次已安全分诊并持久化。${tipMsg}`);
              for (const item of processedBatch) {
                updateFeedbackStatus(storageDir, item.id, 'processing', `[调度未触发] ${tipMsg}`);
              }
            }
          }

          if (typeof options.onWakeup === 'function') {
            await options.onWakeup(processedBatch, adapter);
          }

          if (adapter === 'antigravity') {
            log('[*] 🔔 触发 Antigravity 响应式唤醒机制...');
            const activeConvId = convId || options.conversationId || process.env.ANTIGRAVITY_CONVERSATION_ID || detectAntigravityConversation(storageDir || process.cwd());
            if (activeConvId) {
              const summaryLines = processedBatch
                .slice(0, 3)
                .map(i => `[#${i.id}] ${i.content}`)
                .join('; ');
              const moreText = processedBatch.length > 3 ? ` 等共 ${processedBatch.length} 条` : '';
              const wakeMsg = `📥 [Agent Feedback 自动唤醒] 捕获到端侧真实新反馈 (共 ${processedBatch.length} 条)：${summaryLines}${moreText}。请立即进入排查与自愈修复流程。`;
              try {
                const safeMsg = wakeMsg.replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
                const agentApiBin = getAgentApiExecutable();
                await execAsync(`${agentApiBin} send-message ${activeConvId} "${safeMsg}"`);
                log(`[*] 🚀 已通过 agentapi 向 Antigravity 会话 [${activeConvId}] 发送主动唤醒消息！`);
              } catch (apiErr: any) {
                const rawError = (apiErr?.message || String(apiErr)).trim();
                warn(`[!] agentapi 唤醒调用异常: ${rawError}`);
                for (const item of processedBatch) {
                  updateFeedbackStatus(storageDir, item.id, 'processing', `[agentapi 唤醒失败] ${rawError}`);
                }
              }
            } else {
              const tipMsg = '未能识别到活跃的 Antigravity 会话 ID，跳过 agentapi 发送。';
              warn(`[!] ${tipMsg}`);
              for (const item of processedBatch) {
                updateFeedbackStatus(storageDir, item.id, 'processing', `[Antigravity 路由失败] ${tipMsg}`);
              }
            }

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
