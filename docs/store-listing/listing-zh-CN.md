# Pagex Chrome Web Store 文案草案（中文）

## 商店基础信息

- 标题：`Pagex`
- 建议分类：`效率 / Productivity`
- 建议语言：`英文主版本 + 中文参考`

## 简短摘要

将网页结构、隐藏内容和样式相关文本提取为适合 AI 工作流的干净 JSON。

## 详细描述

Pagex 是一个用于把当前网页转换为结构化、适合 AI 处理的 JSON 的 Chrome 插件。

它适合需要把页面内容导入 AI、自动化流程或内部分析工具的人使用。相比手工复制原始 HTML，Pagex 更强调结构化提取、可展开内容处理、结果可控和默认安全过滤。

### Pagex 可以做什么

- 在 popup 中勾选一个或多个标签页，一次批量提取
- 自动展开常见折叠结构，例如 `details`、`aria-expanded="false"` 和基于 fragment 的 collapse 控件
- 通过滚动触发部分 lazy-loaded 内容
- 采集 DOM 与 shadow DOM，输出结构化 JSON
- 合并可访问 frame 的结果，并明确标记跳过或失败的 frame
- 过滤敏感属性，并移除导出 `href` / `src` 中的 query 和 hash
- 单页下载为 JSON，多页打包为一个 ZIP（每页一个 JSON），可选完成后自动下载
- 实时显示每个页面的进度，无法读取的页面给出易懂的原因，首次使用有快速上手引导
- 中英文界面，支持浅色与深色主题

### 为什么有用

- 比直接复制网页源码更适合 AI 输入
- 对隐藏内容和可展开内容支持更好
- 默认导出更紧凑，并带有安全过滤
- 全部在本地完成，以文件下载交付结果，控制感更强

### 输出内容亮点

导出的 JSON 可包含：

- 页面标题与 URL
- frame 元信息
- 元素标签与过滤后的属性
- 可见性与位置尺寸信息
- direct text 与 compact text 字段
- 样式摘要
- skipped frame、截断、预算上限等 warning

## 权限说明建议

- `activeTab`：让 Pagex 能处理当前所选页面
- `scripting`：向目标 tab 注入采集脚本
- `storage`：在 session storage 中保存批量任务状态和压缩后的结果（关闭浏览器即清除），并保存用户设置
- `tabs`：在 popup 中读取目标 tab 信息
- `webNavigation`：检查当前 tab 的 frame 覆盖情况
- 可选站点权限：首次提取或使用页面工具时请求一次，可在设置中撤销；安装时不授予

## 建议上传的截图

1. `store-assets/screenshots/pagex-screenshot-01-target-tab-1280x800.png`
2. `store-assets/screenshots/pagex-screenshot-02-parsing-1280x800.png`
3. `store-assets/screenshots/pagex-screenshot-03-parse-complete-1280x800.png`
4. `store-assets/screenshots/pagex-screenshot-04-copy-json-1280x800.png`

## 建议上传的宣传图

- small promo：`store-assets/promo/pagex-small-promo-440x280.png`
- marquee：`store-assets/promo/pagex-marquee-1400x560.png`

## 支持信息

- 支持页面：`https://github.com/host452b/pagex/issues`
- 官网：`https://github.com/host452b/pagex`
- 隐私政策地址：`https://github.com/host452b/pagex/blob/main/docs/store-listing/privacy-policy-zh-CN.md`
