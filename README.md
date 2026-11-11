# Pagex

Pagex 是一个 Chrome Manifest V3 插件，用于把当前网页提取成适合 AI 处理的 JSON。它会尽量保留页面结构、文本、样式摘要、隐藏内容和可展开内容，并通过 popup 提供清晰的解析与复制流程。

Pagex is a Chrome Manifest V3 extension that extracts the current page into AI-friendly JSON. It is designed to capture structure, text, style summaries, hidden content, and expanded disclosure content with a visible parse flow in the popup.

## Features / 功能

- 在 popup 中勾选一个或多个 tab 批量提取（每批最多 20 个，并发 3 个）/ tick one or many tabs in the popup and extract them as one batch (up to 20 per batch, 3 at a time)
- 单页下载 JSON，多页打包为一个 ZIP；可选完成后自动下载 / one page downloads as JSON, several pages as one ZIP; optional auto-download when done
- 每个 tab 实时显示进度，无法读取或失败的页面给出易懂原因 / live per-tab progress with plain-language reasons for unreadable or failed pages
- 首次使用快速上手引导，中英文界面（跟随浏览器语言），浅色/深色主题 / first-run quick start, English and Simplified Chinese UI (follows browser language), light and dark themes
- 后台 tab 原地读取，不切换页面；有时间预算，卡住的页面不会拖垮整批 / background tabs are read in place without switching; time budgets keep one stuck page from stalling the batch
- 自动展开常见折叠内容，如 `details`、`aria-expanded="false"` 和常见 accordion 控件 / expand common disclosure patterns such as `details`, `aria-expanded="false"`, and common accordion controls
- 通过自动滚动触发部分 lazy-loaded 内容 / trigger lazy-loaded content by auto-scrolling the page
- 采集 DOM 与 shadow DOM，并输出结构化 JSON / collect DOM and shadow DOM nodes into structured JSON
- 合并可访问 iframe 结果，并显式标记跳过或失败的 frame / merge accessible iframe results and mark skipped or failed frames explicitly
- 按选中站点的 origin 动态申请权限（多个站点合并为一次授权）；也可在设置中一次性授权所有网站 / request site access per origin at parse time (one prompt for all selected sites), or grant all sites once from Settings
- 整页截图与 cookies.txt 导出（针对单个勾选的 tab）/ full-page screenshot and cookies.txt export for a single ticked tab
- 默认导出更紧凑的结果，包含敏感属性过滤、URL scrub 和遍历预算 / export a more compact payload by default with sensitive attribute filtering, URL scrubbing, and traversal budgets

## File Layout / 项目结构

- `manifest.json`: MV3 插件清单 / MV3 extension manifest
- `background.js`: 批量任务编排（并发、停止、错误分类）与 session 状态存储 / batch orchestration (concurrency, stop, error classification) and session state storage
- `content.js`: 注入目标页面的核心采集器 / in-page collector injected into the target tab
- `popup.html`, `popup.css`, `popup.js`: popup 界面、动画和交互流程 / popup UI, animation, and interaction flow
- `src/shared/`: 共享状态、权限、压缩、ZIP、文件名等工具 / shared job state, permissions, compression, ZIP, and file-name utilities
- `src/popup/`: popup 专用模块（i18n、截图、cookies、下载）/ popup-only modules (i18n, screenshot, cookies, download)
- `_locales/`: 界面文案（en、zh_CN）/ UI strings (en, zh_CN)
- `fixtures/`: 本地手工验证页面 / manual verification pages
- `tests/`: 基于 Node 的单元测试 / Node-based unit tests

## Install / 安装

1. 先运行 `npm run generate:store-assets` 生成图标与商店素材。Run `npm run generate:store-assets` first to generate icons and store assets.
2. 打开 Chrome 并访问 `chrome://extensions`。Open Chrome and go to `chrome://extensions`.
3. 开启 `Developer mode`。Enable `Developer mode`.
4. 点击 `Load unpacked`。Click `Load unpacked`.
5. 选择当前项目目录。Select this project folder.

## Use / 使用

1. 打开你想解析的网页。Open the page(s) you want to parse.
2. 点击 `Pagex` 插件图标，当前 tab 已自动勾选。Click the `Pagex` icon; the current tab is already ticked.
3. 需要批量时，多勾选几个 tab。Tick more tabs to extract several at once.
4. 点击 `提取页面 / Extract page`。如果 Chrome 弹出权限请求，选择允许。Press `Extract`; approve the site access prompt if Chrome asks.
5. 可以关闭 popup，提取会在后台继续。You can close the popup; extraction continues in the background.
6. 完成后自动下载（单页 JSON / 多页 ZIP），或点击 `下载 / Download`；每行也可单独下载。Files download automatically when done (JSON for one page, ZIP for several), or press `Download`; each row also has its own download button.

## Local Fixture / 本地验证页

你可以通过 `fixtures/demo-page.html` 手工验证采集器行为。

You can manually verify the collector with `fixtures/demo-page.html`.

1. 在 Chrome 中打开 `fixtures/demo-page.html`。Open `fixtures/demo-page.html` in Chrome.
2. 在扩展详情中启用 `Allow access to file URLs`，否则本地文件会显示为不可读取。Enable `Allow access to file URLs` in the extension details; otherwise local files show as unreadable.
3. 执行 `Extract Page`，确认结果包含以下内容。Run `Extract Page` and check that the output includes:
   - 原生 `details` 内容 / details content
   - `Read more` 展开内容 / `Read more` expanded content
   - fragment collapse link 展开内容 / fragment collapse link content
   - shadow DOM 内容 / shadow DOM content
   - iframe 内容 / iframe content
   - 自动滚动后触发的 lazy-loaded 内容 / lazy-loaded content after auto-scroll
   - 危险按钮不会被误点 / the danger button remaining unclicked
   - 已展开控件不会被重复点击 / the already expanded control remaining unclicked

## Test / 测试

```bash
npm test
```

## Package / 打包

使用下面的命令生成可上传到 Chrome Developer Dashboard 的 zip 包。

Use the command below to generate a zip archive that can be uploaded to the Chrome Developer Dashboard.

```bash
npm run package
```

默认输出路径：

Default output path:

- `release/pagex-v<manifest.version>.zip`

打包脚本会只包含插件运行时需要的文件，不会把 `tests`、`fixtures`、`node_modules`、`README.md` 或其他开发文件打进 zip。

The packaging script only includes files required at runtime. It excludes `tests`, `fixtures`, `node_modules`, `README.md`, and other development-only files.

## Store Assets / 商店素材

使用下面的命令生成 Chrome Web Store 上架素材。

Use the command below to generate Chrome Web Store listing assets.

```bash
npm run generate:store-assets
```

默认会生成：

By default, this generates:

- 运行时图标 / runtime icons
  - `assets/icons/pagex-16.png`
  - `assets/icons/pagex-32.png`
  - `assets/icons/pagex-48.png`
  - `assets/icons/pagex-128.png`
- 商店宣传图 / promo images
  - `store-assets/promo/pagex-small-promo-440x280.png`
  - `store-assets/promo/pagex-marquee-1400x560.png`
- 商店截图 / store screenshots
  - `store-assets/screenshots/pagex-screenshot-01-target-tab-1280x800.png`
  - `store-assets/screenshots/pagex-screenshot-02-parsing-1280x800.png`
  - `store-assets/screenshots/pagex-screenshot-03-parse-complete-1280x800.png`
  - `store-assets/screenshots/pagex-screenshot-04-copy-json-1280x800.png`
- 上架文案与合规资料 / listing and compliance docs
  - `docs/store-listing/`

当前品牌方向为：

Current brand direction:

- `PX` 双字母衬线体标志，红色底色 + 奶白字体，圆角方形 / `PX` serif lettermark on red accent (#ab3a2c) rounded square
- 奶白纸面、衬线字体、红色批注色 / warm cream paper, serif fonts, red annotation accent
- 零学习成本的交互文案：分步引导、操作导向、状态提示 / zero-learning-cost UI copy: step-by-step guidance, action-oriented, state-aware hints
- 交互打磨：平滑状态过渡（200ms）、按钮按压反馈、内联进度条、复制成功动画 / interaction polish: smooth state transitions (200ms), button press feedback, inline progress bar, copy success animation
- 无障碍支持：键盘焦点环、`aria-live` 状态播报、`prefers-reduced-motion` 适配 / accessibility: focus-visible rings, aria-live announcements, reduced-motion support

## Notes / 注意事项

- `chrome://` 之类的浏览器内部页面无法注入脚本。Chrome internal pages such as `chrome://` cannot be scripted.
- 插件按需申请站点权限，只在解析选中页面时请求对应 origin。The extension requests origin access on demand, only when you parse a selected site.
- 部分跨域 iframe 仍可能因为 Chrome 限制而被标记为跳过或失败。Some cross-origin iframes may still be marked as skipped or failed because Chrome can restrict frame injection even when the page itself is scriptable.
- 默认导出的是压缩后的 AI 友好结构，不会携带完整样式表源码。The collector stores compact AI-friendly structure and style summaries, not full stylesheet source.
- 结果里会对部分敏感属性做过滤，并去掉 `href` / `src` 中的 query 与 hash。Sensitive attributes are filtered, and exported `href` / `src` values have query strings and hashes removed.
- 结果以压缩形式保存在 `chrome.storage.session`（内存，浏览器关闭即清除），开始新一批时清除上一批。Results are kept compressed in `chrome.storage.session` (memory only, cleared when the browser closes); a new batch deletes the previous one.
- 后台 tab 不渲染，依赖滚动触发的懒加载内容可能缺失；需要完整内容时先切到该 tab 再提取。Background tabs don't render, so scroll-triggered lazy content may be missing; switch to the tab first when you need everything.
