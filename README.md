# TidyMarks

一个 Chrome 扩展（MV3）：用你自己配置的大模型分析、整理并安全写回 Chrome 原生书签。所有 AI 请求由扩展直接发往你配置的 OpenAI 兼容接口，不经过任何第三方服务器。

## 功能特性

### 书签扫描与预览

- 一键扫描整棵书签树（含书签栏、其他书签等系统根目录），统计书签与文件夹数量。
- 支持按文件夹选择本次整理范围；书签只读展示，选中父文件夹会包含其完整子树。

### 重复书签清理

- 扫描后自动识别三类重复：**相同 URL**、**相似 URL**（忽略 `www.`、末尾斜杠，同域且路径高度相似）、**相同标题**。
- 按组展示并可选择删除；每组强制至少保留一项，删除后自动重新扫描同步状态。

### AI 智能整理

- **自动生成分类目录**：AI 根据书签的标题与网址归纳出清晰的目录结构，可参考你已有的文件夹命名，一目了然。
- **逐条归类并说明理由**：每条书签都会被分入合适的目录，并附上一句话说明，方便检查。
- **随时暂停、断点续跑**：整理过程可随时中断，下次打开从上次进度继续，不重复消耗请求。

### 两种整理模式

| 模式 | 说明 |
| --- | --- |
| 重新规划 | 由 AI 重新设计目录结构（最多两级），可选**纯文字**或 **emoji 前缀**命名风格 |
| 保守整理 | 保留你现有的深层目录结构，只允许把书签移动到已存在的文件夹；目标文件夹缺失时跳过 |

### 预览、应用与撤销

- 应用前只读预览完整目录树和每条书签的归属。
- 所有书签写操作只发生在 Service Worker：应用前先建立**撤销快照**，再按需创建目录（幂等）、逐条移动，并清理所选范围内的空目录；支持随时中断、断点续跑、失败项重试。
- **一键撤销**最近一次整理：只移回仍遵守本次方案的书签（绝不覆盖你事后的手动调整），并删除本次新建的空目录；冲突逐条说明原因。

### 隐私与安全

- 模型配置（Base URL / API Key / 模型名）仅存于 `chrome.storage.local`；Base URL 仅支持 HTTPS。
- Dashboard 直连你配置的 API，无遥测、无自建服务器。
- 仅申请 `bookmarks`、`storage`、`favicon` 三项权限；访问模型 API 的 host 权限为可选授权。

## 运行要求

- Chrome 134+
- 任意 OpenAI 兼容的 Chat Completions 接口（需支持 `response_format: json_object`），例如 OpenAI、DeepSeek、Kimi、通义、本地 Ollama/LM Studio 等

## 开发

```bash
npm install

npm run dev        # 启动 WXT 开发模式（自动加载到 Chrome 并热更新）
npm run build      # 生产构建
npm run zip        # 打包为可分发的 zip
npm run typecheck  # TypeScript 类型检查
npm run test       # 运行 vitest 单元测试
```

技术栈：WXT 0.20 + React 18 + TypeScript + Chakra UI + Zod + Vitest。

## 架构速览

```
entrypoints/
  background.ts        # Service Worker：全部写操作与消息路由的唯一入口
  dashboard/           # 全页 React UI（设置 / 扫描 / 去重 / 选择范围 / 整理 / 预览 / 结果）
src/
  domain/              # 纯函数：目录树、重复检测、方案校验、状态机、撤销快照决策
  application/         # 用例：scanBookmarks / generatePlan / applyPlan / undoLastApply / deleteDuplicateBookmarks
  infrastructure/      # chrome.bookmarks / storage / 消息 / OpenAI 兼容客户端 / prompts
  shared/              # Zod Schema（存储与模型响应共用）、错误分类、消息协议
tests/                 # 内存适配器驱动的单元测试
```
