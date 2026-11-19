# 🔌 Agent Feedback 扩展槽与插拔式工作台指南 (Extension Tabs Cookbook)

在移动端测试、真机联调与混合应用（Hybrid/Capacitor）研发中，开发者常常需要安装多种专属调试工具（例如：开发机本地包直连安装、网络与域名诊断、离线缓存一键重置、屏幕常亮保活等）。如果每个工具都在手机屏幕上挂一个独立的悬浮球，**狭小的手机屏幕将被各种浮动按钮占满，严重遮挡业务 UI 与手势操作**。

`@lylyuanliang/agent-feedback` 提出了 **单一悬浮胶囊，可插拔开发者工作台（Pluggable Developer Hub）** 的设计哲学：
- 屏幕上仅需保留一个优雅的微型胶囊；
- 点击展开后，不仅具备原生的端侧反馈与 AI 自愈进度闭环，更能作为开放的插槽容器，随心挂载或拔除专属业务工具！

---

## 目录

1. [一、 agent-feedback 内置插槽体系与显隐策略](#一-agent-feedback-内置插槽体系与显隐策略)
2. [二、 开放扩展插槽的可插拔架构 (Pluggable Architecture)](#二-开放扩展插槽的可插拔架构-pluggable-architecture)
3. [三、 核心 API 与接口契约](#三-核心-api-与接口契约)
4. [四、 标准使用示例 (Code Recipes)](#四-标准使用示例-code-recipes)
   - [示例 1：原生 DOM 极简插槽实现](#示例-1原生-dom-极简插槽实现)
   - [示例 2：Vue 3 单文件组件挂载与销毁](#示例-2vue-3-单文件组件挂载与销毁)
   - [示例 3：React 18 组件挂载与卸载](#示例-3react-18-组件挂载与卸载)
   - [示例 4：跨插槽联动（受限时一键跳转联调设置）](#示例-4跨插槽联动受限时一键跳转联调设置)
5. [五、 真实应用范例参考 (Application Case Studies)](#五-真实应用范例参考-application-case-studies)

---

## 一、 agent-feedback 内置插槽体系与显隐策略

`agent-feedback` 自身已经内置了三套核心功能插槽，每个插槽均具备严谨的生命周期与可插拔控制机制：

| 插槽 ID | 名称与图标 | 核心能力说明 | 可插拔性与显隐规则 |
| :--- | :--- | :--- | :--- |
| **`submit`** | 📝 **新建反馈** | • 截图与原生视频录屏附件上传<br>• 多行问题文本输入（自动换行与 Markdown 安全排版）<br>• 设备像素比、视口分辨率与运行平台全息快照<br>• 控制台最近 30 条运行日志环形收集 | **核心常驻**；受门禁（Access Control）统一保护，未配对时展示安全受限遮罩并引导解锁。 |
| **`history`** | 📜 **历史与进度** | • 日级工单流转时间轴（待排查 ➔ 修复中 ➔ 已自愈/已驳回）<br>• AI Agent 自动生成的自愈排查分析报告卡片<br>• 5 秒轻量静默轮询更新<br>• 接收服务端/Agent 广播的系统公告通知 | **核心常驻**；未输入配对密钥时遮罩隐藏敏感排查日志与堆栈。 |
| **`settings`** | ⚙️ **联调设置** | • 运行时动态切换 API 基地址（内网穿透域名 / 本地 DevServer IP）<br>• 动态校验与持久化配对密钥（SHA-256 安全验证）<br>• 一键检测当前网络连通性与服务状态<br>• 备用引导渠道展示（如 GitHub Issues 链接） | **原生可插拔！**<br>• 生产/只读环境：**自动彻底拔除，0 DOM 渲染、0 调试痕迹**；<br>• 联调模式：满足配置了 `accessControl`、`apiBase` 或通过 `initAgentFeedback()` 初始化时**即插即用**；<br>• 强制拔除：可通过 `<agent-feedback-widget show-settings="false">` 显式屏蔽。 |

---

## 二、 开放扩展插槽的可插拔架构 (Pluggable Architecture)

为了让开发者能够按需扩展，`@lylyuanliang/agent-feedback-client` 提供了完备的 **对称可插拔机制（Plug in & Unplug）**：

```
┌────────────────────────────────────────────────────────────────────────┐
│  Agent Feedback 悬浮模态框 (Modal)                                     │
├─────────────┬─────────────┬───────────────────────────┬────────────────┤
│  📝 提工单   │  📜 历史    │  📦 [扩展插槽: 本地包更新]  │  ⚙️ 联调设置    │ ◄── 自由插拔
├─────────────┴─────────────┴───────────────────────────┴────────────────┤
│                                                                        │
│   [ 隔离沙箱容器: <div class="af-tab-panel af-tab-panel-ext"> ]          │
│   • 独立 Shadow DOM 渲染空间，杜绝与宿主全局 CSS 污染                   │
│   • 切换即挂载 (render)，切离即回收 (cleanup 回调执行)                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. “插 (Plug-in)”：动态挂载与热替换
调用 `registerExtensionTab(tab)` 可以随时将新插槽注册到悬浮工作台中。如果注册了相同 `id` 的插槽，容器会自动进行**安全热替换**并触发局部刷新，无需重新加载页面。

### 2. “拔 (Unplug)”：双层销毁与资源回收保障
- **页签切换时的瞬态拔除（Cleanup on Switch）**：
  当用户从扩展插槽切换到其他 Tab（或关闭模态框）时，容器会**立即触发执行该插槽 `render` 函数所返回的 `cleanup` 回调**。宿主可在此回收定时器、解绑 DOM 监听、调用 Vue 的 `app.unmount()` 或 React 的 `root.unmount()`，杜绝内存泄漏；
- **运行时的永久拔除（Unregister on Demand）**：
  若业务处于特定阶段（例如用户退出了调试人员身份，或完成了特定联调流程），可通过 `unregisterExtensionTab(id)` 从工作台中**彻底注销并移除该页签**。

---

## 三、 核心 API 与接口契约

### 1. `FeedbackExtensionTab` 插槽定义
```typescript
export interface FeedbackExtensionTab {
  /** 全局唯一标识符（不可重复，用于内部 Tab 激活路由与状态切换） */
  id: string;

  /** Tab 导航按钮上显示的文本标签 */
  label: string;

  /** 可选的前缀图标（支持单个 Emoji 如 '📦'、'🩺' 或 SVG 图标字符串） */
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

## 四、 标准使用示例 (Code Recipes)

### 示例 1：原生 DOM 极简插槽实现

适合不需要重量级 UI 框架、轻量级快速展示设备或环境状态的场景：

```typescript
import { registerExtensionTab } from '@lylyuanliang/agent-feedback-client';

registerExtensionTab({
  id: 'device-sensor',
  label: '设备状态',
  icon: '📱',
  render(container, context) {
    // 1. 构建 UI 结构
    container.innerHTML = `
      <div style="padding: 16px; color: inherit;">
        <h4 style="margin-top: 0;">📱 设备传感器与网络探测</h4>
        <p>网络状态: <b id="net-status">${navigator.onLine ? '🟢 在线' : '🔴 离线'}</b></p>
        <p>当前主题: <b>${context.theme}</b></p>
        <button id="btn-close" style="padding: 6px 14px; border-radius: 6px; cursor: pointer;">
          关闭面板
        </button>
      </div>
    `;

    // 2. 绑定事件与轮询定时器
    const updateStatus = () => {
      const el = container.querySelector('#net-status');
      if (el) el.textContent = navigator.onLine ? '🟢 在线' : '🔴 离线';
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    container.querySelector('#btn-close')?.addEventListener('click', () => {
      context.closeModal(); // 通过上下文关闭弹层
    });

    // 3. 核心：返回 cleanup 清理函数，拔出时自动回收资源
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }
});
```

---

### 示例 2：Vue 3 单文件组件挂载与销毁

在 Vue 3 项目中，可以通过独立子应用（`createApp`）将完整的 `.vue` 组件无缝嵌入扩展插槽：

```typescript
import { createApp } from 'vue';
import { registerExtensionTab, type FeedbackExtensionTab } from '@lylyuanliang/agent-feedback-client';
import MyCustomView from '@/components/debug/MyCustomView.vue';

export const myVueExtensionTab: FeedbackExtensionTab = {
  id: 'my-vue-tool',
  label: '业务调试',
  icon: '🛠️',
  badge: 'NEW',
  render(container, context) {
    // 1. 动态创建独立的 Vue 子应用实例，并注入 Context 属性
    const app = createApp(MyCustomView, {
      theme: context.theme,
      onClose: context.closeModal,
      onJumpToSettings: () => context.openTab('settings')
    });

    // 若需要状态机，可在此使用 app.use(pinia)
    app.mount(container);

    // 2. 核心：返回 unmount 清理回调，切走页签时瞬时销毁子应用
    return () => {
      app.unmount();
    };
  }
};

registerExtensionTab(myVueExtensionTab);
```

---

### 示例 3：React 18 组件挂载与卸载

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerExtensionTab } from '@lylyuanliang/agent-feedback-client';
import NetworkDiagnostics from './NetworkDiagnostics';

registerExtensionTab({
  id: 'net-diag',
  label: '网络诊断',
  icon: '🌐',
  render(container, context) {
    const root = createRoot(container);
    root.render(
      <NetworkDiagnostics
        theme={context.theme}
        onClose={context.closeModal}
        onJumpToHistory={() => context.openTab('history')}
      />
    );

    // React 18 标准卸载回收
    return () => {
      root.unmount();
    };
  }
});
```

---

### 示例 4：跨插槽联动（受限时一键跳转联调设置）

当自定义插槽涉及受限接口调用时，可借助 `context.openTab('settings')` 引导用户输入密钥：

```typescript
render(container, context) {
  const isAuthorized = localStorage.getItem('af_access_key');
  if (!isAuthorized) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center;">
        <p>🔒 抱歉，该调试工具受访问门禁保护，需配对密钥后使用。</p>
        <button id="btn-auth" style="padding: 8px 16px; border-radius: 8px; background: #4edea3; color: #12151c; font-weight: bold; cursor: pointer; border: none;">
          ⚙️ 前往输入配对密钥
        </button>
      </div>
    `;
    container.querySelector('#btn-auth')?.addEventListener('click', () => {
      context.openTab('settings'); // 👈 平滑跳转至联调设置页签
    });
    return;
  }

  // 正常业务渲染...
}
```

---

## 五、 真实应用范例参考 (Application Case Studies)

在实际工程研发中，扩展插槽机制常被用来整合高频的移动端联调诉求，以下为典型落地范例：

### 范例 A：本地离线包直连下载 (Dev APK Bridge)
- **应用背景**：在像《每周一山》（Weekly Mountain）这样的移动端 Hybrid/Capacitor 项目中，如果开发者每次改动都走 Git Commit ➔ Push Tag ➔ GitHub CI 打包，需要漫长等待 10~15 分钟；而在本地执行命令编译 Debug APK 只需 30 秒。
- **插槽设计**：注册 `alpineDevApkTab`（页签名为 `'本地包'`，图标 `'📦'`），面板展示开发机本地刚构建的 `app-debug.apk` 文件名、大小、编译时间，并提供直连下载与局域网二维码。测试人员手机打开悬浮窗，在同一个胶囊内即可秒级安装最新真机测试包，免去群里翻找安装包文件的烦琐。

### 范例 B：移动端局域网与网络链路诊断 (Network Inspector)
- **应用背景**：真机走测常遇到开发机 IP 变动或 Wi-Fi 隔离导致无法联通。
- **插槽设计**：注册 `'net-diag'` 页签，调用内网探测接口一键 Ping 开发机的 `5173` 端口，展示 DNS 解析耗时、当前是蜂窝流量还是 Wi-Fi，并提供复制局域网 IP 与穿透域名的快捷按钮。

### 范例 C：真机走测屏幕常亮保活 (Screen WakeLock)
- **应用背景**：测试人员在外场或会议室验证路线与连续定位时，手机极易因超时自动息屏锁屏，打断联测。
- **插槽设计**：注册 `'wakelock'` 页签，调用标准 `navigator.wakeLock.request('screen')` 接口，提供一个“保持屏幕常亮”的开关，并在页签切离或工作台关闭时自动释放锁，兼顾便携与省电。
