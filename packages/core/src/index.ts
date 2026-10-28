/**
 * @agent-feedback/core
 * In-App Agent Feedback Bridge - Core Data Protocol and Types
 */

/**
 * 反馈流转状态
 */
export type FeedbackStatus = 'pending' | 'processing' | 'completed' | 'rejected' | 'ignored';

/**
 * 反馈工单类型：用户反馈或 Agent 主动通知
 */
export type FeedbackType = 'user_feedback' | 'agent_notice';

/**
 * 主题类型定义
 */
export type FeedbackTheme = 'dark' | 'light' | 'auto';

/**
 * 运行平台标识
 */
export type PlatformType = 'android' | 'ios' | 'web' | 'desktop';

/**
 * 视口物理与逻辑分辨率快照
 */
export interface ViewportSnapshot {
  width: number;
  height: number;
  dpr: number;
}

/**
 * 控制台运行时日志捕获条目
 */
export interface ConsoleLogEntry {
  type: 'log' | 'warn' | 'error';
  message: string;
  timestamp: number;
  stack?: string;
}

/**
 * 客户端环境与遥测快照
 */
export interface TelemetrySnapshot {
  route: string;
  viewport: ViewportSnapshot;
  userAgent: string;
  platform: PlatformType;
  appVersion?: string;
  network?: {
    online: boolean;
    effectiveType?: string;
  };
}

/**
 * 应用内反馈数据协议主实体
 */
export interface InAppFeedback {
  id: number;
  type?: FeedbackType;
  date?: string;
  timestamp: number;
  receivedAt: string;
  content: string;
  status: FeedbackStatus;
  reply?: string;
  updatedAt?: string;
  telemetry: TelemetrySnapshot;
  screenshots?: string[];
  consoleLogs?: ConsoleLogEntry[];
}

/**
 * 按天分片持久化索引元数据
 */
export interface FeedbackDateIndex {
  dates: string[]; // 按降序排列，如 ['2026-10-28', '2026-10-27']
  totalCount: number;
  updatedAt: string;
}

/**
 * 扩展槽执行上下文
 */
export interface ExtensionContext {
  closeModal: () => void;
  openTab: (tabId: string) => void;
  theme: string;
}

/**
 * 模态框自定义扩展 Tab 定义
 */
export interface FeedbackExtensionTab {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
  render: (container: HTMLElement, context: ExtensionContext) => void | (() => void);
}

/**
 * 启发式安全分诊结果
 */
export interface SecurityTriageResult {
  isSafe: boolean;
  reason?: string;
}

/**
 * 内部危险模式定义
 */
interface SecurityThreatPattern {
  name: string;
  pattern: RegExp;
}

/**
 * 启发式 Prompt 注入与破坏性系统指令规则库 (第 1 道安全防线)
 */
const SECURITY_THREAT_PATTERNS: SecurityThreatPattern[] = [
  // 1. Prompt 注入：指令劫持与前置覆盖
  {
    name: 'Prompt injection (instruction override)',
    pattern: /(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:(?:previous|prior|existing|system|above)\s+)?(?:instructions|rules|prompts|directions|guidelines)/i
  },
  {
    name: 'Prompt injection (Chinese instruction override)',
    pattern: /(?:忽略|无视|丢弃|覆盖)[^。！？\n]{0,20}(?:指令|规则|提示词|系统预设|要求|设定)/i
  },

  // 2. Prompt 注入：系统提示词探测与窥视
  {
    name: 'Prompt injection (system prompt exfiltration)',
    pattern: /(?:print|reveal|show|display|output|echo|leak|tell)\s+(?:me\s+)?(?:the\s+)?(?:system\s+prompt|initial\s+prompt|developer\s+prompt|hidden\s+instructions|core\s+rules)/i
  },
  {
    name: 'Prompt injection (system prompt keyword)',
    pattern: /\bsystem\s+prompt\b/i
  },
  {
    name: 'Prompt injection (Chinese prompt exfiltration)',
    pattern: /(?:打印|显示|输出|泄露|查看|告诉我?)[^。！？\n]{0,20}(?:提示词|预设指令|初始设定|核心规则|system\s*prompt)/i
  },

  // 3. 破坏性文件与目录删除命令
  {
    name: 'Destructive command (rm -rf / recursive deletion)',
    pattern: /\b(?:rm|del|rmdir)\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*|\/s|\/q|-rf|-fr)\b/i
  },
  {
    name: 'Destructive command (delete all files)',
    pattern: /(?:delete|erase|remove|destroy)\s+all\s+files/i
  },
  {
    name: 'Destructive command (Chinese delete all files)',
    pattern: /(?:删除|清空|销毁)(?:所有|全部)(?:文件|数据|目录|磁盘)/i
  },

  // 4. 破坏性磁盘格式化与镜像覆写
  {
    name: 'Destructive command (disk format / dd wipe)',
    pattern: /\b(?:format\s+[a-z]:|mkfs(?:\.[a-z0-9]+)?\s+|dd\s+if=)/i
  },

  // 5. 破坏性数据库清空与删除
  {
    name: 'Destructive command (drop database / table)',
    pattern: /\bdrop\s+(?:database|table|schema)\b/i
  },
  {
    name: 'Destructive command (truncate table)',
    pattern: /\btruncate\s+(?:table\s+)?[a-z0-9_.]+/i
  },

  // 6. 敏感文件与凭据窃取 (cat .env / passwd)
  {
    name: 'Secret exfiltration (cat .env / passwd / credentials)',
    pattern: /\b(?:cat|type|get-content|head|tail)\s+.*(?:\.env|passwd|shadow|credentials|\.ssh\/id_rsa)/i
  },

  // 7. 特权提权与危险网络管道执行
  {
    name: 'Privileged destructive command (sudo rm)',
    pattern: /\bsudo\s+(?:rm|chmod\s+-R\s+777|chown)\b/i
  },
  {
    name: 'Dangerous remote pipe execution',
    pattern: /(?:curl|wget)\s+[^|\n]+(?:\|\s*(?:bash|sh|zsh|powershell|pwsh))/i
  }
];

/**
 * 启发式 Prompt 注入与破坏性指令检测 (第 1 道安全防线)
 * @param content 用户提交的反馈文本
 * @returns 安全分诊结果及原因
 */
export function sanitizeFeedbackContent(content: string): SecurityTriageResult {
  if (content === null || content === undefined || typeof content !== 'string') {
    return { isSafe: false, reason: 'Feedback content is empty or invalid.' };
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { isSafe: false, reason: 'Feedback content is empty or invalid.' };
  }

  for (const threat of SECURITY_THREAT_PATTERNS) {
    if (threat.pattern.test(trimmed)) {
      return {
        isSafe: false,
        reason: `Triggered security policy: ${threat.name} (prompt injection or destructive command pattern: ${threat.pattern.toString()})`
      };
    }
  }

  return { isSafe: true };
}
