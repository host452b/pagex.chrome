# Pagex 隐私政策（中文）

最后更新：`2026-11-11`

## 概述

Pagex 是一个 Chrome 插件，用于将用户勾选的一个或多个网页标签页提取为结构化 JSON，并提供整页截图与 Cookie 导出，全部在本地完成。

当前仓库中的产品行为如下：

- 页面解析在浏览器内完成
- 最近一批的提取结果以压缩形式存入扩展 session storage，浏览器关闭时自动清除
- 结果仅在用户点击下载，或开启「提取完成后自动下载」且 popup 打开时，才会保存为本地文件
- 插件不会把任何数据发送到远程服务器

## 我们可能处理的信息

当你使用 Pagex 时，插件可能处理：

- 目标页面的 URL 和标题
- 页面中的可见内容
- 可安全采集的隐藏内容和可展开内容
- DOM 结构、frame 元信息、经过过滤的属性和有限的样式摘要
- 扩展的 session 状态，例如批量任务状态、摘要信息和最近一批的结果
- 通过 Chrome tabs API 截取的可视区域截图
- 选中标签页的 cookies、localStorage 与 sessionStorage（仅在点击「导出 cookies.txt」时）

## 我们不主动收集的信息

Pagex 的设计目标之一，是避免默认收集不必要的敏感数据。

当前实现中：

- 默认只保留部分属性
- 会对敏感属性名进行脱敏处理
- 会移除导出 `href` / `src` 中的 query 和 hash
- 不会把提取结果、截图或 cookies 上传到远程后端

## 权限说明

Pagex 使用以下 Chrome 权限：

- `activeTab`
- `cookies`
- `scripting`
- `storage`
- `tabs`
- `webNavigation`
- 可选站点权限：默认仅在解析某个站点时按 origin 动态申请；也可在设置中一次性授权所有网站，并可随时关闭

这些权限用于：

- 获取目标 tab
- 注入页面采集脚本
- 检查 frame 覆盖情况
- 在 popup 中恢复 session 状态
- 按需请求目标站点访问权限

## 本地存储

Pagex 会把批量任务状态和最近一批的压缩结果存入扩展的 session storage（`chrome.storage.session`）。该存储位于内存中，浏览器关闭即清除；开始新一批提取时会删除上一批的结果。

这些本地数据用于：

- 在重新打开 popup 时恢复进度
- 展示 frame 数量、结果大小、warning 等摘要
- 保留最近一批结果，供用户下载或自动下载

此外，Pagex 会在 `chrome.storage.local` 中保存两项设置：是否自动下载、是否已关闭快速上手引导。这里不保存任何页面内容。

## 下载的文件

- 单页提取：`pagex-{主机与路径}-{时间}.json`
- 多页提取：`pagex-batch-{时间}.zip`，每个页面一个 JSON
- 整页截图：`pagex-screenshot-{主机与路径}-{时间}.png`
- Cookie 导出：`cookies-{主机}.txt`（包含 localStorage 与 sessionStorage）

## 数据共享

Pagex 默认不会将提取到的页面数据共享给远程服务。

如果未来版本加入远程处理、分析服务或云同步能力，必须在发布前同步更新本隐私政策以及 Chrome Web Store 的隐私字段。

## 用户可控项

你可以：

- 自行勾选需要解析的标签页
- 拒绝站点权限申请，或在设置中开启/关闭「允许读取所有网站」
- 在设置中关闭自动下载
- 随时停止正在进行的提取
- 随时卸载扩展

## 联系方式

- 开发者 / 组织：`host452b`
- 支持页面：`https://github.com/host452b/pagex/issues`
- 网站：`https://github.com/host452b/pagex`
