# 🔌 Agent Feedback 扩展槽与插拔式工作台指南 (Extension Tabs Cookbook)

在移动端测试、真机联调与混合应用（Hybrid/Capacitor）研发中，开发者常常需要安装多种专属调试工具（例如：开发机本地包直连安装、网络与域名诊断、离线缓存一键重置、屏幕常亮保活等）。如果每个工具都在手机屏幕上挂一个独立的悬浮球，**狭小的手机屏幕将被各种浮动按钮占满，严重遮挡业务 UI 与手势操作**。

`@lylyuanliang/agent-feedback` 提出了 **单一悬浮胶囊，可插拔开发者工作台（Pluggable Developer Hub）** 的设计哲学：
- 屏幕上仅需保留一个优雅的微型胶囊；
- 点击展开后，不仅具备原生的端侧反馈与 AI 自愈进度闭环，更能作为开放的插槽容器，随心挂载或拔除专属业务工具！

---

## 目录

1. [一、 扩展槽机制与可插拔架构 (Pluggable Architecture)](#一-扩展槽机制与可插拔架构-pluggable-architecture)
2. [二、 核心 API 与接口契约](#二-核心-api-与接口契约)
3. [三、 目前已有插槽清单与实现代码范例 (The 4 Available Slots & Code Recipes)](#三-目前已有插槽清单与实现代码范例-the-4-available-slots--code-recipes)
   - [插槽 1：📝 新建全息反馈 (`submit`)](#插槽-1-新建全息反馈-submit)
   - [插槽 2：📜 历史与自愈进度 (`history`)](#插槽-2-历史与自愈进度-history)
   - [插槽 3：⚙️ 联调设置与安全门禁 (`settings`)](#插槽-3-联调设置与安全门禁-settings)
   - [插槽 4：📦 本地包更新 (`local-pkg`)](#插槽-4-本地包更新-local-pkg)

---

## 一、 扩展槽机制与可插拔架构 (Pluggable Architecture)

`@lylyuanliang/agent-feedback-client` 提供了灵活的 **对称可插拔设计（Plug-in & Unplug）**：

```
┌────────────────────────────────────────────────────────────────────────┐
│  Agent Feedback 悬浮模态框 (Modal)                                     │
├─────────────┬─────────────┬───────────────────────────┬────────────────┤
│  📝 提工单   │  📜 历史    │  📦 [扩展插槽: 本地包更新]  │  ⚙️ 联调设置    │ ◄── 自由插拔
├─────────────┴─────────────┴───────────────────────────┴────────────────┤
│                                                                        │
│   [ 隔离沙箱容器: <div class="af-tab-panel af-tab-panel-ext"> ]          │
│   • 独立 Shadow DOM 渲染空间，杜绝与宿主全局 CSS 样式相互污染           │
│   • 切换即挂载 (render)，切离即回收 (cleanup 回调执行)                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. “插 (Plug-in)”：声明即挂载与热替换
宿主应用调用 `registerExtensionTab(tab)` 即可随时将扩展插槽注册到悬浮工作台中。如果注册了相同 `id` 的插槽，容器会自动进行**安全热替换**并触发局部刷新，无需重新刷新整个页面。

### 2. “拔 (Unplug)”：双层销毁与资源回收保障
- **页签切换时的瞬态拔除（Cleanup on Tab Switch）**：
  当用户从某个扩展插槽切换到其他 Tab（或关闭悬浮弹窗）时，容器会**立即触发执行该插槽 `render` 挂载函数所返回的 `cleanup` 回调**。宿主可在此释放定时器、解绑 DOM 监听、调用 Vue 的 `app.unmount()` 或 React 的 `root.unmount()`，杜绝后台空转与内存泄漏；
- **运行时的动态注销（Unregister on Demand）**：
  若业务处于特定阶段（例如用户退出了调试人员身份，或完成了特定联调流程），可通过 `unregisterExtensionTab(id)` 从工作台中**彻底注销并拔除该页签**。

---

## 二、 核心 API 与接口契约

### 1. `FeedbackExtensionTab` 插槽定义
```typescript
export interface FeedbackExtensionTab {
  /** 全局唯一标识符（不可重复，用于内部 Tab 激活路由与状态切换） */
  id: string;

  /** Tab 导航按钮上显示的文本标签（支持 Emoji） */
  label: string;

  /** 可选的前缀图标（支持单个 Emoji 如 '📦'、'🩺' 或 SVG 字符串） */
  icon?: string;

  /** 可选的角标提示（如更新版本号 'v1.5' 或未读数 3） */
  badge?: string | number;

  /**
   * 挂载渲染函数
   * @param container 插槽面板的独立 DOM 容器（位于 Shadow DOM 内部独立的隔离沙箱中）
   * @param context 扩展槽执行上下文
   * @returns 可选的清理函数（Tab 切换离开或工作台卸载时自动执行）
   */
  render: (container: HTMLElement, context: ExtensionContext) => void | (() => void);
}
```

### 2. `ExtensionContext` 上下文能力
注入到每一个插槽中的 `context` 对象提供了强大的平台级联动能力：
- `context.closeModal()`：程序化折叠关闭悬浮面板；
- `context.openTab(tabId)`：程序化跳转激活任意插槽（如 `'submit'`、`'history'`、`'settings'` 或其他扩展插槽）；
- `context.theme`：感知当前工作台色彩模式（`'dark'` 或 `'light'`）。

### 3. 插拔管理方法
```typescript
import {
  registerExtensionTab,
  unregisterExtensionTab,
  getRegisteredExtensionTabs
} from '@lylyuanliang/agent-feedback-client';

// 1. 注册插槽
registerExtensionTab(myTab);

// 2. 查看当前已注册插槽清单
const activeTabs = getRegisteredExtensionTabs();

// 3. 注销拔除插槽
unregisterExtensionTab('my-tab-id');
```

---

## 三、 目前已有插槽清单与实现代码范例 (The 4 Available Slots & Code Recipes)

工作台中目前已经沉淀并支持了 **4 个核心插槽**：

```
① 📝 新建反馈 (submit) ──┐
② 📜 历史与进度 (history) ├─► 统一整合进单一悬浮胶囊工作台
③ ⚙️ 联调设置 (settings) ─┤
④ 📦 本地包更新 (local-pkg)┘
```

下面逐一介绍其功能定位与对应的完整实现代码范例：

---

### 插槽 1：📝 新建全息反馈 (`submit`)

- **功能定位**：内置核心插槽。专为端侧测试人员打造的结构化缺陷提单面板。
- **核心能力**：
  - W3C 标准图片与原生视频录屏附件上传；
  - 自动捕获设备像素比、视口宽高、操作系统平台等全息快照；
  - 自动装配控制台最近 30 条运行日志（Ring Buffer 循环缓冲）；
  - 智能 Markdown 安全排版，规避换行软折叠与链接定义吞噬。

#### 💻 对应实现与配置代码范例

在宿主客户端入口（如 `main.ts` 或 `setupAgentFeedback.ts`）中，调用官方标准 `initAgentFeedback` 即可装配与定制该插槽：

```typescript
import { initAgentFeedback, openFeedbackModal } from '@lylyuanliang/agent-feedback-client';

// 1. 初始化反馈插槽基础配置
initAgentFeedback({
  appName: '智能探索 App',
  primaryColor: '#4edea3', // 定制品牌主色调
  hostChannel: {
    name: 'GitHub Issues',
    url: 'https://github.com/my-org/my-app/issues',
    description: '未持有内测密钥时，欢迎前往 GitHub 社区提交建议'
  }
});

// 2. 业务代码中支持程序化一键呼出新建反馈插槽
export function triggerFeedback() {
  openFeedbackModal('submit');
}
```

---

### 插槽 2：📜 历史与自愈进度 (`history`)

- **功能定位**：内置核心插槽。打破传统反馈“只报不修”的黑盒，实现端侧可见的双向自愈闭环。
- **核心能力**：
  - 日级分片工单流转时间轴（待排查 ➔ 分析中 ➔ 已自愈/已驳回）；
  - 实时渲染 AI Coding Agent 写入的 Markdown 修复分析与自愈卡片；
  - 5 秒轻量静默轮询机制（仅在打开该 Tab 时激活，离开即停止）；
  - 接收系统公告与广播通知。

#### 💻 对应实现与配置代码范例

```typescript
import { openFeedbackModal } from '@lylyuanliang/agent-feedback-client';

// 1. 在个人中心或帮助页，一键呼出历史进度插槽
export function showFeedbackHistory() {
  openFeedbackModal('history');
}

// 2. 服务端 / CI / Agent 命令行主动向该插槽广播通知示例 (通过 Sentinel CLI):
// npx agent-feedback notice "🚀 v1.5.1 补丁已发布，欢迎体验！" --dir scratch/feedback
```

---

### 插槽 3：⚙️ 联调设置与安全门禁 (`settings`)

- **功能定位**：内置可插拔插槽。用于解决移动端真机访问电脑开发机 DevServer 的网络拓扑与密钥认证问题。
- **核心能力**：
  - **动态服务基地址**：端侧随时切换 API 接口地址（局域网 IP / cpolar / ngrok 穿透域名），无需重新打包；
  - **动态密钥配对**：输入开发机本地生成的配对密钥，经 SHA-256 哈希比对后持久化至 `localStorage`（`af_access_key`），解锁受限工单提交与历史日志；
  - **可插拔显隐策略**：
    - 在纯静态只读生产构建中**彻底自动拔除（0 DOM、0 痕迹）**；
    - 配置了 `accessControl`、`apiBase` 或声明 `showSettings: true` 时**即插即用**；
    - 亦可通过属性显式强制拔除。

#### 💻 对应实现与配置代码范例

**① 宿主构建配置 (`vite.config.ts`)**：
```typescript
import { defineConfig } from 'vite';
import { agentFeedback } from '@lylyuanliang/agent-feedback-vite-plugin';

export default defineConfig({
  plugins: [
    agentFeedback({
      storageDir: 'scratch/feedback',
      enableInBuild: true, // 放行测试构建注入，保留设置面板
      accessControl: {
        enabled: true     // 开启安全门禁，自动生成 scratch/.agent-feedback-secret
      }
    })
  ]
});
```

**② 客户端初始化配置 (`main.ts`)**：
```typescript
import { initAgentFeedback, openFeedbackModal } from '@lylyuanliang/agent-feedback-client';

initAgentFeedback({
  showSettings: true,                     // 👈 声明开启设置插槽
  apiBase: 'https://my-tunnel.cpolar.top', // 默认穿透地址
  accessControl: {
    enabled: true                         // 开启授权配对保护
  }
});

// 程序化直接跳转至联调设置页签
export function openSettingsTab() {
  openFeedbackModal('settings');
}
```

---

### 插槽 4：📦 本地包更新 (`local-pkg`)

- **功能定位**：开放扩展插槽的标杆范例。在移动端真机联调中，用于**直连下载开发机刚编译好的本地最新 APK / 测试包**，彻底免去等待 CI/CD 10~15 分钟漫长打包排队的烦恼。
- **业务落地说明**：在真实工程**《每周一山》（Weekly Mountain）**中已有完整落地实践（名为 `alpine-dev-apk`），测试人员在手机悬浮胶囊内即可秒级拉取开发机刚编译好的 Debug 安装包。

#### 💻 对应实现代码范例（完整三件套）

#### 1. 插槽声明与注册代码 (`src/debug/localPkgPlugin.js`)
遵循 `FeedbackExtensionTab` 规范，实现 Vue 3 子应用的动态挂载与切离清理：

```javascript
import { createApp } from 'vue';
import { registerExtensionTab } from '@lylyuanliang/agent-feedback-client';
import LocalPkgExtensionView from './LocalPkgExtensionView.vue';

export const localPkgTab = {
  id: 'local-pkg',
  label: '本地包更新',
  icon: '📦',
  badge: 'NEW',
  render(container, context) {
    // 1. 动态挂载 Vue 3 子组件，注入上下文方法
    const app = createApp(LocalPkgExtensionView, {
      theme: context.theme,
      onClose: context.closeModal,
      onJumpToSettings: () => context.openTab('settings') // 联动跳至设置页签
    });

    app.mount(container);

    // 2. 核心生命周期：切走页签时卸载组件，释放内存
    return () => {
      app.unmount();
    };
  }
};

// 注册至悬浮胶囊
registerExtensionTab(localPkgTab);
```

#### 2. 业务面板组件实现代码 (`LocalPkgExtensionView.vue`)
展示开发机当前刚编译的 APK 文件名、大小、最后编译时间，并提供直连下载与门禁联动：

```vue
<template>
  <div class="local-pkg-root">
    <!-- 样式隔离穿透：融入深色主题 -->
    <component is="style">
      .local-pkg-root { display: flex; flex-direction: column; gap: 12px; color: #f3f4f6; }
      .pkg-card { background: #181f2a; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; }
      .btn-download { background: #4edea3; color: #12151c; border: none; border-radius: 8px; padding: 10px; font-weight: bold; cursor: pointer; }
    </component>

    <!-- 1. 未授权受限遮罩 (门禁联动) -->
    <div v-if="!isAuthorized" class="pkg-card" style="text-align: center;">
      <p>🔒 该本地更新通道受开发机门禁保护，需输入密钥后访问。</p>
      <button class="btn-download" @click="onJumpToSettings">⚙️ 前往输入配对密钥</button>
    </div>

    <!-- 2. 已授权：展示开发机最新编译信息与一键下载 -->
    <div v-else class="pkg-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <b>📦 开发机最新安装包</b>
        <span style="font-size: 11px; color: #9ca3af;">{{ apkInfo.updateTime }}</span>
      </div>
      <p style="font-size: 13px; color: #9ca3af; margin: 8px 0;">
        文件：{{ apkInfo.apkName }} ({{ apkInfo.fileSize }})
      </p>
      <button class="btn-download" style="width: 100%;" @click="downloadApk">
        ⬇️ 立即下载本地 Debug APK
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  theme: String,
  onClose: Function,
  onJumpToSettings: Function
});

const isAuthorized = ref(true);
const apkInfo = ref({ apkName: '检查中...', fileSize: '0 MB', updateTime: '' });

onMounted(async () => {
  // 读取本地密钥
  const key = localStorage.getItem('af_access_key');
  if (!key) {
    isAuthorized.value = false;
    return;
  }

  try {
    // 请求开发机 DevServer 中间件提供的最新 APK 状态接口
    const res = await fetch('/api/app-update');
    if (res.ok) {
      apkInfo.value = await res.json();
    }
  } catch (err) {
    console.warn('[LocalPkg] 获取本地更新失败:', err);
  }
});

function downloadApk() {
  window.location.href = '/releases/weekly-mountain-latest-debug.apk';
}
</script>
```

#### 3. 宿主 DevServer 配合中间件配置 (`vite.config.ts`)
在宿主开发机的 Vite 配置中，挂载一个轻量中间件提供 APK 文件的流式分发（支持 Range 断点续传）：

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 宿主专属：本地 APK 流式直连下载与版本感知中间件
 */
function viteLocalApkPlugin(): Plugin {
  return {
    name: 'vite-plugin-local-apk-bridge',
    configureServer(server) {
      // 1. 提供最新包版本元数据接口
      server.middlewares.use('/api/app-update', (req, res) => {
        const localApk = path.resolve(__dirname, 'android/app/build/outputs/apk/debug/app-debug.apk');
        const stat = fs.existsSync(localApk) ? fs.statSync(localApk) : null;

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          apkName: 'app-debug.apk (开发机本地刚编译)',
          fileSize: stat ? `${(stat.size / 1024 / 1024).toFixed(2)} MB` : '0 MB',
          updateTime: stat ? new Date(stat.mtimeMs).toLocaleString() : '未构建'
        }));
      });

      // 2. 提供 APK 静态文件流式下载 (支持 Range 断点续传)
      server.middlewares.use('/releases', (req, res, next) => {
        const localApk = path.resolve(__dirname, 'android/app/build/outputs/apk/debug/app-debug.apk');
        if (fs.existsSync(localApk)) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          fs.createReadStream(localApk).pipe(res);
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [
    viteLocalApkPlugin() // 挂载本地包下载中间件
  ]
});
```
