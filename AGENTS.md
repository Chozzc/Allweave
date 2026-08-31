# Allweave 项目交接与开发约束

> 最后核对：2026-08-31。本文是后续 Codex 对话的项目事实来源。开始工作前仍需用代码、Git 历史和线上状态复核可能变化的内容，不得仅凭聊天摘要推断项目现状。

## 1. 项目定位

Allweave 是基于 [TongFlow](https://github.com/tong-io/tongflow) 二次开发的浏览器优先多模态 AIGC 工作流工作台，使用无限画布编排文本、图像、音频、视频及模型节点。

项目参加第二届“燕缘·协创者号”AI+国际创业大赛 **AIGC 技术赛道**。

Allweave 是通用产品名，不能把产品定位缩窄成“广告生成器”。商品广告只是三条内置演示工作流之一；产品仍应支持数字人、音乐视觉、短剧、品牌出海、教育内容及其他多模态工作流。

## 2. 用户已经明确确定的产品要求

以下决定已经讨论并确认，除非用户明确改变要求，否则不要重新提议相反方案：

1. 使用 TongFlow 作为主项目继续开发；Loomic 仅作为首页、Agent 对话等交互设计参考。
2. 品牌名为 **Allweave**，使用自有名称与图标。
3. 最终形态必须是打开网址即可演示的 Web 产品。
4. 线上地址是 <https://allweave.chozzc.dev>，只能使用该子域名，不得替换或接管 `chozzc.dev` 主域名。
5. 不需要登录、注册、积分、账单、订阅或社群广告。
6. 不使用 Supabase 作为当前产品存储；采用浏览器 IndexedDB 本地优先架构。
7. 工作流、画布草稿、任务历史、执行结果、素材、作品集、收藏状态和用户配置都必须保留，不能因为去掉服务端账号系统而删除。
8. API Key 使用 BYOK 模式，由每个访问者自行配置并存储在其浏览器中，不得提交到仓库。
9. 保留并完善三条示例工作流：商品广告/基础图像、数字人口播、音乐视觉/MV。
10. 产品不能只有空白画布，应内置示例工作流和垂直模板。
11. 原作者提供的官方插件目标是 **全部随网站内置**，访问者不应再逐个点击安装。
12. “插件内置”与 OpenRouter、Modal、ToAPIs 等服务配置是两件事。后者只是插件可能调用的模型或算力服务，不能拿“配置 OpenRouter”替代“内置全部插件”。
13. OpenRouter 等模型聚合插件应能获取动态模型目录，不能长期依赖作者写死的旧模型列表。
14. 正式演示可以使用付费 API；不得要求访问者开启代理，也不得因为开发者本机有代理而破坏无代理访问。
15. README 的完整程度应参考 <https://github.com/Chozzc/Lujie-Careerkit>，包含多张图片、项目定位、功能、架构、运行和部署说明。
16. 代码需同时维护 GitHub 仓库和比赛仓库。

## 3. 仓库与部署

- 本地项目：当前 `AGENTS.md` 所在目录。
- GitHub：<https://github.com/Chozzc/Allweave>
- 比赛仓库：`ssh://hackforger@www.synnovator.com/chozzc/Allweave.git`
- 上游 TongFlow：<https://github.com/tong-io/tongflow>
- 生产网站：<https://allweave.chozzc.dev>
- Vercel 项目：`allweave`

本地 Git remote：

- `origin`：GitHub
- `competition`：比赛仓库
- `upstream`：TongFlow 上游，仅用于读取和同步；它不代表 GitHub 仓库仍是 fork。GitHub 上 `Chozzc/Allweave` 当前是独立仓库，`isFork: false`。

提交功能改动后通常需要推送：

```bash
git push origin main
git push competition main
```

不要擅自 force-push、删除分支、合并 Dependabot PR 或覆盖用户改动。

## 4. 当前已经完成的内容

- Allweave 品牌、图标和无需登录的工作区入口。
- 左上角品牌区域已去掉用户不喜欢的白色胶囊外壳。
- 部署到 Vercel 和 `allweave.chozzc.dev` 子域名。
- GitHub 与比赛仓库均已建立并推送。
- 去除/隐藏积分、账单、社群广告等商业 SaaS 外壳。
- IndexedDB 本地持久化。
- 三条内置工作流模板。
- OpenRouter 动态模型目录相关改造。
- Vercel Serverless 运行资源打包修复；`config/`、`drizzle/`、`sdk/`、`public/plugins/` 已加入 Next.js output file tracing。
- README 已扩充，并引用上游 TongFlow 的基础图像、数字人和 MV 示例图；引用处已经注明来源。
- 仓库曾执行密钥扫描，结果为 0；后续每次发布前仍需再次检查。

截至本文创建前的最新提交是 `a2e349a`，后续应以 `git log` 为准。

## 5. IndexedDB 的真实状态

不要再把任务、素材或作品集列为“尚未迁移”。它们已经迁移。

主要实现：`src/lib/browser-storage.ts`

- 数据库名：`allweave`
- 当前版本：`2`
- Object stores：
  - `workflows`
  - `workspace`
  - `tasks`
  - `materials`
  - `settings`

关键调用方：

- `src/lib/api/workspace.ts`：浏览器工作流保存、读取和更新。
- `src/components/workspace/workspace-left-nav.tsx`：读取任务历史。
- `src/components/workspace/portfolio-dialog.tsx`：读取素材/作品集。
- 工作流执行 hook：保存任务事件和生成素材。
- `src/components/workspace/settings/use-env-settings.ts`：保存浏览器 BYOK 配置。

服务端临时任务数据库仍可作为执行过程中的兼容层或中转层，但不能被描述为用户长期数据源。不要为了“纯前端”口号直接删除它，除非已经追踪并替换所有执行调用方。

清除浏览器站点数据会删除本地 IndexedDB 内容；重要工作流依靠 JSON 导出备份。

## 6. 内置工作流

定义位置：`src/lib/workflow-templates.ts`

当前模板 key：

- `product-commercial`：商品广告/基础图像与竖屏内容。
- `digital-presenter`：数字人口播/产品介绍。
- `music-video`：音乐视觉/MV 片段。

这些工作流已经存在，但“模板存在”不等于“所有节点已经在线稳定执行”。修改时必须逐条进行真实端到端测试，不能只验证画布能打开。

比赛演示至少应形成一条无需安装插件、配置有效 API Key 后可稳定从输入运行到可见结果的完整链路；随后再验证另外两条。

## 7. 插件：最重要的未完成事项

### 已确认事实

- 本地 `plugins/` 已安装 47 个官方插件。
- 官方清单在 `config/official-plugins.json`。
- 安装脚本是 `scripts/install-official-plugins.mjs`，命令为 `pnpm plugins:install`。
- 本地插件约 2.3 MB、693 个文件；每个插件当前都是带独立 `.git` 的嵌套仓库。
- 根 `.gitignore` 明确忽略 `/plugins/*`，只保留 `.gitkeep`。
- 因此这 47 个插件虽然在本地存在，却没有进入 GitHub 和 Vercel。
- 网站当前显示“安装”，不是因为官方清单缺失，而是实际插件目录没有随部署发布。

### 不能做的假修复

- 不能只把按钮文字改成“已安装”。
- 不能仅把插件图标或 manifest 打包后宣称完整插件已内置。
- 不能把 OpenRouter/ToAPIs 配置说成全部插件内置。
- 不能把本地存在的 `plugins/` 误写成线上已经存在。

### 技术阻塞

当前插件执行架构会通过 Node `spawn(...)` 启动 Python：

- `src/lib/plugin-executor/runners/generic.ts`
- `src/lib/task/engine-delegate.server.ts`
- `src/lib/plugins/plugins-scanner.server.ts`
- `src/lib/plugins/plugin-python-env.server.ts`

Vercel 的 Next.js Serverless 环境不能按当前方式可靠地创建 Python 虚拟环境、安装依赖并持久运行 47 个插件。仅把源码提交进仓库只能解决“目录和节点随站点出现”，不能自动解决真正执行。

### 目标架构

需要同时完成以下两层，才叫“插件内置”：

1. **内置目录层**
   - 47 个官方插件的许可、版本、commit/来源必须可追踪。
   - 构建时生成稳定的插件 registry、节点 ABI、环境变量声明和模型目录。
   - 网站直接展示内置插件，不要求用户克隆或安装。
   - 托管版隐藏或禁用安装/卸载入口，本地开发版可继续保留插件管理能力。

2. **在线执行层**
   - 纯 HTTP API/router 插件可以改成 Vercel 可执行的服务器适配器。
   - Modal 等 GPU 插件应调用已经部署的远程函数或独立运行端，不能在 Vercel 请求期间下载权重。
   - 如果要保持 Python 插件原样，需要独立 Python worker/服务，而不是假设 Vercel Next.js Function 有完整 Python 运行时。
   - 用户密钥继续从浏览器 BYOK 配置安全传入执行请求；不得写入 Git。

在选择 vendoring、构建时下载或独立 worker 前，先审查 47 个插件各自的许可证。不要删除嵌套 `.git` 或大批复制第三方源码，除非已经确认许可、目标目录和回滚方式。

## 8. 已知部署事实和故障历史

- 生产环境需要可写临时目录：`TONGFLOW_DATA_DIR=/tmp/allweave-data`。
- 曾出现插件接口 `Request failed: 500`，根因之一是 Vercel function 未包含运行时读取的资源。
- `next.config.ts` 已通过 `outputFileTracingIncludes` 加入：
  - `config/**/*`
  - `drizzle/**/*`
  - `sdk/**/*`
  - `public/plugins/**/*`
- 修复后曾验证：官方插件列表、插件更新检查和任务 pending API 返回 200。
- 这只修复了“资源缺失导致的 500”，没有完成 47 个插件源码和 Python 执行端的线上部署。
- Modal 曾出现 Token missing、无法连接服务器、长时间下载权重等错误。不要让 Modal 成为网站打开、编辑或保存的前置条件。
- 访问者没开代理时也必须能正常使用网站；代理只能是开发者/用户的可选网络配置。

## 9. GitHub 状态说明

GitHub 曾显示 7 个 Pull Request 和 8 个分支：

- 1 个 `main`。
- 7 个 Dependabot 更新分支及对应 PR。
- 这些 PR 不是陌生人提交，也不是数据泄露；是仓库的 Dependabot 自动创建。
- 当时多个 PR 的 Lint 检查失败，因此未合并。

新对话开始时应重新查询当前状态。不要因为旧记录写着 7 就假设数量没有变化。

GitHub 的 “Your main branch isn't protected” 是安全建议，不是构建错误。是否开启分支保护由用户决定，不要擅自改变仓库策略。

## 10. 密钥和安全规则

- 不得提交 `.env`、`.env.local`、Modal Token、OpenRouter Key、ToAPIs Key 或其他凭据。
- `.gitignore` 已忽略 `.env*`，只允许 `.env.example`。
- 提交前至少检查：

```bash
git status --short
git diff --cached
git grep -n -I -E "(sk-[A-Za-z0-9_-]{12,}|MODAL_TOKEN_(ID|SECRET)=.+|API_KEY=.+)" -- . ":(exclude).env.example"
```

- 不要在命令输出、README、截图或最终回复里回显用户密钥。
- 浏览器 BYOK 存储与服务端执行之间属于信任边界，新增接口时必须验证输入、限制日志并避免把密钥写入任务结果。

## 11. 后续开发计划

### P0：让比赛网站真正可演示

1. 设计并实现 47 个官方插件的内置打包方案，先完成许可证与版本锁定。
2. 托管版不再要求逐个安装插件；插件目录、节点 ABI 和环境变量说明打开即用。
3. 确定在线执行架构：Vercel HTTP 适配器 + 远程 GPU 服务，或单独 Python worker。
4. 选择一条比赛主工作流，从输入、模型选择、缺失 Key 提示、执行、结果展示、任务记录到作品集进行端到端验证。
5. 修复所有无法点击、灰色按钮、旧模型 ID、错误 Key 判断、500 和长时间无反馈问题。
6. 验证无代理网络环境；错误提示必须告诉用户失败在哪一层，不能只显示 `Request failed: 500`。

### P1：完善三条模板和演示内容

1. 逐条跑通商品广告、数字人口播、音乐视觉/MV。
2. 为每条工作流提供默认输入、模型建议、预计耗时、费用提示和可见示例结果。
3. 增加真正由 Allweave 运行得到的截图/作品；在此之前，上游图片必须继续明确标注来源。
4. 完善任务历史、失败重试、素材收藏、作品导出和异常恢复。
5. 确认 IndexedDB 升级逻辑不会破坏已有用户数据。

### P2：产品化增强

1. 增加独立首页和模板入口，可参考 Loomic 的 Agent 对话式视觉，但不要直接复制其业务、账单或半开源服务依赖。
2. 增加自然语言工作流助手：根据用户意图创建或修改画布节点；这不是当前比赛提交的硬性前置条件。
3. 增加工作流分享、导入预览和模板市场。
4. 移动端适配、首屏性能、画布大图性能、可访问性和端到端测试。

## 12. 每次改动的最小验证

遵循少改、复用和根因修复原则。先追踪真实调用链，再改共享根因；不要为一个页面重复打补丁。

根据改动范围运行最小充分检查：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果完整命令名称有变化，先查看 `package.json`，不要凭记忆编造。

涉及 IndexedDB 时至少验证：创建工作流、刷新恢复、任务写入、生成素材、收藏切换和作品集读取。

涉及插件时至少验证：官方目录、registry、模型目录、缺失 Key 提示、执行请求、成功输出和失败错误。

涉及 Vercel 时除了构建成功，还要在生产域名验证实际 API 和完整用户流程。不能把“部署成功”当作“功能可用”。

## 13. 与用户沟通时必须避免的错误

- 不要声称用户没有提过某项要求；先搜索代码、Git 历史和本文。
- 不要根据压缩聊天摘要判断“已经迁移/尚未迁移”。
- 不要混淆本地安装、仓库包含、Vercel 打包和线上可执行四种状态。
- 不要把某个 API 服务商等同于插件系统。
- 不要重复建议登录、Supabase、积分或账单系统。
- 不要未经验证就说“已经修好”或“全部可以用”。
- 发现此前表述错误时，直接说明事实、证据和修正，不要用模糊措辞掩盖。

## 14. 开始新对话后的第一步

先执行并阅读：

```bash
git status --short --branch
git log -10 --oneline
git remote -v
```

然后根据任务读取直接相关的实现文件。若任务涉及项目现状，优先以代码和实际线上测试为准，并用本文补充产品决策背景。

