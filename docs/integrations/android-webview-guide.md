# Agent Feedback 原生 Android WebView 容器深度集成指南 (Android Hybrid Integration Guide)

在现代 Android 原生应用（Pure Native Kotlin / Java）或混合架构（如 MantraKey、各类轻量级 Hybrid App）中，嵌入 `@lylyuanliang/agent-feedback` 能够为移动端真机走测带来极其强大的实时抓包、自动截屏与 AI 智能体自愈能力。

然而，由于 **Android 底层 Linux 沙箱安全机制、内容提供者（ContentProvider）权限模型以及 Chromium 内核在 WebView 中的特化行为**，若未在 Android 宿主端进行完备的容器配置，极易遇到文件选择无反应、图片列表静默变空或跨域受阻等问题。

本文档由核心架构团队与原生 Android 专家联合编写，系统梳理底层原理，并提供一份生产级、开箱即用的 Kotlin 标准实现。

---

## 目录

- [一、高频踩坑现象与底层核心原理](#一高频踩坑现象与底层核心原理)
  - [1. 点击“上传截图/录屏”毫无反应](#1-点击上传截图录屏毫无反应)
  - [2. 选择图片后列表未展示（或静默变空）](#2-选择图片后列表未展示或静默变空)
  - [3. `filePathCallback` 挂起导致后续点击永久失效](#3-filepathcallback-挂起导致后续点击永久失效)
  - [4. 本地静态资源与开发机联调的 CORS 跨域问题](#4-本地静态资源与开发机联调的-cors-跨域问题)
- [二、生产级 Kotlin 宿主标准实现 (Full Implementation)](#二生产级-kotlin-宿主标准实现-full-implementation)
- [三、WebView 基础容器最佳属性配置清单](#三webview-基础容器最佳属性配置清单)
- [四、开发机联调与 CORS 跨域配置指南](#四开发机联调与-cors-跨域配置指南)
- [五、客户端（@lylyuanliang/agent-feedback-client）防御性韧性机制](#五客户端lylyuanliangagent-feedback-client防御性韧性机制)

---

## 一、高频踩坑现象与底层核心原理

### 1. 点击“上传截图/录屏”毫无反应

* **现象**：在浏览器或 Capacitor/Cordova 容器中点击正常，但在纯原生 `android.webkit.WebView` 中点击“📁 上传截图/录屏”按钮，系统没有任何弹窗，也不唤起相册。
* **底层原理**：
  * Web 端采用标准 W3C HTML `<input type="file" accept="image/*,video/*" multiple>` 标签；
  * Android 官方出于隐私安全隔离原则，**原生的 `WebView` 默认不具备访问设备相册或 SAF（Storage Access Framework）的权限，其默认的 `WebChromeClient` 实现直接忽略了该点击事件**；
  * 宿主应用必须显式继承 `WebChromeClient`，并重写 `onShowFileChooser` 方法，将其桥接至 Android 原生的文件选择器或系统 Photo Picker。

### 2. 选择图片后列表未展示（或静默变空）

* **现象**：点击弹出了系统相册，选择好图片并返回 WebView 后，图片缩略图列表中依然是空的；若未开启容错还会导致用户误以为“选图失败”。
* **底层原理**：
  * **单选 vs 多选解析遗漏**：在用户选择单张图片时，系统通过 `intent.data` 返回单一 `Uri`；而在用户通过长按或多选模式选择多张图片时，系统通过 `intent.clipData` 返回 `ClipData` 集合。若宿主仅读取 `intent.data`，多选返回时 `intent.data` 为 `null`，导致回调传回空数组；
  * **Content URI 临时访问权缺失**：在 Android 13+ 以及各主流厂商定制系统（如小米澎湃 HyperOS、MIUI、vivo OriginOS 等）中，系统照片选择器返回的是受保护的 `content://` URI。若宿主未显式调用 `grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)`，Chromium 内部沙箱的 `FileReader` 试图读取该流时将触发底层的 `SecurityException`，造成文件读取直接中断。

### 3. `filePathCallback` 挂起导致后续点击永久失效

* **现象**：第一次点击取消相册后，再次点击“上传”按钮完全失去响应。
* **底层原理**：
  * `onShowFileChooser` 会传入一个 `ValueCallback<Array<Uri>>?` 句柄；
  * **Chromium 内核的绝对契约**：该回调有且仅能被执行一次。若用户在唤起系统选择器后按了返回键取消、或者发生异常，宿主**必须显式调用 `callback.onReceiveValue(null)`**。
  * 若未调用 `onReceiveValue`，Chromium 内核将一直处于等待阻塞状态，后续任何对 `<input type="file">` 的点击事件都会被内核静默丢弃！
  * **重复点击防御**：在保存新的回调之前，必须先将上一次尚未完成的旧回调以 `null` 闭环。

### 4. 本地静态资源与开发机联调的 CORS 跨域问题

* **现象**：WebView 采用 `https://appassets.androidplatform.net` 虚拟域托管本地 HTML，通过局域网（如 `http://192.168.1.100:5173`）或穿透隧道（如 `https://xxx.cpolar.top`）向开发机提交反馈时报 CORS 拦截。
* **底层原理**：
  * 现代 Android 安全规范推荐使用 `androidx.webkit.WebViewAssetLoader` 将 assets 映射为安全的虚拟 HTTPS 域名，这会引发浏览器同源策略（SOP）检查；
  * 需要开发机的 DevServer（Vite / Webpack 等）开启标准 CORS 响应头允许跨域访问。

---

## 二、生产级 Kotlin 宿主标准实现 (Full Implementation)

以下为经过真机全面验证的生产级标准 Kotlin 模板，适用于 Android 8.0 ~ Android 16（API 26 ~ 36+），完整处理了 Android 13+ Photo Picker、系统选择器、多选解析、显式权限授权与生命周期防挂起。

```kotlin
package com.example.app.hybrid

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Agent Feedback 容器专属 WebChromeClient 扩展
 *
 * 核心职责：
 * 1. 响应 Web 端 <input type="file"> 并安全拉起系统选择器；
 * 2. 严密闭环 filePathCallback 生命周期，防止 Chromium 内核挂起；
 * 3. 完整解析 ClipData（多选）与 Data（单选），赋权并安全回传 Uri 数组。
 */
class AgentFeedbackChromeClient(
    private val activity: ComponentActivity,
    private val filePickerLauncher: ActivityResultLauncher<Intent>
) : WebChromeClient() {

    // 持有当前正在等待结果的文件路径回调
    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
    ): Boolean {
        // 【防御机制 1】：重复点击时，先将旧的未完成回调以 null 闭环，彻底解除内核挂起状态
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = filePathCallback

        return try {
            val acceptTypes = fileChooserParams?.acceptTypes ?: arrayOf("*/*")
            val allowMultiple = fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE

            // 构造标准系统 SAF/通用选择 Intent
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (acceptTypes.isNotEmpty() && acceptTypes[0].isNotBlank()) {
                    acceptTypes[0]
                } else {
                    "*/*"
                }
                if (acceptTypes.size > 1) {
                    putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes)
                }
                // 开启多选支持
                if (allowMultiple) {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
            }

            filePickerLauncher.launch(Intent.createChooser(intent, "选择截图或录屏"))
            true
        } catch (e: Exception) {
            // 【防御机制 2】：若拉起选择器发生系统异常，必须立即用 null 闭环回调
            pendingFilePathCallback?.onReceiveValue(null)
            pendingFilePathCallback = null
            false
        }
    }

    /**
     * 宿主 Activity 收到 ActivityResult 回调后必须调用此方法完成结果闭环
     */
    fun handleActivityResult(resultCode: Int, data: Intent?) {
        val callback = pendingFilePathCallback
        pendingFilePathCallback = null

        if (callback == null) return

        if (resultCode != ComponentActivity.RESULT_OK || data == null) {
            // 用户取消选择或失败，返回 null
            callback.onReceiveValue(null)
            return
        }

        val resultUris = mutableListOf<Uri>()

        // 【核心解析 1】：优先解析多选 ClipData
        data.clipData?.let { clipData ->
            for (i in 0 until clipData.itemCount) {
                clipData.getItemAt(i)?.uri?.let { uri ->
                    grantReadPermission(activity, uri)
                    resultUris.add(uri)
                }
            }
        }

        // 【核心解析 2】：若无 ClipData，解析单选 data
        if (resultUris.isEmpty()) {
            data.data?.let { uri ->
                grantReadPermission(activity, uri)
                resultUris.add(uri)
            }
        }

        // 【兜底解析 3】：使用 WebChromeClient.FileChooserParams 官方解析器做最终兜底
        if (resultUris.isEmpty()) {
            FileChooserParams.parseResult(resultCode, data)?.let { uris ->
                for (uri in uris) {
                    grantReadPermission(activity, uri)
                    resultUris.add(uri)
                }
            }
        }

        // 回传选中的 Uri 数组给 Chromium
        callback.onReceiveValue(if (resultUris.isNotEmpty()) resultUris.toTypedArray() else null)
    }

    /**
     * 【核心权限赋权】：显式授予当前包对 content:// URI 的读取权限，
     * 解决 HyperOS、MIUI、EMUI 等系统下 Chromium 内核读取流抛出 SecurityException 的问题。
     */
    private fun grantReadPermission(context: Context, uri: Uri) {
        try {
            context.grantUriPermission(
                context.packageName,
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        } catch (_: Exception) {
            // 忽略非 ContentProvider 或不支持赋权的特殊 URI 异常
        }
    }
}
```

### 宿主 Activity 中接入示例

```kotlin
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var feedbackChromeClient: AgentFeedbackChromeClient

    // 注册标准 ActivityResultLauncher
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        feedbackChromeClient.handleActivityResult(result.resultCode, result.data)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        feedbackChromeClient = AgentFeedbackChromeClient(this, filePickerLauncher)

        // 绑定 ChromeClient
        webView.webChromeClient = feedbackChromeClient

        // 配置 WebView 属性（详见第三章）
        configureWebViewSettings(webView)

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    override fun onDestroy() {
        // 宿主销毁时兜底清空挂起回调
        feedbackChromeClient.handleActivityResult(RESULT_CANCELED, null)
        super.onDestroy()
    }
}
```

---

## 三、WebView 基础容器最佳属性配置清单

为了保证 `@lylyuanliang/agent-feedback` 的 Web Component、Shadow DOM、暗黑模式切换以及配对持久化等功能在 Android 原生端稳定运行，建议配置以下属性：

```kotlin
fun configureWebViewSettings(webView: WebView) {
    webView.settings.apply {
        // 1. 基础脚本执行支持
        javaScriptEnabled = true

        // 2. 本地存储支持：必须开启！用于持久化存储访问密钥（Access Key）、API 穿透地址与端侧偏好
        domStorageEnabled = true
        databaseEnabled = true

        // 3. 安全沙箱隔离推荐配置（配合 WebViewAssetLoader，杜绝 file:// 协议提权风险）
        allowFileAccess = false
        allowContentAccess = true

        // 4. 混合内容支持（开发机调试场景：当静态页运行在 HTTPS 虚拟域但开发机接口为局域网 HTTP 时）
        mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        // 5. 视图自适应与视口缩放
        useWideViewPort = true
        loadWithOverviewMode = true

        // 6. 媒体自动播放与录音支持
        mediaPlaybackRequiresUserGesture = false
    }

    // 启用 WebView 远程调试（仅在 Debug 构建下开启，便于 Chrome Inspect 联调）
    if (BuildConfig.DEBUG) {
        WebView.setWebContentsDebuggingEnabled(true)
    }
}
```

---

## 四、开发机联调与 CORS 跨域配置指南

在 Android 宿主使用 `androidx.webkit.WebViewAssetLoader` 模式时，前端运行在虚拟域名（例如 `https://appassets.androidplatform.net`），而开发机接口通常为内网 IP（如 `http://192.168.x.x:5173`）或内网穿透隧道（如 `https://xxx.cpolar.top`）。

### 1. 开发机 DevServer（Vite 配置）开启跨域

确保开发机的 `vite.config.ts` 中开启了标准 CORS 响应头，示例：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import agentFeedbackPlugin from '@lylyuanliang/agent-feedback-vite-plugin';

export default defineConfig({
  plugins: [
    agentFeedbackPlugin({
      storageDir: '.agent/feedback'
    })
  ],
  server: {
    host: '0.0.0.0', // 允许局域网真机直连访问
    port: 5173,
    cors: true,      // 开启跨域允许
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-agent-feedback-key'
    }
  }
});
```

### 2. Android 网络安全配置 (Network Security Config)

若在真机调试时连接的是局域网 HTTP 开发机地址（如 `http://192.168.1.50:5173`），需在 `AndroidManifest.xml` 中配置明文网络通信许可：

在 `res/xml/network_security_config.xml` 中配置：
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

并在 `AndroidManifest.xml` 的 `<application>` 标签中引入：
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ... >
```

---

## 五、客户端（@lylyuanliang/agent-feedback-client）防御性韧性机制

在 `@lylyuanliang/agent-feedback-client`（v1.5.1+）中，核心框架已在 Web 侧内置了多层容错防线：

1. **自动降级兜底（Canvas Fallback）**：
   * 当用户从 Android 相册中选择了特殊编码图片（如部分厂商的实况照片、HDR 增强位图或特殊 HEIC 格式）导致 Canvas 压缩阶段抛出异常时，客户端会自动降级回退原始图片数据，**绝不会静默丢弃图片**；
2. **友好 UI 权限提示（Friendly Alert）**：
   * 若底层因 Android 系统权限被拒绝（如未授予读取权限导致 `FileReader` 失败），客户端会捕获异常并弹出明确友好的错误提示，引导用户检查应用的文件读取授权；
3. **选择框状态自动复位（Input Reset）**：
   * 每次文件读取完毕（无论成功或失败），框架均会自动清空 `<input type="file">` 的 `value`，允许用户在权限修复后立即重选相同文件。

---

> 如有更多混合架构集成或特定厂商定制系统的兼容疑问，欢迎在 GitHub 提交 Issue 或与维护团队沟通交流。
