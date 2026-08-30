<div align="center">
  <img src="public/allweave-mark.svg" alt="Allweave" width="88" />
  <h1>Allweave</h1>
  <p><strong>在无限画布上编排文本、图像、音频与视频的开放式 AIGC 工作流。</strong></p>
  <p>第二届“燕缘·协创者号”AI+国际创业大赛 · AIGC 技术赛道</p>
</div>

## 项目简介

Allweave 是一个浏览器优先、无需登录的多模态 AI 创作工作台。创作者可以在无限画布上组合提示词、素材、模型节点和可复用工作流，把文案、图片、语音、音乐与视频生成串成一条可视化生产链路。

它不是只服务广告的单一工具。广告短片、数字人口播和音乐视觉只是内置模板；同一套画布与插件协议也可以扩展到教育内容、品牌出海、短剧、数字人和其他 AIGC 场景。

## AIGC 技术赛道方案

- **可视化多模态编排**：通过 Add、Transform、Combine 三类操作连接不同模态。
- **浏览器本地优先**：工作流、任务记录、作品信息与用户配置保存在浏览器 IndexedDB，不依赖登录和积分系统。
- **开放模型路由**：节点可以切换 OpenRouter、ToAPIs、Modal 及其他兼容插件，不与单一模型供应商绑定。
- **实时模型目录**：支持从服务商获取当前账号可用模型，避免模型列表长期写死。
- **可复用垂直模板**：内置商品广告、数字人口播、音乐视觉三条工作流，后续可以继续扩展行业模板。
- **可导入导出**：工作流使用开放 JSON 图结构，便于分享、迁移和二次开发。

## 内置工作流

| 工作流 | 主要链路 | 默认执行方式 |
| --- | --- | --- |
| 商品广告 · 竖屏短片 | 产品卖点 → 英文视觉创意 → 商品主视觉 → 竖屏视频 | OpenRouter + ToAPIs HTTP API |
| 数字人口播 · 产品介绍 | 主题 → 口播稿 → 人像与语音 → 数字人视频 | OpenRouter + 可替换 GPU 插件 |
| 音乐视觉 · MV 片段 | 主题 → 歌词与音乐 → 主视觉 → MV 片段 | OpenRouter + 可替换 GPU 插件 |

比赛演示优先使用第一条 API 工作流。它不需要下载模型权重，适合本地以及容器/VPS 线上 Demo；Vercel Serverless 执行端仍需改造成 TypeScript API 路由。后两条用于展示插件系统可以承载更复杂的开源模型工作流。

## 快速开始

需要 Node.js 20+、pnpm 10+ 和 Python 3.10+。

```bash
git clone https://github.com/Chozzc/Allweave.git
cd Allweave
pnpm install
pnpm plugins:install
pnpm dev
```

浏览器打开 `http://127.0.0.1:3000/workspace`。首次进入无需注册账号，可直接查看和编辑内置工作流。

## 配置 API

点击画布右上角的设置按钮填写密钥。配置会保存到当前浏览器，并同步给本地执行进程；密钥不会提交到 Git 仓库。

### 推荐的比赛演示配置

```text
OPENROUTER_API_KEY=...
TOAPIS_API_KEY=...
```

- OpenRouter 用于文本生成，也可以选择免费模型。
- ToAPIs 用于付费图像和视频生成，节点模型可在画布中切换。
- Modal 是可选的开源模型算力后端，不是运行 Allweave 的必要条件。

### 代理兼容

Allweave 不强制使用代理：没有配置代理时直接访问服务商；系统存在 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 或系统代理时，Modal 客户端会按标准代理设置连接。两种环境互不影响。

## 数据与隐私

- 不需要注册或登录。
- 画布草稿、工作流、任务历史、作品记录和配置由每个访问者的浏览器独立保存。
- 删除浏览器站点数据会清除本地内容，重要工作流请先导出 JSON。
- API 调用仍受所选服务商的隐私政策、内容规则与计费规则约束。

## 技术栈

- Next.js 15 + React 19
- React Flow 无限画布
- IndexedDB 浏览器持久化
- Python 插件 ABI 与可替换模型路由
- Vitest + TypeScript

## 当前状态

这是面向比赛的早期可运行原型。当前重点是无需登录的浏览器工作台、可复用工作流和多供应商执行链路；面向生产环境的队列隔离、密钥托管和多人协作仍在后续计划中。

## 开源与致谢

Allweave 基于 [TongFlow](https://github.com/tong-io/tongflow) 二次开发，保留其开放画布、插件 ABI 与 AGPL-3.0 授权。感谢 TongFlow 及相关开源模型、插件项目的贡献者。

本项目采用 [AGPL-3.0](LICENSE) 许可证。
