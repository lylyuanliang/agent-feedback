/**
 * @agent-feedback/vite-plugin
 * In-App Agent Feedback Bridge - Zero-Code Bundler Plugin & DevServer Middleware
 */

import fs from 'node:fs';
import path from 'node:path';

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
      const queueFile = path.resolve(feedbackDir, 'feedback_queue.json');
      const screenshotsDir = path.resolve(feedbackDir, 'screenshots');

      // 确保本地持久化存储目录存在
      if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
      }

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
                  }
                }

                // 读取并追加至本地队列
                let history: any[] = [];
                if (fs.existsSync(queueFile)) {
                  try {
                    const content = fs.readFileSync(queueFile, 'utf-8');
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                      history = parsed;
                    }
                  } catch {
                    history = [];
                  }
                }

                history.unshift(data);
                fs.writeFileSync(queueFile, JSON.stringify(history, null, 2), 'utf-8');

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

          // 2. 获取反馈历史端点: GET /api/__agent_feedback/list
          if (req.method === 'GET' && urlPath === '/api/__agent_feedback/list') {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            if (fs.existsSync(queueFile)) {
              try {
                const content = fs.readFileSync(queueFile, 'utf-8');
                JSON.parse(content); // 验证 JSON 格式有效性
                res.end(content);
              } catch {
                res.end(JSON.stringify([]));
              }
            } else {
              res.end(JSON.stringify([]));
            }
            return;
          }

          // 3. 静态服务截图文件: GET /api/__agent_feedback/screenshots/<filename>
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
      if (id === '/@agent-feedback/client' || id === '@agent-feedback/client') {
        return '\0agent-feedback-client-virtual';
      }
    },

    load(id: string) {
      if (id === '\0agent-feedback-client-virtual') {
        // 输出虚拟客户端代码，驱动 Shadow DOM 自定义元素注册与挂载
        return `
import '@agent-feedback/client';
console.log('[Agent Feedback Bridge] In-App nervous system initialized.');
        `.trim();
      }
    }
  };
}

export default agentFeedback;
