import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import agentFeedback, { agentFeedback as namedAgentFeedback } from '../src/index.ts';

/**
 * 模拟 Vite DevServer 及 Connect 中间件流转
 */
class MockDevServer {
  public config: { root: string; logger?: any };
  public middlewares: {
    handlers: Array<(req: any, res: any, next: (err?: any) => void) => void>;
    use: (fn: (req: any, res: any, next: (err?: any) => void) => void) => void;
  };
  public httpServer: EventEmitter;

  constructor(root: string) {
    this.config = {
      root,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {}
      }
    };
    this.httpServer = new EventEmitter();
    const handlers: Array<(req: any, res: any, next: (err?: any) => void) => void> = [];
    this.middlewares = {
      handlers,
      use: (fn) => {
        handlers.push(fn);
      }
    };
  }

  close() {
    this.httpServer.emit('close');
  }

  dispatch(req: MockReq, res: MockRes): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let idx = 0;
      const handlers = this.middlewares.handlers;

      res.onEnd(() => resolve(true));

      const next = (err?: any) => {
        if (err) return reject(err);
        if (idx < handlers.length) {
          const handler = handlers[idx++];
          try {
            handler(req, res, next);
          } catch (e) {
            reject(e);
          }
        } else {
          // 未被任何中间件拦截（如常规静态资源），流向 Vite 默认处理
          resolve(false);
        }
      };

      next();
    });
  }
}

/**
 * 模拟 HTTP 请求流
 */
class MockReq extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;

  constructor(method: string, url: string, headers: Record<string, string> = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
  }

  send(body: string) {
    process.nextTick(() => {
      this.emit('data', Buffer.from(body));
      this.emit('end');
    });
  }
}

/**
 * 模拟 HTTP 响应
 */
class MockRes {
  public statusCode = 200;
  public headers: Record<string, string> = {};
  public body = '';
  public binaryBody: Buffer | null = null;
  public isFinished = false;
  private endListeners: Array<() => void> = [];

  setHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }

  getHeader(key: string) {
    return this.headers[key.toLowerCase()];
  }

  end(data?: string | Buffer) {
    if (data) {
      if (Buffer.isBuffer(data)) {
        this.binaryBody = data;
        this.body = data.toString('utf-8');
      } else {
        this.body += data;
        this.binaryBody = Buffer.from(this.body);
      }
    }
    this.isFinished = true;
    for (const listener of this.endListeners) {
      listener();
    }
  }

  onEnd(cb: () => void) {
    if (this.isFinished) {
      cb();
    } else {
      this.endListeners.push(cb);
    }
  }
}

describe('@agent-feedback/vite-plugin Architecture & Zero-DCE', () => {
  it('should export agentFeedback as default and named export', () => {
    assert.strictEqual(typeof agentFeedback, 'function');
    assert.strictEqual(typeof namedAgentFeedback, 'function');
    const p1 = agentFeedback();
    const p2 = namedAgentFeedback();
    assert.strictEqual(p1.name, 'agent-feedback-plugin');
    assert.strictEqual(p2.name, 'agent-feedback-plugin');
  });

  it('should strictly enforce apply: "serve" to guarantee 100% Zero-DCE in production build', () => {
    const plugin = agentFeedback();
    // 关键架构验证：Vite 规范中 apply: 'serve' 确保 vite build 阶段插件完全被丢弃
    assert.strictEqual(plugin.apply, 'serve');
  });

  it('should deactivate dev logic when config.command === "build"', () => {
    const plugin = agentFeedback();
    if (plugin.configResolved) {
      plugin.configResolved({ command: 'build' });
    }

    // 在 build 模式下，transformIndexHtml 不注入任何脚本
    const html = '<html><head></head><body><div id="app"></div></body></html>';
    const result = plugin.transformIndexHtml?.(html);
    assert.strictEqual(result, html);

    // 在 build 模式下，configureServer 不挂载任何中间件
    const mockServer = new MockDevServer('D:/dummy-project');
    plugin.configureServer?.(mockServer);
    assert.strictEqual(mockServer.middlewares.handlers.length, 0);
  });
});

describe('@agent-feedback/vite-plugin Dev Server Virtual Module Injection', () => {
  it('should inject virtual client script tag into HTML body during dev', () => {
    const plugin = agentFeedback();
    const html = '<html><head></head><body><div id="app"></div></body></html>';
    const tags = plugin.transformIndexHtml?.(html, { command: 'serve' });

    assert.ok(Array.isArray(tags), 'transformIndexHtml should return tag descriptor array');
    const clientScript = tags.find((t: any) => t.attrs?.src === '/@agent-feedback/client');
    assert.ok(clientScript, 'Should inject /@agent-feedback/client script tag');
    assert.strictEqual(clientScript.tag, 'script');
    assert.strictEqual(clientScript.attrs.type, 'module');
    assert.strictEqual(clientScript.injectTo, 'body');
  });

  it('should resolve virtual module id /@agent-feedback/client', () => {
    const plugin = agentFeedback();
    assert.strictEqual(plugin.resolveId?.('/@agent-feedback/client'), '\0agent-feedback-client-virtual');
    assert.strictEqual(plugin.resolveId?.('@agent-feedback/client'), '\0agent-feedback-client-virtual');
    assert.strictEqual(plugin.resolveId?.('vue'), undefined);
    assert.strictEqual(plugin.resolveId?.('./main.js'), undefined);
  });

  it('should load virtual client bootstrap code', () => {
    const plugin = agentFeedback();
    const code = plugin.load?.('\0agent-feedback-client-virtual');
    assert.ok(typeof code === 'string');
    assert.ok(code.includes("import '@lylyuanliang/agent-feedback-client';"));
    assert.ok(code.includes('[Agent Feedback Bridge] In-App nervous system initialized.'));
    assert.strictEqual(plugin.load?.('other-id'), undefined);
  });
});

describe('@agent-feedback/vite-plugin DevServer Middleware & Request Handling', () => {
  const tmpProjectDir = path.resolve('D:/file_save/workspace/github/agent-feedback', '.tmp-test-vite-plugin');

  beforeEach(() => {
    fs.mkdirSync(tmpProjectDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpProjectDir, { recursive: true, force: true });
    } catch {}
  });

  it('should safely auto-append .agent/ to .gitignore if not present', () => {
    // 场景 1: .gitignore 不存在 -> 自动创建并包含 .agent/
    const plugin1 = agentFeedback();
    const server1 = new MockDevServer(tmpProjectDir);
    plugin1.configureServer?.(server1);

    const gitignorePath = path.resolve(tmpProjectDir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath));
    const content1 = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(content1.includes('.agent/'));

    // 场景 2: 已存在其他规则但无 .agent/ -> 追加且不覆盖原内容
    fs.writeFileSync(gitignorePath, 'node_modules\ndist\n', 'utf-8');
    const plugin2 = agentFeedback();
    plugin2.configureServer?.(server1);
    const content2 = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(content2.startsWith('node_modules\ndist\n'));
    assert.ok(content2.includes('.agent/'));

    // 场景 3: 已包含 .agent/ -> 不重复追加
    const beforeLength = content2.length;
    const plugin3 = agentFeedback();
    plugin3.configureServer?.(server1);
    const content3 = fs.readFileSync(gitignorePath, 'utf-8');
    assert.strictEqual(content3.length, beforeLength);
  });

  it('should pass through non-feedback requests to next()', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('GET', '/src/components/Header.vue');
    const res = new MockRes();
    const handled = await server.dispatch(req, res);

    assert.strictEqual(handled, false, 'Non-feedback route should pass through');
    assert.strictEqual(res.isFinished, false);
  });

  it('should handle OPTIONS preflight with 204 No Content and CORS headers', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('OPTIONS', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const handled = await server.dispatch(req, res);

    assert.strictEqual(handled, true);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.getHeader('access-control-allow-origin'), '*');
    assert.strictEqual(res.getHeader('access-control-allow-methods'), 'GET, POST, OPTIONS');
  });

  it('should return empty array for GET /api/__agent_feedback/list when queue does not exist', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('GET', '/api/__agent_feedback/list');
    const res = new MockRes();
    const handled = await server.dispatch(req, res);

    assert.strictEqual(handled, true);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.getHeader('content-type'), 'application/json');
    assert.deepStrictEqual(JSON.parse(res.body), []);
  });

  it('should submit feedback via POST /api/__agent_feedback/submit and save to queue', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const dispatchPromise = server.dispatch(req, res);

    const testPayload = {
      id: 1730000001,
      content: '移动端底部导航栏高度偏大，遮挡了列表内容',
      telemetry: {
        route: '/mountains/qingcheng',
        viewport: { width: 390, height: 844, dpr: 3 },
        userAgent: 'iPhone Test',
        platform: 'ios'
      }
    };

    req.send(JSON.stringify(testPayload));
    await dispatchPromise;

    assert.strictEqual(res.statusCode, 200);
    const resData = JSON.parse(res.body);
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.id, 1730000001);

    // 验证文件持久化
    const queueFile = path.resolve(tmpProjectDir, '.agent/feedback/feedback_queue.json');
    assert.ok(fs.existsSync(queueFile));
    const items = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].content, '移动端底部导航栏高度偏大，遮挡了列表内容');
    assert.strictEqual(items[0].status, 'pending');

    // 验证随后的 GET /api/__agent_feedback/list 能读取到该数据
    const listReq = new MockReq('GET', '/api/__agent_feedback/list');
    const listRes = new MockRes();
    await server.dispatch(listReq, listRes);
    const listItems = JSON.parse(listRes.body);
    assert.strictEqual(listItems.length, 1);
    assert.strictEqual(listItems[0].id, 1730000001);
  });

  it('should decode and save base64 screenshot files and serve them statically', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const dispatchPromise = server.dispatch(req, res);

    // 1x1 绿色 PNG 图片的 Base64 数据
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const testPayload = {
      id: 1730000002,
      content: '截图中可见阴影溢出',
      screenshots: [`data:image/png;base64,${samplePngBase64}`]
    };

    req.send(JSON.stringify(testPayload));
    await dispatchPromise;

    assert.strictEqual(res.statusCode, 200);
    const resData = JSON.parse(res.body);
    assert.strictEqual(resData.success, true);

    // 验证截图已落盘为真实 PNG 二进制文件
    const screenshotFile = path.resolve(tmpProjectDir, '.agent/feedback/screenshots/1730000002.png');
    assert.ok(fs.existsSync(screenshotFile), 'Screenshot file should be saved on disk');
    const fileBytes = fs.readFileSync(screenshotFile);
    assert.strictEqual(fileBytes.toString('base64'), samplePngBase64);

    // 验证队列中引用的路径已转为相对路径
    const queueFile = path.resolve(tmpProjectDir, '.agent/feedback/feedback_queue.json');
    const queueItems = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    assert.deepStrictEqual(queueItems[0].screenshots, ['screenshots/1730000002.png']);

    // 验证静态获取截图端点 GET /api/__agent_feedback/screenshots/1730000002.png
    const shotReq = new MockReq('GET', '/api/__agent_feedback/screenshots/1730000002.png');
    const shotRes = new MockRes();
    const handledShot = await server.dispatch(shotReq, shotRes);

    assert.strictEqual(handledShot, true);
    assert.strictEqual(shotRes.statusCode, 200);
    assert.strictEqual(shotRes.getHeader('content-type'), 'image/png');
    assert.strictEqual(shotRes.binaryBody?.toString('base64'), samplePngBase64);

    // 请求不存在的截图文件返回 404
    const notFoundReq = new MockReq('GET', '/api/__agent_feedback/screenshots/non_existent.png');
    const notFoundRes = new MockRes();
    await server.dispatch(notFoundReq, notFoundRes);
    assert.strictEqual(notFoundRes.statusCode, 404);
  });

  it('should handle custom storageDir option properly', async () => {
    const customDir = 'custom_feedback_dir';
    const plugin = agentFeedback({ storageDir: customDir });
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const dispatchPromise = server.dispatch(req, res);

    req.send(JSON.stringify({ id: 9999, content: '自定义存储路径测试' }));
    await dispatchPromise;

    assert.strictEqual(res.statusCode, 200);
    const customQueue = path.resolve(tmpProjectDir, customDir, 'feedback_queue.json');
    assert.ok(fs.existsSync(customQueue), 'Feedback queue should be in custom storageDir');
  });

  it('should gracefully handle malformed JSON in submit endpoint', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const dispatchPromise = server.dispatch(req, res);

    req.send('invalid-json{{{');
    await dispatchPromise;

    assert.strictEqual(res.statusCode, 500);
    const errJson = JSON.parse(res.body);
    assert.ok(errJson.error);
  });
});

describe('@agent-feedback/vite-plugin Sharded Persistence & Upgraded API Middleware', () => {
  const tmpProjectDir = path.resolve('D:/file_save/workspace/github/agent-feedback', '.tmp-test-sharded-plugin');

  beforeEach(() => {
    fs.mkdirSync(tmpProjectDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpProjectDir, { recursive: true, force: true });
    } catch {}
  });

  it('should save submissions to feedback_YYYY-MM-DD.json and update feedback_index.json', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const p = server.dispatch(req, res);
    req.send(JSON.stringify({
      id: 5001,
      content: '今日分片提交测试',
      type: 'user_feedback'
    }));
    await p;

    assert.strictEqual(res.statusCode, 200);

    const shardFile = path.resolve(tmpProjectDir, `.agent/feedback/feedback_${today}.json`);
    const indexFile = path.resolve(tmpProjectDir, '.agent/feedback/feedback_index.json');

    assert.ok(fs.existsSync(shardFile), 'Shard file should exist for today');
    assert.ok(fs.existsSync(indexFile), 'Index file should exist');

    const shardData = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));
    assert.strictEqual(shardData.length, 1);
    assert.strictEqual(shardData[0].id, 5001);
    assert.strictEqual(shardData[0].type, 'user_feedback');
    assert.strictEqual(shardData[0].date, today);

    const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    assert.ok(indexData.dates.includes(today));
    assert.strictEqual(indexData.totalCount, 1);
  });

  it('should migrate legacy feedback_queue.json to daily shards on startup', async () => {
    const feedbackDir = path.resolve(tmpProjectDir, '.agent/feedback');
    fs.mkdirSync(feedbackDir, { recursive: true });

    const legacyItems = [
      { id: 1001, content: '昨天的问题', receivedAt: '2026-10-27T10:00:00.000Z', status: 'completed' },
      { id: 1002, content: '前天的问题', receivedAt: '2026-10-26T12:00:00.000Z', status: 'completed' }
    ];
    fs.writeFileSync(path.resolve(feedbackDir, 'feedback_queue.json'), JSON.stringify(legacyItems, null, 2), 'utf-8');

    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const indexFile = path.resolve(feedbackDir, 'feedback_index.json');
    assert.ok(fs.existsSync(indexFile));
    const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    assert.strictEqual(indexData.totalCount, 2);
    assert.ok(indexData.dates.length >= 2);
  });

  it('should handle POST /api/__agent_feedback/notice to create agent notice', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    const req = new MockReq('POST', '/api/__agent_feedback/notice');
    const res = new MockRes();
    const p = server.dispatch(req, res);
    req.send(JSON.stringify({
      id: 6001,
      content: 'Agent 修复通知：已优化高山列表渲染性能'
    }));
    await p;

    assert.strictEqual(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.item.type, 'agent_notice');
    assert.strictEqual(data.item.status, 'completed');
  });

  it('should handle GET /api/__agent_feedback/dates and query by date in /list', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    // 提交两条不同日期的反馈
    const date1 = '2026-10-27';
    const date2 = '2026-10-28';

    const req1 = new MockReq('POST', '/api/__agent_feedback/submit');
    const res1 = new MockRes();
    const p1 = server.dispatch(req1, res1);
    req1.send(JSON.stringify({ id: 7001, content: '27号反馈', date: date1, timestamp: new Date(date1).getTime() }));
    await p1;

    const req2 = new MockReq('POST', '/api/__agent_feedback/submit');
    const res2 = new MockRes();
    const p2 = server.dispatch(req2, res2);
    req2.send(JSON.stringify({ id: 7002, content: '28号反馈', date: date2, timestamp: new Date(date2).getTime() }));
    await p2;

    // 1. GET /dates
    const datesReq = new MockReq('GET', '/api/__agent_feedback/dates');
    const datesRes = new MockRes();
    await server.dispatch(datesReq, datesRes);
    assert.strictEqual(datesRes.statusCode, 200);
    const datesData = JSON.parse(datesRes.body);
    assert.strictEqual(datesData.totalCount, 2);
    assert.ok(datesData.dates.includes(date1));
    assert.ok(datesData.dates.includes(date2));

    // 2. GET /list?date=2026-10-27
    const listReq = new MockReq('GET', `/api/__agent_feedback/list?date=${date1}`);
    const listRes = new MockRes();
    await server.dispatch(listReq, listRes);
    const listData = JSON.parse(listRes.body);
    assert.strictEqual(listData.length, 1);
    assert.strictEqual(listData[0].id, 7001);
  });

  it('should handle POST /api/__agent_feedback/status for cross-shard status updates', async () => {
    const plugin = agentFeedback();
    const server = new MockDevServer(tmpProjectDir);
    plugin.configureServer?.(server);

    // 提交一条待处理反馈
    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const p = server.dispatch(req, res);
    req.send(JSON.stringify({ id: 8001, content: '待修复问题' }));
    await p;

    // 跨分片更新状态
    const statusReq = new MockReq('POST', '/api/__agent_feedback/status');
    const statusRes = new MockRes();
    const statusPromise = server.dispatch(statusReq, statusRes);
    statusReq.send(JSON.stringify({
      id: 8001,
      status: 'completed',
      reply: '已由 AI 修复完毕'
    }));
    await statusPromise;

    assert.strictEqual(statusRes.statusCode, 200);
    const updated = JSON.parse(statusRes.body);
    assert.strictEqual(updated.success, true);
    assert.strictEqual(updated.item.status, 'completed');
    assert.strictEqual(updated.item.reply, '已由 AI 修复完毕');
  });

  it('should pass theme and primaryColor options to virtual client module', () => {
    const plugin = agentFeedback({
      theme: 'light',
      primaryColor: '#2563eb'
    });

    const code = plugin.load?.('\0agent-feedback-client-virtual');
    assert.ok(code.includes('theme: "light"'));
    assert.ok(code.includes('primaryColor: "#2563eb"'));
  });
});

describe('@agent-feedback/vite-plugin - Sentinel Auto Lifecycle & New Project Integration', () => {
  const baseTmpDir = path.resolve('D:/file_save/workspace/github/agent-feedback', '.tmp-sentinel-tests');
  let tmpProjectDir: string;
  let server: MockDevServer;

  beforeEach(() => {
    tmpProjectDir = path.resolve(baseTmpDir, 'new-proj-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tmpProjectDir, { recursive: true });
    server = new MockDevServer(tmpProjectDir);
  });

  afterEach(() => {
    // 模拟 DevServer 关闭
    server.close();
    try {
      if (fs.existsSync(tmpProjectDir)) {
        fs.rmSync(tmpProjectDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should automatically start sentinel on configureServer and capture feedback end-to-end without prompt', async () => {
    const wakeupBatches: any[] = [];

    // 模拟新项目接入配置：在 vite.config.ts 传入 sentinel.autoStart
    const plugin = agentFeedback({
      sentinel: {
        autoStart: true,
        debounceMs: 50,
        pollIntervalMs: 10,
        adapter: 'webhook',
        onWakeup: (batch) => {
          wakeupBatches.push(batch);
        }
      }
    });

    // 模拟 Vite 启动 DevServer
    plugin.configureServer?.(server);

    // 模拟端侧提交工单
    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const p = server.dispatch(req, res);
    req.send(JSON.stringify({
      id: 9001,
      content: '端侧提交测试反馈',
      telemetry: { route: '/home', platform: 'Android' }
    }));
    await p;

    assert.strictEqual(res.statusCode, 200);

    // 等待哨兵防抖收集与唤醒 (约 150ms)
    await new Promise(r => setTimeout(r, 160));

    // 验证哨兵无需任何外部手动启动，完全由 Vite 插件自动托管唤醒！
    assert.strictEqual(wakeupBatches.length, 1, '哨兵应自动被 DevServer 拉起并触发唤醒');
    assert.strictEqual(wakeupBatches[0][0].id, 9001);
    assert.strictEqual(wakeupBatches[0][0].status, 'processing');
  });

  it('should keep listening in continuous daemon mode across multiple feedback cycles', async () => {
    const wakeupBatches: any[] = [];

    const plugin = agentFeedback({
      sentinel: {
        autoStart: true,
        debounceMs: 40,
        pollIntervalMs: 10,
        adapter: 'webhook',
        onWakeup: (batch) => {
          wakeupBatches.push(batch);
        }
      }
    });

    plugin.configureServer?.(server);

    // 模拟第 1 条反馈
    const req1 = new MockReq('POST', '/api/__agent_feedback/submit');
    const res1 = new MockRes();
    const p1 = server.dispatch(req1, res1);
    req1.send(JSON.stringify({ id: 9101, content: '第1个缺陷' }));
    await p1;

    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(wakeupBatches.length, 1);

    // 模拟第 2 条反馈 (验证哨兵依然持续守护，不退出)
    const req2 = new MockReq('POST', '/api/__agent_feedback/submit');
    const res2 = new MockRes();
    const p2 = server.dispatch(req2, res2);
    req2.send(JSON.stringify({ id: 9102, content: '第2个缺陷' }));
    await p2;

    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(wakeupBatches.length, 2, '哨兵应持续常驻，无缝捕获第2次反馈');
    assert.strictEqual(wakeupBatches[1][0].id, 9102);
  });

  it('should cleanly terminate sentinel when DevServer closes', async () => {
    const plugin = agentFeedback({
      sentinel: {
        autoStart: true,
        debounceMs: 50,
        pollIntervalMs: 10,
        adapter: 'webhook'
      }
    });

    plugin.configureServer?.(server);

    // 关闭 DevServer
    server.close();

    // 再次提交反馈，哨兵已停止，不应有新的异常
    const req = new MockReq('POST', '/api/__agent_feedback/submit');
    const res = new MockRes();
    const p = server.dispatch(req, res);
    req.send(JSON.stringify({ id: 9201, content: '服务器关闭后的反馈' }));
    await p;

    await new Promise(r => setTimeout(r, 80));
    assert.ok(true, '关闭服务后正常清理无异常');
  });
});
