<p align="center">
  <img src="public/allweave-mark.svg" alt="Allweave mark" width="76" />
</p>

<h1 align="center">Allweave</h1>

<p align="center">
  <strong>一个浏览器优先的多模态 AIGC 工作流工作台，在无限画布上编排文本、图像、音频与视频。</strong>
</p>

<p align="center">
  无需登录 · 本地优先 · 开放工作流 · 可替换模型
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" />
  <img alt="IndexedDB" src="https://img.shields.io/badge/IndexedDB-browser--local-7952b3" />
  <img alt="CI" src="https://github.com/Chozzc/Allweave/actions/workflows/ci.yml/badge.svg" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-live-black?logo=vercel" />
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
</p>

## 项目概览

Allweave 面向希望把多个 AI 模型、素材和处理步骤组合成可复用生产链路的创作者。它以无限画布作为统一界面，让文本、图片、音频、视频和模型节点可以自由连接、调整、复用与导出。

项目不限定单一行业。商品广告、数字人口播和音乐视觉是当前内置的三条垂直示例工作流，同一套画布和节点协议还可以继续扩展到品牌出海、短剧、教育内容、数字人、社交媒体内容和其他 AIGC 场景。

Allweave 参加第二届“燕缘·协创者号”AI+国际创业大赛 **AIGC 技术赛道**。

## 在线体验

访问 [https://allweave.chozzc.dev](https://allweave.chozzc.dev)。

在线版本无需注册，打开后可以直接查看示例画布、编辑节点、保存浏览器本地草稿并体验工作流结构。当前 Vercel Demo 已完成页面、插件目录和工作流资源部署；完整的在线模型执行仍在从 Python 插件机制迁移到 Web 原生 API 适配器。

## 核心能力

- **无限画布编排**：拖拽组织节点，通过 Add、Transform、Combine 三类操作连接不同模态。
- **多模态工作流**：在一张画布中组合提示词、图片、语音、音乐、视频和模型调用。
- **浏览器本地优先**：画布文档、工作流草稿和 BYOK 设置由访问者自己的 IndexedDB 保存，无需账号系统。
- **开放图结构**：工作流可以导入、导出和分享，不绑定某一个模型厂商。
- **多供应商目录**：支持 OpenRouter、ToAPIs、OpenAI、Gemini、Runway、Modal 等插件或路由实现。
- **垂直模板**：内置商品广告、数字人口播和音乐视觉工作流，降低从空白画布开始的成本。
- **任务与作品入口**：保留任务历史、素材和作品集产品结构，为后续完整浏览器持久化继续演进。
- **双语界面**：工作区支持中英文切换。

## 内置工作流

| 工作流 | 目标 | 主要链路 | 当前默认实现 |
| --- | --- | --- | --- |
| 商品广告 · 竖屏短片 | 海外社媒商品广告 | 卖点 → 英文视觉创意 → 商品主视觉 → 竖屏视频 | OpenRouter + ToAPIs |
| 数字人口播 · 产品介绍 | 产品讲解与数字人内容 | 主题 → 口播稿 → 人像 → 语音 → 数字人视频 | OpenRouter + 可替换 GPU 插件 |
| 音乐视觉 · MV 片段 | 品牌音乐与视觉短片 | 主题 → 歌词 → 音乐 → 主视觉 → MV 片段 | OpenRouter + 可替换 GPU 插件 |

比赛演示优先使用商品广告工作流。它更适合迁移到标准 HTTP API，不依赖下载大型模型权重。数字人和音乐视觉工作流主要用于展示插件协议可以承载更复杂的开源模型能力。

## 插件与模型

Allweave 当前维护 47 个官方插件条目，覆盖文本、图像、视频、音频、音乐、文档和 3D 能力。

| 类型 | 示例 | 用途 |
| --- | --- | --- |
| 大模型路由 | OpenRouter、CometAPI、ToAPIs、API Mart | 聚合多个模型供应商和动态模型目录 |
| 官方 API | OpenAI、Gemini、DeepSeek、Runway、xAI、字节跳动 | 调用商业或兼容 API |
| 托管推理 | Modal、Replicate、fal | 运行开源图像、视频、语音、音乐和 3D 模型 |

### 当前插件形态

- 本地完整版可以通过 `pnpm plugins:install` 下载官方插件，并由 Python 执行进程扫描和运行。
- Vercel Demo 可以读取完整插件目录，但 Serverless 环境不适合在用户点击后临时克隆 Git 仓库、创建 Python 虚拟环境并长期保存。
- 比赛版下一阶段会把 OpenRouter、ToAPIs 等核心 API 路由改为随网站发布的 Web 原生执行器，进入网站后无需再安装。
- Modal 等 GPU 插件继续作为可选的远程算力后端，不会成为打开或编辑画布的前置条件。

## 数据与隐私

- 不需要注册或登录。
- 画布和浏览器设置保存在当前设备的 IndexedDB 中，不会自动同步到其他浏览器。
- API Key 采用 BYOK（自带密钥）模式，不会提交到 Git 仓库。
- 清除浏览器站点数据会删除本地草稿，重要工作流应先导出 JSON。
- Vercel Serverless 的临时任务数据库不作为用户长期存储；任务历史和作品集仍需继续迁移到 IndexedDB。
- 实际模型请求仍受对应供应商的隐私政策、内容规则和计费规则约束。

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- pnpm 10 或更高版本
- Python 3.10 或更高版本（仅完整本地插件执行需要）

### 浏览器 Demo

直接访问 [allweave.chozzc.dev](https://allweave.chozzc.dev)，无需创建账号。

### 本地开发

```bash
git clone https://github.com/Chozzc/Allweave.git
cd Allweave
pnpm install
pnpm dev
```

打开 [http://127.0.0.1:3000/workspace](http://127.0.0.1:3000/workspace)。

如需完整本地插件目录：

```bash
pnpm plugins:install
pnpm dev
```

## API 配置

在工作区右上角打开“设置”，填写对应服务商的 API Key。不同工作流只需要配置自己实际使用的服务商。

### 推荐的比赛演示配置

```env
OPENROUTER_API_KEY=...
TOAPIS_API_KEY=...
```

- **OpenRouter**：用于文本生成和模型路由，可选择免费模型。
- **ToAPIs**：用于图像和视频 API，适合无需下载权重的在线演示。
- **Modal**：可选的开源模型算力平台，需要 Modal Token；不是运行 Allweave 的必要条件。

Allweave 不强制使用代理。未配置代理时直接访问供应商；存在标准 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY` 时，本地执行进程可以使用对应代理。

## Vercel 部署

仓库包含 `vercel.json`，Vercel 会按 Next.js 项目构建。生产环境使用以下可写临时目录：

```env
TONGFLOW_DATA_DIR=/tmp/allweave-data
```

`config/`、`drizzle/`、`sdk/` 和插件图标已通过 Next.js Output File Tracing 加入 Serverless Function。浏览器持久数据仍由 IndexedDB 负责。

## 技术架构

```text
Browser
├── React 19 + Next.js 15
├── React Flow 无限画布
├── IndexedDB 工作区与 BYOK 设置
└── 工作流导入 / 导出
        │
        ▼
Workflow Core
├── TongFlow ABI
├── 节点注册与连接校验
├── 自动布局与执行图导出
└── 三条内置垂直工作流
        │
        ▼
Execution Providers
├── Web 原生 API 适配器（迁移中）
├── Python 插件（本地完整版）
└── Modal / Replicate / fal 等远程算力
```

## 当前进度

### 已完成

- Allweave 品牌、图标和无需登录的工作区入口。
- 浏览器 IndexedDB 画布保存与 BYOK 设置。
- 商品广告、数字人口播、音乐视觉三条内置工作流。
- OpenRouter 动态模型目录和多供应商插件清单。
- 去除积分、账单、社群广告等商业 SaaS 外壳。
- GitHub、比赛仓库、CI 和 Vercel 自定义域名部署。
- Vercel 运行资源、数据库迁移和插件目录打包。

### 下一阶段

1. 将 OpenRouter、ToAPIs 等比赛核心插件内置为 Web 原生执行器，取消在线安装步骤。
2. 把任务历史、作品集、素材和用户配置全部迁移到 IndexedDB。
3. 为三条示例工作流补齐可稳定运行的默认节点、错误提示和演示素材。
4. 增加首页、模板入口和自然语言工作流助手。
5. 增加工作流分享、导入预览和模板市场能力。
6. 完成移动端适配、性能优化、异常恢复和端到端测试。

## 常见问题

### 1. 使用 Allweave 必须登录吗？

不需要。在线 Demo 和本地版本都可以直接进入工作区。

### 2. 不配置 API Key 可以使用吗？

可以查看、编辑、保存和导出工作流；真实生成文本、图片、音频或视频时，需要相应服务商的 API Key 或 Modal Token。

### 3. 为什么在线版插件目录存在，但仍显示“安装”？

目录和实际执行代码是两层。当前插件实现主要面向本地 Python 运行时，在线版的 Web 原生执行器仍在迁移。不能通过把按钮改成“已安装”来替代真实执行能力。

### 4. 数据保存在哪里？

画布和浏览器设置保存在当前浏览器的 IndexedDB。服务器端临时任务数据不保证跨 Vercel 实例长期保留。

### 5. 可以更换模型供应商吗？

可以。节点通过插件 ID 和模型 ID 选择实现，工作流图结构不绑定某一个供应商。

### 6. Modal 是必须的吗？

不是。Modal 用于运行部分开源 GPU 模型；使用 OpenRouter、ToAPIs 或其他 HTTP API 时可以完全不配置 Modal。

## 项目结构

```text
.github/                 GitHub Actions、Dependabot 与仓库自动化
config/                  官方插件清单
drizzle/                 本地任务数据库迁移
packages/tongflow/       工作流核心、画布能力与 ABI
public/plugins/          官方插件图标
scripts/                 插件安装、ABI 生成和发布脚本
sdk/                     Python 插件 SDK
src/app/                 Next.js 页面与 API 路由
src/components/          画布、节点、设置与工作区界面
src/lib/                 工作流模板、浏览器存储、插件与任务逻辑
vercel.json              Vercel 框架配置
```

## 开源致谢

Allweave 基于 [TongFlow](https://github.com/tong-io/tongflow) 二次开发，保留其开放画布、插件 ABI 和工作流核心。感谢 TongFlow、相关开源模型、插件项目及其贡献者。

## 许可证

Allweave 按 [GNU Affero General Public License v3.0](LICENSE) 发布。通过网络提供修改后的版本时，请遵守 AGPL-3.0 的源码开放要求。
