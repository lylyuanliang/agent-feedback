/**
 * @agent-feedback/vite-plugin
 * In-App Agent Feedback Bridge - Zero-Code Bundler Plugin & DevServer Middleware
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  InAppFeedback,
  FeedbackDateIndex,
  FeedbackStatus,
  FeedbackType,
  FeedbackTheme
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

      // 确保本地持久化存储目录存在
      if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
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
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

          next();
        });
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
