/**
 * @agent-feedback/vite-plugin
 * In-App Agent Feedback Bridge - Zero-Code Bundler Plugin & DevServer Middleware
 */

import fs from 'node:fs';
import path from 'node:path';
import { startSentinel, detectAntigravityConversation } from '@lylyuanliang/agent-feedback-sentinel';
import type { WatcherAdapter } from '@lylyuanliang/agent-feedback-sentinel';
import {
  isVideoMedia,
  type InAppFeedback,
  type FeedbackMediaItem,
  type FeedbackDateIndex,
  type FeedbackStatus,
  type FeedbackType,
  type FeedbackTheme
} from '@lylyuanliang/agent-feedback-core';

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
 * 读取日级索引文件
 */
export function readIndex(feedbackDir: string): FeedbackDateIndex {
  const indexFile = path.resolve(feedbackDir, 'feedback_index.json');
  if (fs.existsSync(indexFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      if (Array.isArray(parsed?.dates)) {
        return parsed;
      }
    } catch {}
  }
  return rebuildIndex(feedbackDir);
}

/**
 * 写入日级索引文件
 */
export function writeIndex(feedbackDir: string, index: FeedbackDateIndex): void {
  const indexFile = path.resolve(feedbackDir, 'feedback_index.json');
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * 读取指定日期的分片文件
 */
export function readShard(feedbackDir: string, date: string): InAppFeedback[] {
  const shardFile = path.resolve(feedbackDir, `feedback_${date}.json`);
  if (fs.existsSync(shardFile)) {
    try {
      const content = fs.readFileSync(shardFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return [];
}

/**
 * 写入指定日期的分片文件
 */
export function writeShard(feedbackDir: string, date: string, items: InAppFeedback[]): void {
  const shardFile = path.resolve(feedbackDir, `feedback_${date}.json`);
  fs.writeFileSync(shardFile, JSON.stringify(items, null, 2), 'utf-8');
}

/**
 * 重新扫描分片目录并重建索引文件
 */
export function rebuildIndex(feedbackDir: string): FeedbackDateIndex {
  if (!fs.existsSync(feedbackDir)) {
    return { dates: [], totalCount: 0, updatedAt: new Date().toISOString() };
  }
  const files = fs.readdirSync(feedbackDir);
  const shardFiles = files.filter(f => f.startsWith('feedback_') && f.endsWith('.json') && f !== 'feedback_index.json' && f !== 'feedback_queue.json');
  const dates: string[] = [];
  let totalCount = 0;

  for (const file of shardFiles) {
    const match = file.match(/^feedback_(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) {
      const date = match[1];
      dates.push(date);
      const items = readShard(feedbackDir, date);
      totalCount += items.length;
    }
  }

  dates.sort((a, b) => b.localeCompare(a));
  const index: FeedbackDateIndex = {
    dates,
    totalCount,
    updatedAt: new Date().toISOString()
  };
  writeIndex(feedbackDir, index);
  return index;
}

/**
 * 向后兼容：将旧的 feedback_queue.json 自动迁移并合并到按天分片中
 */
export function migrateLegacyQueue(feedbackDir: string): void {
  const queueFile = path.resolve(feedbackDir, 'feedback_queue.json');
  if (!fs.existsSync(queueFile)) return;

  try {
    const raw = fs.readFileSync(queueFile, 'utf-8');
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return;

    const dateMap = new Map<string, InAppFeedback[]>();
    for (const item of items) {
      const itemDate = item.date || getLocalDateString(item.receivedAt || item.timestamp);
      item.date = itemDate;
      item.type = item.type || 'user_feedback';

      if (!dateMap.has(itemDate)) {
        dateMap.set(itemDate, []);
      }
      dateMap.get(itemDate)!.push(item);
    }

    for (const [date, newItems] of dateMap.entries()) {
      const shardItems = readShard(feedbackDir, date);
      const existingIds = new Set(shardItems.map(i => i.id));
      for (const it of newItems) {
        if (!existingIds.has(it.id)) {
          shardItems.push(it);
          existingIds.add(it.id);
        }
      }
      shardItems.sort((a, b) => b.id - a.id);
      writeShard(feedbackDir, date, shardItems);
    }

    rebuildIndex(feedbackDir);
  } catch {
    // 忽略损坏的旧队列
  }
}

/**
 * 同步将分片所有数据汇总至 feedback_queue.json，保证向下兼容
 */
export function syncLegacyQueue(feedbackDir: string): void {
  try {
    const index = readIndex(feedbackDir);
    const allItems: InAppFeedback[] = [];
    for (const date of index.dates) {
      allItems.push(...readShard(feedbackDir, date));
    }
    allItems.sort((a, b) => b.id - a.id);
    const queueFile = path.resolve(feedbackDir, 'feedback_queue.json');
    fs.writeFileSync(queueFile, JSON.stringify(allItems, null, 2), 'utf-8');
  } catch {}
}

/**
 * 流式合并临时分块文件
 */
export async function assembleChunks(tempDir: string, totalChunks: number, targetPath: string): Promise<number> {
  const writeStream = fs.createWriteStream(targetPath);
  let totalBytes = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.resolve(tempDir, `chunk_${i}`);
    if (!fs.existsSync(chunkPath)) {
      writeStream.close();
      throw new Error(`Missing chunk index ${i}`);
    }
    const chunkBuf = fs.readFileSync(chunkPath);
    totalBytes += chunkBuf.length;
    writeStream.write(chunkBuf);
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });

  // 合并完成，彻底清理临时分块目录
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  return totalBytes;
}

/**
 * 静态媒体流式传输服务 (支持 HTTP 206 Partial Content Range 视频点播)
 */
export function streamStaticMediaFile(req: any, res: any, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Media file not found' }));
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).slice(1).toLowerCase();

  const MIME_MAP: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
    ogg: 'video/ogg',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif'
  };

  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const range = req.headers?.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      res.statusCode = 416; // Range Not Satisfiable
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      res.end();
      return;
    }

    const chunksize = end - start + 1;
    res.statusCode = 206; // Partial Content
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunksize);
    res.setHeader('Content-Type', contentType);

    const fileStream = fs.createReadStream(filePath, { start, end });
    fileStream.on('error', () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    fileStream.pipe(res);
  } else {
    res.statusCode = 200;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Type', contentType);

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    fileStream.pipe(res);
  }
}

/**
 * 哨兵自动生命周期托管选项
 */
export interface SentinelPluginOptions {
  /**
   * 是否自动启动并托管哨兵监听 (默认 true 当提供 sentinel 配置对象时)
   */
  autoStart?: boolean;

  /**
   * 唤醒适配器类型: 'webhook' | 'mcp' | 'antigravity'
   * 默认: 'webhook'
   */
  adapter?: WatcherAdapter;

  /**
   * Webhook 适配器触发的外部 Shell 命令 (例如 "claude -p '...'" 或 "dsh '...'")
   */
  webhookCmd?: string;

  /**
   * Webhook 适配器触发的外部 Shell 命令别名 (同 webhookCmd)
   */
  webhookCommand?: string;

  /**
   * Webhook 适配器触发的 HTTP POST 端点
   */
  webhookUrl?: string;

  /**
   * 防抖聚合窗口时长秒数 (默认: 10)
   */
  debounceSeconds?: number;

  /**
   * 防抖聚合窗口时长毫秒数 (可选，用于快速测试)
   */
  debounceMs?: number;

  /**
   * 静默轮询检测间隔毫秒数 (默认: 2000)
   */
  pollIntervalMs?: number;

  /**
   * Antigravity 目标会话 ID (可选，默认自动读取环境变量 ANTIGRAVITY_CONVERSATION_ID)
   */
  conversationId?: string;

  /**
   * 唤醒回调钩子 (常用于测试拦截或自定义事件通知)
   */
  onWakeup?: (batch: InAppFeedback[], adapter: string) => void | Promise<void>;
}

/**
 * 插件配置项
 */
export interface AgentFeedbackPluginOptions {
  /**
   * 是否自动启动临时 HTTPS 穿透 (Cloudflare / Pinggy)
   * 默认 false
   */
  tunnel?: boolean;

  /**
   * 本地反馈持久化队列目录 (相对项目根路径)
   * 默认 '.agent/feedback'
   */
  storageDir?: string;

  /**
   * 默认主题：dark | light | auto
   * 默认 'dark'
   */
  theme?: FeedbackTheme;

  /**
   * 主题主色 (Primary Color)，如 '#4edea3' 或 '#2563eb'
   */
  primaryColor?: string;

  /**
   * 显式指定外部 API 服务基地址 (如内网穿透公网域名 https://xxx.cpolar.top 或特定主机)
   * 默认空字符串 (自动采用同源相对路径，即使用项目自身的 Vite DevServer 服务)
   */
  apiBase?: string;

  /**
   * 哨兵自动生命周期托管配置 (DevServer 启动时自动运行，退出时自动终止)
   * 支持传入 boolean (true 开启默认 webhook 模式) 或配置对象
   */
  sentinel?: SentinelPluginOptions | boolean;
}

/**
 * Vite 插件轻量契约定义 (兼容 Vite 4 / 5 / 6 及无显式依赖环境)
 */
export interface AgentFeedbackPlugin {
  name: string;
  apply: 'serve' | 'build';
  configResolved?: (config: any) => void;
  configureServer?: (server: any) => void;
  transformIndexHtml?: (html: string, ctx?: any) => any;
  resolveId?: (id: string, importer?: string, options?: any) => any;
  load?: (id: string, options?: any) => any;
  [key: string]: any;
}

export type Plugin = AgentFeedbackPlugin;

/**
 * 创建 Agent Feedback Vite 插件
 * 具备 100% Zero-DCE 特性：仅在 dev (serve) 模式生效，生产 build 零体积残留
 */
export function agentFeedback(options: AgentFeedbackPluginOptions = {}): AgentFeedbackPlugin {
  let isDev = true;
  const storageRelDir = options.storageDir || '.agent/feedback';
  const defaultTheme: FeedbackTheme = options.theme || 'dark';
  const primaryColor = options.primaryColor;

  return {
    name: 'agent-feedback-plugin',
    // 关键架构：enforce 'serve'，保证在 vite build (生产打包) 时彻底被 Vite 剥离 (Zero-DCE)
    apply: 'serve',

    configResolved(config: any) {
      if (config && typeof config.command === 'string') {
        isDev = config.command === 'serve';
      }
    },

    configureServer(server: any) {
      if (!isDev) return;

      const projectRoot = server?.config?.root || process.cwd();
      const feedbackDir = path.resolve(projectRoot, storageRelDir);
      const screenshotsDir = path.resolve(feedbackDir, 'screenshots');
      const mediaDir = path.resolve(feedbackDir, 'media');

      // 确保本地持久化存储目录存在
      if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
      }
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      // 向后兼容迁移：启动时自动将 feedback_queue.json 迁移合并到分片中
      migrateLegacyQueue(feedbackDir);

      // 自动检查与配置根目录 .gitignore，确保 .agent/ 敏感数据与截图不被意外提交
      const gitignorePath = path.resolve(projectRoot, '.gitignore');
      try {
        if (fs.existsSync(gitignorePath)) {
          const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
          if (!gitignoreContent.includes('.agent/') && !gitignoreContent.includes('.agent\n') && !gitignoreContent.endsWith('.agent')) {
            const prefix = gitignoreContent.length > 0 && !gitignoreContent.endsWith('\n') ? '\n' : '';
            fs.appendFileSync(gitignorePath, `${prefix}# Agent Feedback Bridge local storage\n.agent/\n`, 'utf-8');
          }
        } else {
          fs.writeFileSync(gitignorePath, '# Agent Feedback Bridge local storage\n.agent/\n', 'utf-8');
        }
      } catch {
        // 忽略 .gitignore 写入权限异常，不阻塞 DevServer
      }

      // 挂载 Connect API 中间件
      if (server?.middlewares?.use) {
        server.middlewares.use((req: any, res: any, next: (err?: any) => void) => {
          const rawUrl = req.url || '';
          const urlPath = rawUrl.split('?')[0];

          if (!urlPath.startsWith('/api/__agent_feedback')) {
            return next();
          }

          // 统一 CORS 响应头，支持跨源与移动端访问
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Id, X-Chunk-Index, X-Total-Chunks, X-File-Name, Range');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          // 1. 提交反馈端点: POST /api/__agent_feedback/submit
          if (req.method === 'POST' && urlPath === '/api/__agent_feedback/submit') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });

            req.on('end', () => {
              try {
                const data = body ? JSON.parse(body) : {};

                // 规范基础标识与状态
                if (!data.id) {
                  data.id = Date.now();
                }
                if (!data.timestamp) {
                  data.timestamp = Date.now();
                }
                if (!data.receivedAt) {
                  data.receivedAt = new Date().toISOString();
                }
                if (!data.status) {
                  data.status = 'pending';
                }
                if (!data.type) {
                  data.type = 'user_feedback';
                }
                if (!data.date) {
                  data.date = getLocalDateString(data.timestamp);
                }

                // 处理并转存截图文件
                const rawScreenshots: string[] = [];
                if (Array.isArray(data.screenshots)) {
                  rawScreenshots.push(...data.screenshots);
                } else if (typeof data.screenshots === 'string') {
                  rawScreenshots.push(data.screenshots);
                }
                if (typeof data.screenshot === 'string') {
                  rawScreenshots.push(data.screenshot);
                }

                if (rawScreenshots.length > 0) {
                  if (!fs.existsSync(screenshotsDir)) {
                    fs.mkdirSync(screenshotsDir, { recursive: true });
                  }

                  const savedPaths: string[] = [];
                  rawScreenshots.forEach((shot, index) => {
                    try {
                      let base64Data = shot;
                      let ext = 'png';
                      const match = shot.match(/^data:image\/([a-zA-Z0-9-+]+);base64,(.+)$/);
                      if (match) {
                        ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                        base64Data = match[2];
                      } else if (shot.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(shot)) {
                        base64Data = shot.trim();
                      } else {
                        // 已是相对路径或外部 URL，保留
                        savedPaths.push(shot);
                        return;
                      }

                      const fileName = rawScreenshots.length === 1
                        ? `${data.id}.${ext}`
                        : `${data.id}_${index}.${ext}`;
                      const filePath = path.resolve(screenshotsDir, fileName);
                      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                      savedPaths.push(`screenshots/${fileName}`);
                    } catch {
                      // 截图持久化容错
                    }
                  });

                  if (savedPaths.length > 0) {
                    data.screenshots = savedPaths;
                    delete (data as any).screenshot;
                  }
                }

                // 规范与同步结构化 media 数组 (支持独立二进制流式存储)
                if (!Array.isArray(data.media)) {
                  data.media = [];
                }
                // 向后兼容：如果 screenshots 包含 media/ 视频或附件，自动同步到 media 结构化列表
                if (Array.isArray(data.screenshots)) {
                  data.screenshots.forEach((shotPath: string) => {
                    const isVid = isVideoMedia(shotPath);
                    if (isVid || shotPath.startsWith('media/')) {
                      const alreadyInMedia = data.media!.some((m: FeedbackMediaItem) => m.url === shotPath);
                      if (!alreadyInMedia) {
                        data.media!.push({
                          type: isVid ? 'video' : 'image',
                          url: shotPath,
                          filename: path.basename(shotPath)
                        });
                      }
                    }
                  });
                }

                // 持久化至当天分片并更新索引
                const today = data.date;
                const shardItems = readShard(feedbackDir, today);
                shardItems.unshift(data);
                writeShard(feedbackDir, today, shardItems);
                rebuildIndex(feedbackDir);
                syncLegacyQueue(feedbackDir);

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, id: data.id }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || 'Failed to parse feedback payload' }));
              }
            });
            return;
          }

          // 2. 提交系统通知端点: POST /api/__agent_feedback/notice
          if (req.method === 'POST' && urlPath === '/api/__agent_feedback/notice') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });

            req.on('end', () => {
              try {
                const data = body ? JSON.parse(body) : {};
                const now = Date.now();
                const noticeItem: InAppFeedback = {
                  id: data.id || now,
                  type: 'agent_notice',
                  status: 'completed',
                  content: data.content || data.message || '系统通知',
                  receivedAt: data.receivedAt || new Date(now).toISOString(),
                  timestamp: data.timestamp || now,
                  date: data.date || getLocalDateString(data.timestamp || now),
                  reply: data.reply || '系统主动推送的 Agent 通知',
                  telemetry: data.telemetry || {
                    route: 'cli',
                    viewport: { width: 0, height: 0, dpr: 1 },
                    userAgent: '@lylyuanliang/agent-feedback-vite-plugin',
                    platform: 'desktop'
                  }
                };

                const today = noticeItem.date!;
                const shardItems = readShard(feedbackDir, today);
                shardItems.unshift(noticeItem);
                writeShard(feedbackDir, today, shardItems);
                rebuildIndex(feedbackDir);
                syncLegacyQueue(feedbackDir);

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, id: noticeItem.id, item: noticeItem }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || 'Failed to parse notice payload' }));
              }
            });
            return;
          }

          // 3. 日级索引端点: GET /api/__agent_feedback/dates
          if (req.method === 'GET' && urlPath === '/api/__agent_feedback/dates') {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            const index = readIndex(feedbackDir);
            const latestDate = index.dates.length > 0 ? index.dates[0] : '';
            res.end(JSON.stringify({
              dates: index.dates,
              totalCount: index.totalCount,
              latestDate
            }));
            return;
          }

          // 4. 获取反馈历史端点: GET /api/__agent_feedback/list
          if (req.method === 'GET' && urlPath === '/api/__agent_feedback/list') {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;

            const urlObj = new URL(rawUrl, 'http://localhost');
            const dateParam = urlObj.searchParams.get('date');

            if (dateParam) {
              // 指定了 date 参数：返回该日分片列表
              const shardList = readShard(feedbackDir, dateParam);
              res.end(JSON.stringify(shardList));
              return;
            }

            // 未传 date：返回最新一天的工单列表以保持 API 兼容
            const index = readIndex(feedbackDir);
            if (index.dates.length > 0) {
              const latestShard = readShard(feedbackDir, index.dates[0]);
              res.end(JSON.stringify(latestShard));
            } else {
              res.end(JSON.stringify([]));
            }
            return;
          }

          // 5. 跨分片更新状态: POST /api/__agent_feedback/status
          if (req.method === 'POST' && urlPath === '/api/__agent_feedback/status') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });

            req.on('end', () => {
              try {
                const data = body ? JSON.parse(body) : {};
                const id = data.id !== undefined ? Number(data.id) : NaN;
                const status: FeedbackStatus = data.status;
                const reply = data.reply;

                if (isNaN(id) || !status) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Missing required id or status parameter' }));
                  return;
                }

                const index = readIndex(feedbackDir);
                let updatedItem: InAppFeedback | null = null;

                for (const date of index.dates) {
                  const shardItems = readShard(feedbackDir, date);
                  const target = shardItems.find(i => i.id === id);
                  if (target) {
                    target.status = status;
                    if (reply !== undefined) {
                      target.reply = reply;
                    }
                    target.updatedAt = new Date().toISOString();
                    writeShard(feedbackDir, date, shardItems);
                    updatedItem = target;
                    break;
                  }
                }

                if (updatedItem) {
                  syncLegacyQueue(feedbackDir);
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, item: updatedItem }));
                } else {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `Feedback item with id ${id} not found` }));
                }
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || 'Failed to update feedback status' }));
              }
            });
            return;
          }

          // 6. 静态服务截图文件: GET /api/__agent_feedback/screenshots/<filename>
          if (req.method === 'GET' && urlPath.startsWith('/api/__agent_feedback/screenshots/')) {
            const fileName = path.basename(urlPath);
            const filePath = path.resolve(screenshotsDir, fileName);
            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath).slice(1).toLowerCase();
              const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
              res.setHeader('Content-Type', mime);
              res.statusCode = 200;
              res.end(fs.readFileSync(filePath));
              return;
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Screenshot not found' }));
              return;
            }
          }

          // 7. 静态服务独立媒体文件 (带 HTTP 206 Partial Content Range 视频点播支持): GET /api/__agent_feedback/media/<filename>
          if (req.method === 'GET' && urlPath.startsWith('/api/__agent_feedback/media/')) {
            const fileName = path.basename(urlPath);
            const filePath = path.resolve(mediaDir, fileName);
            streamStaticMediaFile(req, res, filePath);
            return;
          }

          // 8. 独立分块媒体流式上传端点: POST /api/__agent_feedback/media/chunk
          if (req.method === 'POST' && urlPath === '/api/__agent_feedback/media/chunk') {
            const urlObj = new URL(rawUrl, 'http://localhost');
            const uploadId = (req.headers['x-upload-id'] as string) || urlObj.searchParams.get('uploadId') || '';
            const chunkIndex = parseInt((req.headers['x-chunk-index'] as string) || urlObj.searchParams.get('chunkIndex') || '0', 10);
            const totalChunks = parseInt((req.headers['x-total-chunks'] as string) || urlObj.searchParams.get('totalChunks') || '1', 10);
            const rawFileName = (req.headers['x-file-name'] as string) || urlObj.searchParams.get('fileName') || 'upload.bin';
            const decodedFileName = decodeURIComponent(rawFileName);

            const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '') || `up_${Date.now()}`;
            const safeExt = path.extname(decodedFileName) || '.mp4';
            const baseName = path.basename(decodedFileName, safeExt).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || 'video';
            const tempChunkDir = path.resolve(mediaDir, `.chunks_${safeUploadId}`);

            if (!fs.existsSync(tempChunkDir)) {
              fs.mkdirSync(tempChunkDir, { recursive: true });
            }

            const chunkFilePath = path.resolve(tempChunkDir, `chunk_${chunkIndex}`);
            const writeStream = fs.createWriteStream(chunkFilePath);

            req.pipe(writeStream);

            writeStream.on('finish', async () => {
              try {
                // 检查是否所有分块都已到达
                let allArrived = true;
                for (let i = 0; i < totalChunks; i++) {
                  if (!fs.existsSync(path.resolve(tempChunkDir, `chunk_${i}`))) {
                    allArrived = false;
                    break;
                  }
                }

                if (allArrived) {
                  const finalFileName = `${Date.now()}_${baseName}${safeExt}`;
                  const finalPath = path.resolve(mediaDir, finalFileName);
                  const finalSize = await assembleChunks(tempChunkDir, totalChunks, finalPath);

                  const isVideo = isVideoMedia(finalFileName);
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(JSON.stringify({
                    success: true,
                    completed: true,
                    filename: finalFileName,
                    url: `media/${finalFileName}`,
                    type: isVideo ? 'video' : 'image',
                    size: finalSize
                  }));
                } else {
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(JSON.stringify({
                    success: true,
                    completed: false,
                    receivedChunk: chunkIndex,
                    totalChunks
                  }));
                }
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || 'Failed to assemble media chunks' }));
              }
            });

            writeStream.on('error', (err: any) => {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Failed to write media chunk' }));
            });
            return;
          }

          // 9. 单文件流式上传端点: POST /api/__agent_feedback/media/upload
          if (req.method === 'POST' && urlPath === '/api/__agent_feedback/media/upload') {
            const urlObj = new URL(rawUrl, 'http://localhost');
            const rawFileName = (req.headers['x-file-name'] as string) || urlObj.searchParams.get('fileName') || `media_${Date.now()}.mp4`;
            const decodedFileName = decodeURIComponent(rawFileName);
            const safeExt = path.extname(decodedFileName) || '.mp4';
            const baseName = path.basename(decodedFileName, safeExt).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || 'file';
            const finalFileName = `${Date.now()}_${baseName}${safeExt}`;
            const finalPath = path.resolve(mediaDir, finalFileName);

            const writeStream = fs.createWriteStream(finalPath);
            let bytesWritten = 0;

            req.on('data', (chunk: any) => {
              bytesWritten += chunk.length;
            });

            req.pipe(writeStream);

            writeStream.on('finish', () => {
              const isVideo = isVideoMedia(finalFileName);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                completed: true,
                filename: finalFileName,
                url: `media/${finalFileName}`,
                type: isVideo ? 'video' : 'image',
                size: bytesWritten
              }));
            });

            writeStream.on('error', (err: any) => {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Failed to upload media file' }));
            });
            return;
          }

          next();
        });
      }

      // 启动并托管静默哨兵生命周期
      let sentinelAbortController: AbortController | null = null;
      const sentinelOpt = options.sentinel;
      const shouldAutoStartSentinel =
        sentinelOpt === true ||
        (typeof sentinelOpt === 'object' && sentinelOpt?.autoStart !== false);

      if (shouldAutoStartSentinel) {
        const sentinelCfg = typeof sentinelOpt === 'object' ? sentinelOpt : {};
        const autoConvId = sentinelCfg.conversationId || detectAntigravityConversation(projectRoot);
        const detectedAdapter = autoConvId ? 'antigravity' : 'webhook';
        const adapter = sentinelCfg.adapter || detectedAdapter;
        sentinelAbortController = new AbortController();

        startSentinel({
          storageDir: feedbackDir,
          adapter,
          conversationId: autoConvId || undefined,
          webhookCommand: sentinelCfg.webhookCommand || sentinelCfg.webhookCmd,
          webhookUrl: sentinelCfg.webhookUrl,
          debounceSeconds: sentinelCfg.debounceSeconds ?? 10,
          debounceMs: sentinelCfg.debounceMs,
          pollIntervalMs: sentinelCfg.pollIntervalMs ?? 2000,
          once: false, // 随 DevServer 持续常驻
          exitOnWakeup: false, // 杜绝由于唤醒退出导致 DevServer 进程退出
          signal: sentinelAbortController.signal,
          silent: false,
          onWakeup: sentinelCfg.onWakeup
        }).catch((err: any) => {
          if (server?.config?.logger?.warn) {
            server.config.logger.warn(`[@agent-feedback/vite-plugin] 哨兵运行异常: ${err?.message}`);
          }
        });

        if (server?.config?.logger?.info) {
          const convInfo = adapter === 'antigravity' && autoConvId ? ` (会话: ${autoConvId.slice(0, 8)}...)` : '';
          server.config.logger.info(`[@agent-feedback/vite-plugin] 哨兵已伴随 DevServer 自动启动 (适配器: ${adapter}${convInfo}, 常驻守护)`);
        }
      }

      // 绑定 DevServer 停止事件，优雅终止哨兵
      let onSigInt: (() => void) | null = null;
      let onSigTerm: (() => void) | null = null;

      const cleanupSentinel = () => {
        if (onSigInt) process.removeListener('SIGINT', onSigInt);
        if (onSigTerm) process.removeListener('SIGTERM', onSigTerm);
        if (sentinelAbortController && !sentinelAbortController.signal.aborted) {
          sentinelAbortController.abort();
          sentinelAbortController = null;
        }
      };

      onSigInt = () => cleanupSentinel();
      onSigTerm = () => cleanupSentinel();

      if (server?.httpServer) {
        server.httpServer.on('close', cleanupSentinel);
      }
      if (shouldAutoStartSentinel) {
        process.once('SIGINT', onSigInt);
        process.once('SIGTERM', onSigTerm);
      }
    },

    transformIndexHtml(html: string, ctx?: any) {
      const command = ctx?.command;
      const isBuild = command === 'build' || (!command && !isDev);
      if (isBuild) return html;

      // 仅在 dev 模式自动在 HTML 中注入端侧客户端入口脚本
      return [
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: '/@agent-feedback/client'
          },
          injectTo: 'body'
        }
      ];
    },

    resolveId(id: string) {
      if (
        id === '/@agent-feedback/client' ||
        id === '@agent-feedback/client' ||
        id === '/@lylyuanliang/agent-feedback-client' ||
        id === '@lylyuanliang/agent-feedback-client'
      ) {
        return '\0agent-feedback-client-virtual';
      }
    },

    load(id: string) {
      if (id === '\0agent-feedback-client-virtual') {
        const themeLiteral = JSON.stringify(defaultTheme);
        const colorLiteral = primaryColor ? JSON.stringify(primaryColor) : 'undefined';
        const apiBaseLiteral = options.apiBase ? JSON.stringify(options.apiBase.trim().replace(/\/+$/, '')) : 'undefined';
        // 输出虚拟客户端代码，驱动 Shadow DOM 自定义元素注册、主题透传与挂载
        return `
if (typeof window !== 'undefined') {
  window.__AGENT_FEEDBACK_OPTIONS__ = {
    theme: ${themeLiteral},
    primaryColor: ${colorLiteral},
    apiBase: ${apiBaseLiteral}
  };
}
import '@lylyuanliang/agent-feedback-client';
console.log('[Agent Feedback Bridge] In-App nervous system initialized.');
        `.trim();
      }
    }
  };
}

export default agentFeedback;
