# Chrome Web Store 发布资料 — Pagex v0.4.1

> 生成日期：2026-11-11
> 此文件包含 Dashboard 所有需要填写的字段，发布时逐项复制粘贴。

---

## 产品详情

### 软件包中的标题
Pagex


### 软件包中的摘要
Extract page content into AI-ready JSON, capture full-page screenshots, and export cookies — all offline.


### 说明（最长 16,000 字符）
Pagex is a Chrome extension that extracts page content into structured JSON, captures full-page screenshots, and exports cookies — all locally, without sending data anywhere.

It helps you collect visible content, hidden content, expandable sections, frame results, and lightweight style context without copying raw HTML by hand. The extension is built for people who need to move web content into AI, automation, or internal analysis workflows with a cleaner and more controlled payload.

What Pagex does:

Page extraction
- Tick one or many tabs in the popup and extract them in one batch
- Expand common disclosure patterns such as details, aria-expanded="false", and fragment-based collapse controls
- Trigger lazy-loaded content by scrolling before extraction
- Collect DOM and shadow DOM nodes into structured JSON
- Merge accessible frame results and label skipped or failed frames clearly
- Filter sensitive attributes and remove query strings and hashes from exported values
- Download one page as a JSON file, or a whole batch as a single ZIP (one JSON per page)
- Optional auto-download as soon as extraction finishes
- Stop a running extraction and retry at any time
- Live per-page progress, plain-language reasons for pages that can't be read, and a first-run quick start
- English and Simplified Chinese interface, light and dark themes

Full-page screenshot
- Capture the entire scrollable page as a stitched PNG
- Automatically handle SPA pages with non-document scrolling containers
- Hide scrollbars and neutralize fixed/sticky elements for clean output
- Wait for lazy-loaded images before each capture
- Scale down automatically for very long pages
- No extra permissions needed

Cookie and storage export
- Export all cookies for the selected tab in Netscape cookies.txt format (curl/wget compatible)
- Include localStorage and sessionStorage data in the export
- Works with any site you have permission to access
- Output header clearly states data never leaves your device

Everything runs locally — no data is ever sent to a server.


### 类别
Developer Tools


### 语言
English


---

## 图片资源

> 以下文件已拷贝到 release/ 目录，上传时直接从此目录选择。

| 资源 | 文件名 | 规格 | 必须 |
|------|--------|------|------|
| 商店图标 | `icon-128.png` | 128x128 PNG | 是 |
| 屏幕截图 1 | `screenshot-1.png` | 1280x800 PNG | 是 |
| 屏幕截图 2 | `screenshot-2.png` | 1280x800 PNG | 否 |
| 屏幕截图 3 | `screenshot-3.png` | 1280x800 PNG | 否 |
| 屏幕截图 4 | `screenshot-4.png` | 1280x800 PNG | 否 |
| 小型宣传图块 | `small-promo.png` | 440x280 PNG | 否 |
| 顶部宣传图块 | `marquee-promo.png` | 1400x560 PNG | 否 |

### 宣传视频（可选）
YouTube URL: (无)


---

## 其他字段

### 官方网址
https://github.com/host452b/pagex


### 首页网址
https://github.com/host452b/pagex


### 支持信息页面网址
https://github.com/host452b/pagex/issues


### 成人内容
不包含成人内容


---

## 隐私权

### 单一用途说明（最长 1,000 字符）

This extension extracts page content into structured JSON, captures full-page screenshots, and exports cookies for the selected tab. All processing happens locally in the browser — no data is sent to any server. The user controls when to extract, screenshot, or export by clicking buttons in the popup. Output is saved as downloaded files on the user's device.


### 需请求权限的理由

**需请求 activeTab 的理由：**
This extension reads the current page content to extract structured data, capture viewport screenshots for full-page stitching, and identify the selected tab. It only activates when the user clicks the extension icon. No data is collected or transmitted — all processing happens locally on the device.


**需请求 cookies 的理由：**
Reads cookies for the selected tab when the user clicks the "Get cookies.txt" button in the popup. Cookie data is formatted in Netscape cookies.txt format and saved as a local file download. Cookie data is never sent to any server or stored beyond the downloaded file.


**需请求 scripting 的理由：**
Injects a content script into the selected tab to collect page structure, scroll the page for full-page screenshots, and read localStorage/sessionStorage for the cookie export. Only activates when the user clicks a button in the popup. No scripts are loaded from remote sources.


**需请求 storage 的理由：**
Stores extension session state (batch status, result summaries, and the compressed results of the latest batch) locally on the device using chrome.storage.session, which is cleared when the browser closes. Stores two user settings (auto-download, quick-start dismissed) in chrome.storage.local. No data is synced to external servers.


**需请求 tabs 的理由：**
Reads tab titles and URLs to populate the tab picker dropdown in the popup, allowing the user to choose which tab to extract, screenshot, or export cookies from. Tab information is only used locally in the popup UI and never transmitted.


**需请求 webNavigation 的理由：**
Inspects frame coverage for the current tab using webNavigation.getAllFrames to identify accessible frames, cross-origin frames, and skipped frames during page extraction. Frame metadata is included in the extraction result for completeness. No navigation data is stored or transmitted.


**需请求主机权限的理由：**
Host access is optional (optional_host_permissions: <all_urls>) and is never granted at install time. The first time the user presses Extract, Screenshot, or Export cookies, the extension asks once for access to websites so it can read the tabs the user ticked, including background tabs. The user can decline (only the active tab is then readable via activeTab) or revoke access at any time from the extension's Settings panel.


### 远程代码

不，我并未使用远程代码


### 数据使用

| 数据类型 | 是否收集 | 说明 |
|---------|---------|------|
| 个人身份信息 | 否 | — |
| 健康信息 | 否 | — |
| 财务和付款信息 | 否 | — |
| 身份验证信息 | 否 | Extension redacts sensitive attributes like passwords and tokens by default |
| 个人通讯 | 否 | — |
| 位置 | 否 | — |
| 网络记录 | 是 | Reads the URL and title of the user-selected tab to populate the tab picker. This data stays local and is never transmitted. |
| 用户活动 | 否 | — |
| 网站内容 | 是 | Extracts page DOM structure, text, and styles into JSON when the user clicks Extract. Captures viewport screenshots when the user clicks Screenshot. Reads cookies and storage when the user clicks Get cookies.txt. All data is saved locally as downloaded files and never sent to any server. |

**三个必勾声明：**

- [x] 我不会出于已获批准的用途之外的用途向第三方出售或传输用户数据
- [x] 我不会为实现与我的产品的单一用途无关的目的而使用或转移用户数据
- [x] 我不会为确定信用度或实现贷款而使用或转移用户数据

### 隐私权政策网址

https://github.com/host452b/pagex/blob/main/docs/store-listing/privacy-policy-en.md


---

## 分发设置

### 付款
免费


### 公开范围
公开


### 分发地区
所有地区
