#!/usr/bin/env node

/**
 * @agent-feedback/sentinel CLI
 * Silent Watcher, Pluggable Adapters, and CLI Status Feedback Utility
 */

import {
  startSentinel,
  startMcpServer,
  updateFeedbackStatus,
  insertNotice
} from '../dist/index.js';

const rawArgs = process.argv.slice(2);

function printHelp() {
  console.log(`
@lylyuanliang/agent-feedback-sentinel CLI - In-App Agent Feedback Bridge

用法:
  agent-feedback <command> [options]

命令:
  watch                           启动静默哨兵监听队列 (默认)
  mcp                             启动标准 Stdio MCP 服务器 (Cursor / Antigravity / Claude)
  update-status <id> <status> [reply]  更新指定反馈项的状态与回复
  notice <content>                向当天分片插入一条系统通知工单

选项:
  --dir <path>                    反馈数据持久化目录 (默认: .agent/feedback)
  --adapter <type>                唤醒适配器: antigravity | mcp | webhook (默认: antigravity)
  --debounce <seconds>            防抖聚合窗口时长秒数 (默认: 10)
  --poll <ms>                     轮询检测间隔毫秒数 (默认: 2000)
  --webhook-cmd <command>         Webhook 适配器触发的外部 Shell 命令
  --webhook-url <url>             Webhook 适配器触发的 HTTP POST 端点
  --once                          处理完第一批反馈即退出 (默认开启)
  --no-once, --daemon             持续守护监听模式 (处理完一批后不退出，继续等待下一批)
  -h, --help                      显示帮助文档
  -v, --version                   显示版本号

示例:
  agent-feedback watch --debounce 10 --adapter antigravity
  agent-feedback update-status 1001 completed "已完成修复并在当前分支验证通过"
  agent-feedback mcp --dir .agent/feedback
`);
}

function parseCliArgs(args) {
  const options = {
    dir: '.agent/feedback',
    adapter: 'antigravity',
    debounce: 10,
    poll: 2000,
    webhookCmd: undefined,
    webhookUrl: undefined,
    once: undefined,
    help: false,
    version: false
  };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--no-once' || arg === '--daemon' || arg === '-d') {
      options.once = false;
    } else if (arg === '--once') {
      options.once = true;
    } else if (arg === '--dir' && i + 1 < args.length) {
      options.dir = args[++i];
    } else if (arg === '--adapter' && i + 1 < args.length) {
      options.adapter = args[++i];
    } else if (arg === '--debounce' && i + 1 < args.length) {
      options.debounce = parseFloat(args[++i]) || 10;
    } else if (arg === '--poll' && i + 1 < args.length) {
      options.poll = parseInt(args[++i], 10) || 2000;
    } else if (arg === '--webhook-cmd' && i + 1 < args.length) {
      options.webhookCmd = args[++i];
    } else if (arg === '--webhook-url' && i + 1 < args.length) {
      options.webhookUrl = args[++i];
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { options, positional };
}

async function main() {
  const { options, positional } = parseCliArgs(rawArgs);

  if (rawArgs.length === 0 || options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log('@lylyuanliang/agent-feedback-sentinel v1.0.0');
    process.exit(0);
  }

  const command = positional[0] || 'watch';

  // 1. MCP 服务器模式
  if (command === 'mcp') {
    await startMcpServer({ storageDir: options.dir });
    return;
  }

  // 2. 状态写回命令: update-status <id> <status> [reply]
  if (command === 'update-status') {
    const id = parseInt(positional[1], 10);
    const status = positional[2];
    const reply = positional.slice(3).join(' ') || undefined;

    if (isNaN(id) || !status) {
      console.error('[!] 错误: update-status 需要指定有效的 <id> 和 <status>');
      console.error('    示例: agent-feedback update-status 1001 completed "已修复"');
      process.exit(1);
    }

    const updated = updateFeedbackStatus(options.dir, id, status, reply);
    if (!updated) {
      console.error(`[!] 错误: 未在 [${options.dir}] 中找到 ID 为 ${id} 的反馈条目`);
      process.exit(1);
    }

    console.log(`[*] ✅ 成功更新反馈 [ID: ${id}] 状态为 '${status}'`);
    if (reply) {
      console.log(`    回复内容: ${reply}`);
    }
    console.log(JSON.stringify(updated, null, 2));
    process.exit(0);
  }

  // 3. 系统通知写入命令: notice <content>
  if (command === 'notice') {
    const content = positional.slice(1).join(' ');
    if (!content || !content.trim()) {
      console.error('[!] 错误: notice 命令需要指定通知内容');
      console.error('    示例: agent-feedback notice "AI Agent 修复通知：已重构高山拓扑视图"');
      process.exit(1);
    }

    const item = insertNotice(options.dir, content.trim());
    console.log(`[*] ✅ 成功插入系统通知工单 [ID: ${item.id}, 日期: ${item.date}]`);
    console.log(JSON.stringify(item, null, 2));
    process.exit(0);
  }

  // 4. 哨兵监听模式: watch (或直接作为缺省命令)
  if (command === 'watch') {
    await startSentinel({
      adapter: options.adapter,
      debounceSeconds: options.debounce,
      pollIntervalMs: options.poll,
      storageDir: options.dir,
      webhookCommand: options.webhookCmd,
      webhookUrl: options.webhookUrl,
      once: options.once
    });
    return;
  }

  console.error(`[!] 未知命令: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch(err => {
  console.error('[!] Sentinel 发生未捕获异常:', err);
  process.exit(1);
});
