# 分 P 开发计划

本文档用于监督占星教学视频生成工具的开发进度。项目按 P0、P1、P2 等阶段推进，每个阶段都必须有明确交付物和验收标准。

相关架构文档：

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md)

## 1. 总原则

### 1.1 开发主线

项目主线是：

```txt
无限画布是主工作台
+ 每条视频独立生成
+ 公共资源库持续复用
+ 模板库持续沉淀
+ Remotion 稳定渲染
```

画布不是后期增强功能，而是第一版就要成立的核心体验。MVP 的画布可以简单，但主题、文案、分镜、字幕、配音、素材、预览、导出都必须以可见节点的形式存在。

重要产品规则：画布节点必须按用户操作渐进生成，不能在新建项目时一次性铺满完整流程。新项目默认只创建主题节点；用户在主题节点点击生成文案后才出现文案节点；用户修改文案节点后点击生成分镜才出现分镜节点；字幕、配音、星盘、插画、D3、Three、预览和导出节点也都必须由对应上游节点动作逐步创建。

### 1.2 核心流程

标准视频生成流程：

```txt
新建视频
-> 画布只创建主题节点
-> 在主题节点点击生成文案
-> 创建文案节点
-> 用户编辑文案
-> 在文案节点输入分镜数量并点击生成分镜
-> 创建对应数量的分镜节点
-> 在每个分镜节点上逐步生成字幕、配音、星盘、插画、D3、Three 等资源节点
-> 复用资源库素材或生成缺失素材
-> 资源准备后创建画面合成节点
-> 创建 Remotion 预览节点
-> 创建导出节点并导出视频
-> 可复用素材入库
```

### 1.3 可调节对象

画布上展示的对象必须是人能调节的生产对象，而不是静态展示卡片。

第一版至少支持这些可调项：

- 文案正文
- 分镜数量
- 分镜顺序
- 分镜时长
- 字幕位置高低
- 字幕字号和颜色
- 配音音色或 voice profile
- 配音语速
- 配音音量
- 素材替换
- 单个素材重生成
- 单个分镜重新合成

### 1.4 阶段验收规则

每个 P 阶段完成时，必须满足：

- 有可运行或可查看的交付物
- 有清晰的文件或页面入口
- 有基本验证方式
- 文档同步更新
- 未完成项明确记录

### 1.5 状态标记

```txt
Not Started  尚未开始
In Progress  进行中
Blocked      阻塞
Done         完成
Skipped      暂缓
```

## 2. 总进度表

| 阶段 | 名称 | 目标 | 状态 |
|---|---|---|---|
| P0 | 项目骨架与基础约定 | 初始化工程结构和核心文档 | Done |
| P1 | 核心数据模型 | 定义视频、画布、资源库、任务 schema | Done |
| P2 | 最小无限画布 | 能在画布上创建和编辑核心节点 | Done |
| P3 | 静态视频预览闭环 | 用画布/spec 驱动 Remotion 预览 | Done |
| P4 | 项目与资源库 | 支持项目 CRUD、资源引用和复用 | Done |
| P5 | 任务系统 | 支持生成任务、状态、失败重试 | Done |
| P6 | AI 文案与分镜 | 接入 LLM 生成文案和自定义数量分镜 | In Progress |
| P7 | TTS、星盘与素材生成 | 生成配音、字幕、星盘、图片素材 | In Progress |
| P8 | 高级视觉与桌面化 | Three.js、D3、桌面壳、批量生产 | In Progress |

## 3. P0：项目骨架与基础约定

### 目标

建立可持续开发的工程底座，不做复杂业务功能。

### 交付物

- pnpm monorepo
- Next.js Web 应用骨架
- TypeScript 配置
- lint / format 基础配置
- 基础目录结构
- 架构文档、技术架构文档、分 P 计划文档

### 任务清单

- [x] 初始化 `package.json`
- [x] 初始化 `pnpm-workspace.yaml`
- [x] 创建 `apps/web`
- [x] 创建 `packages/core`
- [x] 创建 `packages/remotion-video`
- [x] 创建 `packages/renderers`
- [x] 创建 `packages/db`
- [x] 创建 `packages/providers`
- [x] 创建 `apps/web/features/canvas`
- [x] 配置 TypeScript path
- [x] 配置 lint / format
- [x] 配置基础 README

### 验收标准

- 可以安装依赖
- 可以启动 Web dev server
- 可以通过 TypeScript 检查
- 项目目录与技术架构文档一致

## 4. P1：核心数据模型

### 目标

把数据契约定稳，让画布、AI、资源库、任务和视频渲染围绕同一套 schema 工作。

### 交付物

- `VideoProject` schema
- `CanvasDocument` schema
- `CanvasNode` schema
- `CanvasEdge` schema
- `AstroVideoSpec` schema
- `SceneSpec` schema
- `LibraryAsset` schema
- `ProjectAssetRef` schema
- `Job` schema
- mock 数据

### 任务清单

- [x] 定义 `VideoProject`
- [x] 定义 `CanvasDocument`
- [x] 定义 `CanvasNode`
- [x] 定义 `CanvasEdge`
- [x] 定义 `AstroVideoSpec`
- [x] 定义基础 `SceneSpec`
- [x] 定义 `TextSceneSpec`
- [x] 定义 `AstroChartSceneSpec`
- [x] 定义 `SketchSceneSpec`
- [x] 定义 `D3DiagramSceneSpec`
- [x] 定义 `ThreeSceneSpec`
- [x] 定义 `LibraryAsset`
- [x] 定义 `ProjectAssetRef`
- [x] 定义 `Job`
- [x] 使用 Zod 做运行时校验
- [x] 增加 1 个示例画布项目 JSON

### 验收标准

- mock 项目 JSON 可以通过 schema 校验
- 画布节点能引用文案、分镜、素材、任务和导出结果
- scene 类型可扩展
- 项目资源和资源库资源可以通过 `ProjectAssetRef` 区分

## 5. P2：最小无限画布

### 目标

先做一个能承载完整生成流程的最小画布。它不需要复杂白板功能，但必须能看见、选择和调整核心生产节点。

### 交付物

- tldraw 或等价画布基础接入
- 画布页面
- 主题节点
- 文案节点
- 分镜计划节点
- 分镜节点
- 字幕节点
- 配音节点
- 素材节点
- 预览节点
- 导出节点
- 画布保存和恢复

### 任务清单

- [x] 接入等价轻量画布
- [x] 创建 `/studio/:projectId` 画布页面
- [x] 实现主题节点
- [x] 实现文案节点
- [x] 实现分镜计划节点
- [x] 实现分镜节点
- [x] 实现字幕节点
- [x] 实现配音节点
- [x] 实现素材节点
- [x] 实现预览节点
- [x] 实现导出节点
- [x] 实现节点连线
- [x] 实现画布保存
- [x] 实现画布恢复
- [x] 实现节点选中后的属性面板

### 验收标准

- 用户可以在画布上看到一条视频的完整生产流程
- 用户可以新增和选择节点
- 用户可以编辑文案节点内容
- 用户可以设置分镜数量
- 用户可以调节字幕节点的高低
- 用户可以调节配音节点的音量或语速
- 刷新页面后画布能恢复

## 6. P3：静态视频预览闭环

### 目标

不接 AI，不接真实 TTS，先证明画布/spec 可以驱动 Remotion 渲染一条视频。

### 交付物

- Remotion Root
- timeline 计算
- 3 个基础 scene renderer
- 画布节点到 `AstroVideoSpec` 的转换
- 静态预览
- MP4 导出命令

### 任务清单

- [x] 创建 Remotion Composition
- [x] 实现 timeline 计算
- [x] 实现 `text` renderer
- [x] 实现 `astro-chart` mock renderer
- [x] 实现 `sketch` mock renderer
- [x] 实现画布节点到 scene spec 的同步
- [x] 支持竖屏 1080x1920
- [x] 支持字幕层
- [x] 支持音频占位
- [x] 支持本地 still frame 检查
- [x] 支持 MP4 导出

### 验收标准

- 可以从画布生成 30 秒视频 spec
- 至少有 3 个场景
- 可以看到标题、字幕、星盘 mock、插画 mock
- 画布上调字幕高低会影响预览
- 可以导出 MP4

## 7. P4：项目与资源库

### 目标

实现「每条视频独立生成，但资源库可复用」的基础能力。

### 交付物

- 文件型 JSON store（保留 SQLite schema 草案）
- 项目 CRUD
- 资源库 CRUD
- 项目资源引用
- 默认占星教学资源包

### 任务清单

- [x] 建立持久化 store（当前为 JSON 文件，SQLite schema 草案保留）
- [x] 实现 `video_projects` 存储
- [x] 实现 `canvas_json`
- [x] 实现 `project_assets` 存储
- [x] 实现 `library_assets` 存储
- [x] 实现 `project_asset_refs` 存储
- [ ] 实现 `scene_templates` 表
- [ ] 实现 `style_presets` 表
- [x] 实现项目列表页面
- [x] 实现新建项目页面
- [x] 实现资源库页面
- [x] 实现默认资源包导入
- [x] 支持项目引用 library asset

### 验收标准

- 可以创建第一条视频项目
- 可以创建第二条视频项目
- 第二条视频可以引用第一条沉淀到资源库的资产
- 项目独有资源和公共资源不会混淆
- 画布节点可以显示资源来自项目还是资源库

## 8. P5：任务系统

### 目标

建立生成任务机制，为 AI、TTS、图片生成、星盘生成和视频导出做准备。任务状态必须能回写到画布节点。

### 交付物

- `jobs` 存储
- 同步 job runner / worker batch runner
- job runner
- 状态更新
- 失败重试
- 画布节点状态同步

### 任务清单

- [x] 实现 `jobs` 存储
- [x] 为 job 增加 `canvas_node_id`
- [x] 实现 job 创建 API
- [x] 实现 worker 批量执行入口
- [x] 实现 `pending/running/succeeded/failed/cancelled` 状态枚举
- [x] 实现 job 输入输出记录
- [x] 实现错误记录
- [x] 实现 retry
- [x] 实现 cancel
- [x] 前端画布显示任务状态

### 验收标准

- 可以从某个画布节点创建 mock job
- worker 可以执行 job
- UI 可以看到节点状态变化
- 失败任务可以从节点上重试

## 9. P6：AI 文案与分镜

### 目标

接入 LLM，让系统可以从主题生成文案，再根据文案和用户指定数量生成分镜。

### 交付物

- LLM provider adapter
- `generate-script` job
- `generate-storyboard` job
- 文案节点编辑
- 分镜数量控制
- 分镜节点生成

### 任务清单

- [x] 定义 LLM provider 接口
- [x] 实现第一个 LLM provider（DeepSeek，缺环境变量时 mock fallback）
- [x] 设计 script schema
- [x] 设计 storyboard schema
- [x] 实现 `generate-script`
- [x] 将文案结果写入文案节点
- [x] 改为由主题节点触发并按需创建文案节点，而不是依赖预置 `node-script`
- [x] 实现分镜数量输入
- [x] 实现 `generate-storyboard`
- [x] 按数量生成 scene nodes
- [x] 改为由文案节点触发并创建分镜节点，而不是依赖预置 storyboard 节点
- [x] 增加 Zod 校验
- [ ] 增加失败自动重试策略
- [x] 支持用户手动编辑文案和基础分镜属性

### 验收标准

- 输入主题后可以生成文案节点
- 用户可以编辑文案节点
- 用户可以指定分镜数量
- 确认文案后可以生成对应数量的分镜节点
- 分镜可以保存到 `AstroVideoSpec.scenes`
- AI 输出不合格时不会污染正式项目数据

## 10. P7：TTS、星盘与素材生成

### 目标

让分镜变成真实可渲染素材，并在画布上可见、可替换、可重生成。

### 交付物

- TTS provider
- 字幕生成
- 星盘 SVG 生成
- 图片生成 provider
- `resolve-assets` job
- `generate-assets` job
- 资源节点状态

### 任务清单

- [x] 定义 TTS provider 接口
- [x] 实现 TTS 生成适配（RunningHub/IndexTTS CLI，缺环境变量时 mock fallback）
- [x] 保存旁白音频
- [x] 生成配音节点
- [ ] 改为从分镜节点按需创建/更新配音节点，而不是依赖预置 voice 节点
- [x] 将 TTS 音频资产写入 `AstroVideoSpec.audio.tracks`
- [x] 将旁白音频接入 Remotion `<Audio>` 导出
- [x] project asset API 支持音视频 `Range` 请求
- [x] 生成 scene 级字幕
- [x] 生成字幕节点
- [ ] 改为从分镜节点按需创建/更新字幕节点，而不是依赖预置 caption 节点
- [x] 将字幕 cue 时间轴接入 Remotion CaptionLayer
- [x] 优先读取 TTS/RunningHub manifest 生成字幕 cue 时间轴，缺失时间戳时回退到估算
- [x] 支持字幕高低调节写回 spec
- [x] 定义 astrology / chart provider 接口
- [x] 实现星盘数据 mock
- [x] 接入 AstroChart SVG 生成
- [x] 接入出生资料到星盘数据计算（astronomy-engine 行星黄经 + 本地上升/等宫宫头）
- [x] 将生成的 AstroChart SVG 接入 Remotion 星盘场景
- [ ] 改为从分镜节点按需创建/更新星盘节点，而不是依赖预置 chart 节点
- [x] 定义 image provider 接口
- [x] 实现图片生成或 mock
- [x] 将生成的 image/sketch 资产接入 Remotion SketchScene
- [ ] 改为从分镜节点按需创建/更新插画节点，而不是依赖预置 image 节点
- [x] 实现 `resolve-assets`
- [x] 自动复用 library assets
- [x] 缺失素材生成 project assets
- [x] 支持素材入库
- [x] 建立 tldraw 兼容层：CanvasDocument 可导出/写回 tldraw shape snapshot，但暂不替换现有画布 UI
- [x] 接入真实 tldraw Editor MVP：可打开项目节点、移动节点、同步回 CanvasDocument

### 验收标准

- 一条视频可以生成旁白音频
- 画布上可以看到配音、字幕、星盘、图片资源节点
- 可以生成或加载星盘 SVG
- 可以为缺失插画创建生成任务
- 可以替换或重生成单个素材节点
- 第二条视频可以复用已有片头、字幕样式、BGM、星盘样式等资源
- 字幕时间轴可以优先跟随 TTS manifest，并在无精确时间戳时稳定回退
- CanvasNode 与未来 tldraw shape 的映射规则明确，现有生成链路不被 tldraw 内部状态绑定
- `/tldraw?projectId=...` 可以渲染真实 tldraw 画布，并把节点位置变更保存回项目

## 11. P8：高级视觉与桌面化

### 目标

提高视频表现力，并为长期生产和本地工具化做准备。

### 交付物

- Three.js scene renderer
- D3 scene renderer
- GSAP 标注动画
- 多套模板
- 批量生成
- 桌面壳调研或原型

### 任务清单

- [ ] 实现 Three.js 星体空间场景
- [ ] 实现 D3 知识关系图场景
- [ ] 实现 D3 时间线场景
- [ ] 实现星盘高亮动画
- [ ] 实现手绘标注动画
- [ ] 增加模板库管理
- [ ] 支持批量创建视频项目
- [ ] 调研 Tauri / Electron
- [ ] 尝试桌面壳原型

### 验收标准

- 视频视觉不再只有静态图文
- D3 和 Three.js 通过 renderer 插件接入
- 批量生产不破坏单条视频编辑体验
- 桌面化路线明确

## 12. 监督方式

每次推进阶段时，需要更新：

- 当前阶段状态
- 已完成任务勾选
- 新增风险或阻塞
- 实际交付物路径
- 验证结果

建议每次阶段完成后，在本文档追加一段记录：

```txt
日期：
阶段：
完成内容：
验证方式：
遗留问题：
下一步：
```

## 12.1 阶段记录

```txt
日期：2026-06-08
阶段：P0 项目骨架与基础约定
完成内容：
- 初始化 pnpm monorepo
- 创建 Next.js Web Studio 骨架
- 创建 core/remotion-video/renderers/db/providers 包
- 创建 data 目录和基础 README
- 配置 TypeScript、ESLint、Prettier、Next workspace tracing
- 实现 P0 静态 Studio 首页，展示画布主工作台方向
验证方式：
- pnpm install
- pnpm typecheck
- pnpm lint
- pnpm build
- 启动 dev server 并访问 http://127.0.0.1:3000
遗留问题：
- 当前画布只是静态骨架，尚未接入真实 CanvasDocument
- 当前资源、配音、字幕控件尚未写回 AstroVideoSpec
下一步：
- 进入 P1，定义 VideoProject、CanvasDocument、CanvasNode、AstroVideoSpec、LibraryAsset、Job 等核心 schema
```

```txt
日期：2026-06-08
阶段：P1 核心数据模型
完成内容：
- 在 packages/core/src/schema 下定义 primitives、canvas、assets、scenes、project、jobs schema
- 导出 VideoProject、CanvasDocument、CanvasNode、CanvasEdge、AstroVideoSpec、SceneSpec、LibraryAsset、ProjectAssetRef、Job 等类型
- 为 text、astro-chart、sketch、d3-diagram、three-scene 建立 discriminated union
- 为字幕位置、配音参数、音频轨道、资源引用建立基础字段
- 增加 packages/core/examples/example-canvas-project.json
- 增加 packages/core/scripts/validate-examples.ts
验证方式：
- pnpm install --no-frozen-lockfile
- pnpm typecheck
- pnpm lint
- pnpm build
- pnpm --filter @zeroflow/core validate:examples
遗留问题：
- schema 目前是第一版契约，P2 接入真实画布后可能会按交互细节补字段
- 还没有建立数据库 schema，P4 再落 SQLite
下一步：
- 进入 P2，接入最小无限画布，让主题、文案、分镜、字幕、配音、素材、预览、导出节点可见可编辑
```

```txt
日期：2026-06-08
阶段：P2 最小无限画布
完成内容：
- 创建 apps/web/features/canvas/CanvasStudio.tsx
- 创建 apps/web/features/canvas/seed.ts
- 创建 /studio/[projectId] 动态画布页面
- 将首页接入同一个 CanvasStudio
- 实现轻量无限画布：节点、连线、背景平移、滚轮缩放、节点拖拽、选中状态
- 实现节点新增：分镜、字幕、配音、星盘、插画、音乐、画面合成、预览、导出
- 实现属性面板：文案正文、分镜数量、分镜时长、字幕高度/字号、配音语速/音量、图片提示词、节点尺寸
- 实现 CanvasDocument 本地保存和刷新恢复
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- pnpm --filter @zeroflow/core validate:examples
- 浏览器验证 /studio/project-ascendant-intro
- 验证新增节点后刷新恢复
- 验证分镜数量、字幕高度、配音语速修改后刷新恢复
遗留问题：
- 这版使用自研轻量画布，不是 tldraw；后续如果需要更完整白板能力，再评估迁移
- 节点变更现在只写回 CanvasDocument，尚未同步生成 AstroVideoSpec；P3 会处理画布/spec 到 Remotion 预览
- 暂未实现框选、多选、节点删除、快捷键和复杂对齐
下一步：
- 进入 P3，做画布节点到 AstroVideoSpec 的转换，并用 Remotion 跑通静态视频预览闭环
```

```txt
日期：2026-06-08
阶段：P3 静态视频预览闭环
完成内容：
- 在 packages/core/src/project 增加 CanvasDocument -> AstroVideoSpec 编译器
- 在 packages/remotion-video 增加 Remotion composition、timeline、text / astro-chart / sketch 三类 renderer
- 增加字幕层、音频占位波形、竖屏 1080x1920 默认 composition
- 在 Web Studio 右侧检查器接入 Remotion Player 实时预览
- 增加 Remotion Node API 渲染脚本，支持 still 和 MP4 导出
- 增加默认项目静态路由 /studio/project-ascendant-intro，绕开当前 Next dev 动态路由 worker 在本机的 spawn EPERM 问题
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video still
- pnpm --filter @zeroflow/remotion-video render
- 浏览器验证 /studio/project-ascendant-intro
- 验证字幕高度从 78 调到 62 后，Remotion 预览字幕层样式同步为 top: 62%
遗留问题：
- 通用动态路由 /studio/[projectId] 在当前 Windows dev server 中会触发 Next worker 的 spawn EPERM；P4 项目 CRUD 时需要重构为正式项目入口
- Remotion CLI 前端入口在当前环境会卡住，P3 改用 Remotion Node API 渲染脚本，后续任务系统也应优先调用 Node API
- 当前星盘和插画仍是 mock renderer，P7 再接真实 astrochart / 图片生成 / TTS
- tldraw 暂不在 P3 接入；建议在 P5 任务系统完成后、P6 或 P6.5 作为画布底座迁移检查点
下一步：
- 进入 P4，建立项目与资源库，让第一条视频和第二条视频可以独立管理并复用公共素材
```

```txt
日期：2026-06-08
阶段：P4 项目与资源库
完成内容：
- 将仓储层落到 data/zeroflow.store.json，先用文件型 JSON store 保证 Windows 本地开发稳定
- 保留 SQLite schema 草案，后续可在数据规模变大时替换仓储实现
- 增加 /api/projects、/api/project、/api/project/canvas、/api/library
- 实现项目列表页 /projects
- 实现资源库页 /library
- 默认导入 voice-profile 和 chart-style 两类可复用资源
- 支持创建第二条视频项目，并与默认项目分离存储
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- GET /api/projects
- GET /api/library
- POST /api/projects
- 浏览器验证 /projects 和 /library
遗留问题：
- scene_templates 和 style_presets 仍是 schema/资源概念，尚未做独立管理页
- 当前使用 JSON store，不是最终生产数据库；后续可升级 SQLite 或 Postgres
下一步：
- 继续 P5/P6/P7 的任务闭环，让画布按钮可以真实触发生成任务
```

```txt
日期：2026-06-08
阶段：P5/P6/P7 MVP 生成闭环
完成内容：
- 增加 job 创建 API 和同步 job runner
- 增加静态 fallback API：/api/jobs/run、/api/project、/api/project/canvas，用于绕开当前 Windows Next dev 动态路由 spawn EPERM 问题
- 实现 generate-script，并可回写文案节点
- 实现 generate-storyboard，并按自定义数量生成 scene/caption 节点
- 编译器支持把生成分镜写入 AstroVideoSpec.scenes
- 增加 DeepSeek provider，缺少环境变量时走 mock fallback
- 增加 Yunwu image provider，缺少环境变量时生成 mock SVG
- 增加 RunningHub/IndexTTS CLI provider，缺少环境变量或参考音色时创建 pending 音频资产
- 增加 generate-image、generate-tts、generate-chart、align-captions、resolve-assets 等任务
- 画布右侧 inspector 增加节点级生成按钮
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST /api/jobs + POST /api/jobs/run
- generate-storyboard 生成 4 个 scene nodes，并编译为 4 个 spec scenes
- generate-image 写出 project asset SVG
- generate-chart 写出 project asset SVG
- 浏览器点击“生成文案”，确认文案节点回写
遗留问题：
- 还没有后台 worker 轮询、retry 和 cancel
- TTS mock 不生成真实 mp3；需要 RUNNINGHUB_API_KEY 和参考音色后验证真实链路
- 星盘目前是 mock SVG，尚未接 astrodraw/astrochart
- 图片生成真实链路需要配置 YUNWU_API_KEY 后验证
- 资源入库 promotion 只预留 job 类型，尚未做 UI
下一步：
- 收口 P5 的 retry/cancel/worker
- 验证真实 DeepSeek、Yunwu、RunningHub 环境变量链路
- 接 astrochart 星盘 SVG
```

```txt
日期：2026-06-09
阶段：P5 任务系统收口
完成内容：
- Job schema 增加 attempts 和 maxAttempts
- 仓储层支持 retryJob 和 cancelJob
- runJob 会跳过 succeeded/cancelled，并遵守 maxAttempts
- 增加 runPendingJobs 批量执行 pending job
- 增加 /api/jobs/control，支持 retry / cancel
- 增加 /api/jobs/worker，支持按项目批量执行待处理任务
- 画布侧栏增加任务面板，展示最近任务、状态、节点、尝试次数、刷新、运行待处理、重试、取消
- 项目列表的 studio 打开链接改为静态路由 + projectId query，避免 Windows dev 下动态路由 worker spawn EPERM
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST /api/jobs 创建 pending job
- POST /api/jobs/control cancel 后状态为 cancelled
- POST /api/jobs/control retry 后状态回到 pending
- POST /api/jobs/worker 执行 pending job 后状态为 succeeded，attempts 从 0 增加到 1
- 浏览器验证 /studio/project-ascendant-intro?projectId=project-ascendant-intro 可见任务面板
- 浏览器验证 /projects 的打开链接为 /studio/project-ascendant-intro?projectId=...
遗留问题：
- 当前 worker 是同步 API/batch runner，不是独立常驻 daemon；后续批量生产阶段可以再加队列进程或定时轮询
- 真实长任务取消目前是状态取消，不能中断已经进入 provider 调用的同步执行
下一步：
- 进入 P6/P7 真实 provider 验证：DeepSeek 文案/分镜、云雾图片、RunningHub IndexTTS、astrochart 星盘 SVG
```

```txt
日期：2026-06-09
阶段：P7 星盘与 provider 验证工具
完成内容：
- 安装并接入 @astrodraw/astrochart
- 使用 happy-dom 在服务端为 AstroChart 提供 DOM 环境
- 新增 ChartProvider：renderNatalChart
- generate-chart job 从手写 mock SVG 切换为 AstroChart SVG
- 默认使用示例 planets/cusps 数据生成星盘 SVG，并在输出中标记 usedSampleData
- 新增 provider health：DeepSeek、云雾图像、RunningHub IndexTTS、AstroChart SVG
- /api/providers/check 返回详细 health，不暴露密钥
- 新增 /api/providers/verify：local 模式生成 AstroChart SVG；live 模式才尝试外部 provider
- 资源库页 /library 增加 provider 控制台、本地检查、真实接口检查
- .env.example 增加 INDEXTTS_REFERENCE_AUDIO_PATH / INDEXTTS_REFERENCE_AUDIO_NAME
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST /api/providers/verify mode=local，生成 data/provider-checks/astrochart.svg
- POST generate-chart job，生成 project asset SVG，provider=astrochart，usedMock=false
- 浏览器验证 /library 中 AstroChart SVG 状态为 ready
遗留问题：
- AstroChart 只渲染 SVG，不计算真实天体位置；后续需要 ephemeris 或外部星历服务生成 planets/cusps
- DeepSeek、云雾、RunningHub 真实链路未在仓库中保存密钥，需要通过环境变量 live 验证
- RunningHub TTS 需要 RUNNINGHUB_API_KEY 以及 INDEXTTS_REFERENCE_AUDIO_PATH 或 INDEXTTS_REFERENCE_AUDIO_NAME
下一步：
- P6：真实 DeepSeek 文案/分镜 schema 强校验与修复提示
- P7：真实 Yunwu 图片生成、RunningHub TTS dry-run/live 验证、素材入库 UI
```

```txt
日期：2026-06-09
阶段：P7 真实出生星盘计算闭环
完成内容：
- 安装并接入 astronomy-engine
- 新增 BirthChartInput、CalculatedNatalChart、positions、houses、calculation metadata
- ChartProvider 增加 calculateNatalChart，并支持 renderNatalChart({ birth })
- 计算出生资料到行星黄经、逆行标记、上升点、等宫宫头，并转成 AstroChart planets/cusps
- generate-chart job 支持从 job input 或 chart 节点读取出生日期、出生时间、时区、经纬度、地点和高亮目标
- generate-chart 输出项目 SVG 资产，并把 assetId、birth、positions、houses、calculation 写回 chart 节点
- Studio chart Inspector 增加出生资料、时区、地点、经纬度、宫位系统、高亮目标字段
- 新增 chart 节点和默认 seed 带北京示例出生资料，便于首轮验证
- /api/providers/verify local 模式新增 astrochart-birth 检查，验证 calculated-birth 生成链路
验证方式：
- pnpm --filter @zeroflow/providers typecheck
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/db typecheck
- POST /api/providers/verify mode=local，astrochart-birth ok=true，source=calculated-birth，usedSampleData=false
- POST generate-chart job，status=succeeded，source=calculated-birth，usedSampleData=false，positions=11
- GET /api/project 确认 node-chart 写回 assetId、birth、calculation、positions
遗留问题：
- 当前宫位系统是 equal house；还未接 Placidus/Whole Sign 等多宫制
- NNode 使用 mean lunar north node 近似；Chiron 暂未计算
- 还未接 Swiss Ephemeris 或外部专业星历服务，严肃专业星盘需要继续升级
- Remotion astro-chart 场景仍是程序化 mock 图形，尚未直接加载本轮生成的 AstroChart SVG 资产
下一步：
- 把生成的 chart SVG 资产接入 Remotion 画面层，让视频预览使用真实星盘图
- 继续真实 Yunwu 图片生成、RunningHub TTS dry-run/live 验证、素材入库 UI
```

```txt
日期：2026-06-09
阶段：P7 真实星盘进入 Remotion 画面
完成内容：
- AstroChartSceneSpec 增加 chartAssetId、chartAssetUrl、chartSource
- compileCanvasToAstroVideoSpec 会把 chart 节点生成的 assetUrl 带入 astro-chart 场景
- 当项目已有生成分镜但没有 astro-chart 场景时，自动补入一个星盘讲解场景，避免星盘资源只停留在画布上
- generate-chart job 写回 assetUrl：/api/project-asset?assetId=...
- 新增 /api/project-asset 只读资产服务，按 project asset id 返回 SVG/图片/音频/视频，并校验文件位于 data 目录内
- project asset API 增加 CORS，支持 Remotion renderer 从独立 bundle 端口读取 SVG 文本
- Remotion AstroChartScene 从 chartAssetUrl fetch SVG，并以内联 SVG 图层渲染；保留旧程序化星盘作为 fallback
- 生成 data/exports/real-chart-still.png，确认真实 AstroChart SVG 已进入视频画面
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST generate-chart job，输出 assetUrl=/api/project-asset?assetId=...
- GET /api/project 确认 spec.scenes 中 astro-chart scene 带 chartAssetUrl 和 chartSource=calculated-birth
- GET /api/project-asset 返回 image/svg+xml、CORS=*、内容以 <svg 开头
- Remotion renderer 渲染 chart scene still 成功：data/exports/real-chart-still.png
遗留问题：
- 当前自动补入 astro-chart 场景只是 MVP 规则；后续应由分镜脚本明确声明每个 scene 使用哪些资源
- Remotion 星盘高亮仍是整张 SVG 入场动画，尚未做到对单个行星/宫位/aspect 的局部动画
- 生成分镜节点与默认节点在画布上有重叠，后续接 tldraw 或自动布局时需要整理
下一步：
- 继续 Yunwu 图片资产进入 SketchScene，RunningHub TTS 进入音频轨道，以及素材入库/复用 UI
```

```txt
日期：2026-06-09
阶段：P7 插画资产进入 Remotion 画面
完成内容：
- SketchSceneSpec 增加 assetUrl、assetSource
- generate-image job 写回 assetId、assetUrl、assetPath、provider，并在 job output 返回 assetUrl
- compileCanvasToAstroVideoSpec 会把 image 节点生成的 assetUrl 带入 sketch scene
- 当项目已有生成分镜但没有 sketch 场景时，自动补入一个插画讲解场景
- 新增 RemoteVisualAsset 组件，支持 SVG inline 渲染和 PNG/JPEG/WebP 图片加载
- AstroChartScene 与 SketchScene 复用 RemoteVisualAsset，减少资源加载分叉
- SketchScene 有真实 assetUrl 时渲染项目插画资产，没有时保留手写 fallback
- 生成 data/exports/real-sketch-still.png，确认插画资产已进入视频画面
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST generate-image job，输出 assetUrl=/api/project-asset?assetId=...
- GET /api/project 确认 spec.scenes 中 sketch scene 带 assetUrl 和 assetSource
- GET /api/project-asset 返回 image/svg+xml、CORS=*、内容以 <svg 开头
- Remotion renderer 渲染 sketch scene still 成功：data/exports/real-sketch-still.png
遗留问题：
- 当前真实云雾链路未 live 验证；无 YUNWU_API_KEY 时仍使用 mock SVG
- 自动补入 sketch scene 是 MVP 规则；后续应由分镜脚本明确声明 scene 使用的素材
- 还没有素材入库/复用 UI，生成素材只进入项目资产
下一步：
- 接 RunningHub TTS 到 audio tracks，让旁白音频进入 Remotion 视频
- 再补素材入库 promotion UI，让第二条视频复用第一条视频的插画、星盘样式和声音资产
```

```txt
日期：2026-06-09
阶段：P7 旁白音频进入 Remotion 导出
完成内容：
- AudioTrack schema 增加 assetUrl、provider、playbackRate
- generate-tts job 将音频保存为 project asset，并把 assetId、assetUrl、provider、manifestPath 写回 voice 节点
- mock TTS 生成真实 WAV 文件，便于无外部密钥时验证音频轨道
- compileCanvasToAstroVideoSpec 从 voice 节点生成 narration audio track
- Remotion AudioPlaceholder 保留可视化音量条，同时用 @remotion/media 的 <Audio> 播放真实音轨
- Remotion Root 支持按输入 spec 动态计算时长、fps 和画幅
- /api/project-asset 增加 Range 请求支持，避免 Remotion 读取音视频资产时整段下载
- 生成 data/exports/tts-audio-preview-range.mp4，确认导出视频包含 AAC 音频流
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST generate-tts job，输出 audio project asset 和 assetUrl
- GET /api/project 确认 spec.audio.tracks[0] 带 assetUrl、provider=mock-tts、playbackRate
- GET /api/project-asset 返回 audio/wav、CORS=*、RIFF 文件头
- Range 请求返回 206 Partial Content、Accept-Ranges=bytes、Content-Range
- Remotion 短渲染成功：data/exports/tts-audio-preview-range.mp4
- ffprobe 确认输出 MP4 同时包含 h264 视频流和 aac 音频流
遗留问题：
- 当前真实 RunningHub/IndexTTS live 链路仍需通过环境变量和参考音色验证；本轮使用 mock WAV 验证项目内音频闭环
- 旁白尚未做逐句时间轴对齐，字幕仍按 scene 级文本和时长显示
- 还没有音频波形裁剪、音量包络、BGM/SFX 多轨混音 UI
下一步：
- 补素材入库 promotion UI，让生成过的插画、星盘样式和声音资产可被第二条视频复用
- 继续字幕节点生成和后续音频对齐能力
```

```txt
日期：2026-06-09
阶段：P7 素材入库与跨项目复用
完成内容：
- 新增 promoteProjectAssetToLibrary 仓储能力，将 project asset 复制到 data/library/assets 并登记为 reusable library asset
- promote-asset-to-library job 从占位实现升级为真实入库任务，并记录来源 project asset metadata
- 新增 /api/project-assets，列出项目素材并标记 promotedLibraryAssetId
- Studio 左侧新增“项目素材”面板，可查看最近生成素材并一键入库
- /api/project-asset 支持读取 project asset 和 library asset，复用资产可继续被 Remotion/预览访问
- 新增 /api/project-assets/reuse，把 library asset 绑定到目标项目的合适画布节点
- 资源库页新增目标项目选择器和“用于项目”按钮，支持把公共素材复用到第二条视频
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST promote-asset-to-library job，将项目插画提升为 library asset
- GET /api/project-assets 确认原 project asset 带 promotedLibraryAssetId
- GET /api/library 确认新 library asset reusable=true，path 位于 data/library/assets
- POST /api/project-assets/reuse 将入库插画绑定到第二个视频项目 node-image
- GET /api/project 确认第二个项目的 sketch scene 带 library assetUrl
- GET /api/project-asset?assetId=<libraryAssetId> 返回 image/svg+xml 且内容以 <svg 开头
遗留问题：
- 当前复用绑定按素材类型自动选择默认节点；后续需要在 UI 里支持选择具体 scene/node
- 入库后的素材还没有审核、重命名、标签编辑和删除能力
- BGM/SFX、字幕样式、星盘样式等复用规则仍需细化成更明确的模板/样式系统
下一步：
- 继续字幕节点生成和字幕/旁白时间轴对齐
- 开始为 tldraw 迁移做兼容层评估：CanvasNode 与 tldraw shape 的映射、选择/拖拽/分组能力边界
```

```txt
日期：2026-06-09
阶段：P7 字幕节点与时间轴
完成内容：
- CaptionLayout schema 增加 assetId、assetScope、assetUrl、provider 和 cues
- align-captions job 从只返回结果升级为生成 subtitle project asset，并写出 captions JSON
- align-captions 会更新已有 caption 节点或创建缺失 caption 节点，写入 cues、assetId、assetUrl、时间范围和 provider
- compileCanvasToAstroVideoSpec 会从 caption 节点读取 cues 并带入 scene.caption
- Remotion CaptionLayer 支持按当前 scene 的本地时间选择 active cue，并让 cue 切换时重新执行入场动画
- Studio caption inspector 显示字幕时间轴摘要，方便检查每条 cue 的起始秒、时长和文本
- /api/project-asset 支持 subtitle JSON 的 application/json 响应
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST align-captions job，输出 subtitle project asset 和 captions cues
- GET /api/project 确认 caption 节点写回 cues、assetUrl、provider
- GET /api/project 确认 spec.scenes[*].caption.cues 存在
- GET /api/project-asset?assetId=<subtitleAssetId> 返回 application/json 且内容以 { 开头
- Remotion still 渲染成功：data/exports/caption-cues-still.png
遗留问题：
- 当前 cue 时间分配按文本长度和 scene 时长估算，还未基于真实 TTS 音素/词级时间戳
- 字幕节点可查看 cue 摘要，但还不能逐条编辑、拖拽 cue 边界或重新切分
- 后续需把 RunningHub/IndexTTS 的真实时间戳或 Whisper 对齐结果接入这里
下一步：
- 接入更精细的字幕/旁白对齐来源，优先评估 RunningHub/IndexTTS manifest 是否能提供时间戳
- 开始 tldraw 迁移兼容层评估
```

```txt
日期：2026-06-09
阶段：P7 TTS manifest 字幕对齐
完成内容：
- generate-tts mock fallback 会同时写出 RunningHub 风格 manifest，包含 chunks、startSec、durationSec 和 audioPath
- align-captions 会优先读取 job.input.manifestPath 或 voice 节点 manifestPath
- 支持从 manifest.chunks / manifest.segments 读取字幕文本、startSec、durationSec
- 当 manifest 缺少 duration 时，尝试用 ffprobe 读取 chunk 音频时长
- 当 manifest 缺少 startSec 时，按 chunk 顺序累计时间，避免把 chunk index 误当成秒数
- 字幕 asset metadata 写入 alignmentSource 和 manifestPath，便于后续排查
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- POST generate-tts dry-run job，确认写出 manifest.json
- POST align-captions job 并传入 manifestPath，输出 alignmentSource=tts-manifest
- GET /api/project 确认 spec.scenes[*].caption.cues 写回，当前验证 cueCounts=5,5,5,5
- GET /api/project-asset?assetId=<subtitleAssetId> 返回 subtitle JSON
- Remotion still 渲染成功：data/exports/tts-manifest-cues-still.png
遗留问题：
- 需要用真实 RunningHub/IndexTTS live 输出再验证 chunk 文件路径、远程 fileUrl 和 ffprobe 可用性
- 字幕 cue 还不能在画布上逐条拖拽、拆分、合并或锁定
下一步：
- 做 tldraw 兼容层评估，先定义 CanvasNode 与 tldraw shape 的映射，不替换现有生成链路
- 接入真实 RunningHub TTS live 验证，并根据真实 manifest 字段补齐解析器
```

```txt
日期：2026-06-09
阶段：P7 tldraw 兼容层
完成内容：
- 在 @zeroflow/core 增加 tldrawCompat 映射模块
- 定义 zeroflow-node 与 zeroflow-edge 两类兼容 shape
- CanvasDocument 可导出为 tldraw 兼容 snapshot，保留 nodeId、kind、refId、status、size、position、data 和 edge relation
- tldraw 兼容 snapshot 可写回 CanvasDocument，并在 edge shape 缺失时用原 canvas 保留合法连线
- 增加 validate:tldraw 脚本，验证示例项目导出和 roundtrip
- 增加 /api/project/canvas/tldraw?projectId=... 查询参数版端点，避开本机 Next dev 动态路由 spawn EPERM 问题
- 同时保留 /api/projects/[projectId]/canvas/tldraw 动态路由，供生产构建和后续 REST 风格调用
验证方式：
- pnpm --filter @zeroflow/core validate:tldraw
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/web typecheck
- GET /api/project/canvas/tldraw?projectId=project-ascendant-intro，当前真实项目导出 39 个 shape
- PUT 同一个 snapshot 回 /api/project/canvas/tldraw?projectId=project-ascendant-intro，写回 20 个节点、19 条边，spec 仍为 4 个分镜
遗留问题：
- 还没有安装和渲染真实 tldraw Editor
- 还没有自定义 shape util、选择框、多选、分组、快捷键和 resize 交互
- 动态路由在本机 dev 环境仍可能触发 Next spawn EPERM，因此开发期优先用 query 参数版 API
下一步：
- 安装并接入 tldraw Editor，先做只读/可移动节点视图
- 将 node 移动、resize、选择状态同步回兼容 snapshot，再写回 CanvasDocument
```

```txt
日期：2026-06-09
阶段：P7 tldraw Editor MVP
完成内容：
- 安装 tldraw 5.1.0，并将 Web React/ReactDOM 升级到满足 peer dependency 的 19.2.x
- 新增 /tldraw?projectId=... 页面，独立承载真实 tldraw Editor
- 用 tldraw 内置 geo shape 渲染 CanvasNode，用 arrow shape 渲染 CanvasEdge
- tldraw 页面显示项目、分镜数、节点数和当前选中节点
- 节点移动、resize 后可通过“同步项目”写回 CanvasDocument，继续由 compileCanvasToAstroVideoSpec 驱动 spec
- Studio 侧边导航增加 tldraw 入口
- 开发环境增加 window.__zeroflowTldraw QA hook，用于验证节点移动与保存链路，生产环境不暴露
- 增加 favicon route，减少浏览器控制台 404 噪音
验证方式：
- pnpm typecheck
- pnpm lint
- pnpm build
- 打开 http://localhost:3000/tldraw?projectId=project-ascendant-intro，tldraw application 成功挂载
- DevTools a11y snapshot 确认页面显示 4 个分镜、20 个节点
- DevTools 自动验证：node-topic 从 (0,0) 移动到 (9,4) 后保存进项目，再恢复到 (0,0)
- 截图：data/exports/tldraw-editor-page.png
- 截图：data/exports/tldraw-editor-after-sync.png
遗留问题：
- 当前使用内置 geo/arrow shape，还没有 zeroflow 专用 ShapeUtil
- 连线是根据业务 edge 自动重绘，不支持在 tldraw 中直接编辑流程线
- /tldraw 首屏 JS 约 538 kB，后续需要动态加载、按需拆包或只在高级画布入口加载
- tldraw 生产环境会要求 license key，正式部署前需要配置
- tldraw 中文翻译仍有少量缺失 key warning，需后续补 translations/overrides
下一步：
- 做 Zeroflow 专用 node shape，直接渲染资源预览、状态 badge、任务按钮和节点类型图标
- 支持在 tldraw 页面内编辑节点 data，而不仅是位置和尺寸
```

```txt
Date: 2026-06-09
Phase: P7 tldraw Zeroflow ShapeUtil
Done:
- Added a dedicated ZeroFlowNodeShapeUtil instead of rendering business nodes as built-in geo shapes.
- Mapped CanvasNode fields into visible tldraw node props: kind, status, title, description, refId, provider, duration, cue count, and asset URL.
- Added project asset previews for visual nodes such as chart and image.
- Added node-level action buttons in tldraw for script, storyboard, chart, image, TTS, captions, preview, and export jobs.
- Wired tldraw node actions through the existing /api/jobs and /api/jobs/run flow, after first syncing the canvas back to CanvasDocument.
- Kept CanvasDocument as the source of truth; tldraw remains the editor shell and writes position/size changes back to the project.
- Added @tldraw/tlschema as an explicit web dependency so custom shape typing is stable.
Validation:
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm typecheck
- pnpm lint
- pnpm build
- GET /api/project?projectId=project-ascendant-intro returned 200
- GET /tldraw?projectId=project-ascendant-intro returned 200
- Browser DOM check: 20 custom zeroflow nodes, 13 node action buttons, 2 asset previews, 1 tldraw application.
- QA hook moved node-topic from (0,0) to (7,5), saved it, then restored it to (0,0).
- Screenshot: data/exports/tldraw-zeroflow-shapeutil.png
Remaining:
- tldraw zh-cn translation still reports missing page-menu.max-pages-reached and page-menu.resize.
- Production deployment still needs a tldraw license key.
- /tldraw first-load JS is still large; it should stay isolated behind the advanced canvas route until code splitting is tuned.
- Node data editing inside tldraw is not implemented yet; only position, size, status/resource visibility, and job launching are available.
Next:
- Add node data editing controls inside the tldraw side panel or custom inspector.
- Add safer per-node job confirmation/progress feedback before enabling heavy real-provider runs by default.
- Use tldraw as the base for P8 Three.js/D3 visual resource nodes.
```

```txt
Date: 2026-06-09
Phase: P7 tldraw Node Inspector
Done:
- Added a tldraw side-panel Inspector that follows the selected ZeroFlow node.
- Added editable controls for shared node fields: title, description, width, and height.
- Added type-specific controls for script text, storyboard scene count, scene duration/narration/visual prompt, caption Y/font/color, voice speed/volume/profile, image prompt, and chart birth data.
- Caption nodes now show cue timing rows and linked subtitle asset URL inside the tldraw Inspector.
- Inspector edits update CanvasDocument state and refresh the visible custom tldraw node shape immediately.
- Inspector edits preserve unsaved tldraw position/size changes by first merging current tldraw geometry back into CanvasDocument.
- Added a development QA hook selectNode(nodeId), alongside moveNode, updateNodeData, runNode, save, and stats.
- Added running-state feedback for selected-node job buttons.
Validation:
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm typecheck
- pnpm lint
- pnpm build
- GET /tldraw?projectId=project-ascendant-intro returned 200 after dev restart.
- GET /api/project?projectId=project-ascendant-intro returned 200 after dev restart.
- Browser check: selecting node-caption-generated-1 shows caption controls, cue rows, asset URL, and size controls.
- Persistence check: changed node-caption-generated-1 data.yPercent from 78 to 66, saved, confirmed via /api/project, then restored to 78.
- Screenshot: data/exports/tldraw-node-inspector.png
Remaining:
- tldraw zh-cn translation still reports missing page-menu.max-pages-reached and page-menu.resize.
- Inspector fields are practical MVP controls, not yet a polished schema-driven form system.
- Cue rows are read-only; fine-grained cue split/merge/drag editing is still pending.
Next:
- Add cue-level editing for captions and timeline-style adjustment.
- Add guarded real-provider run controls so expensive DeepSeek/Yunwu/RunningHub jobs require explicit confirmation when env keys are present.
- Start P8 visual node groundwork: Three.js and D3 resource node contracts on top of tldraw.
```

```txt
Date: 2026-06-09
Phase: P7 tldraw Cue Editor
Done:
- Turned caption cue rows in the tldraw Inspector from read-only timing rows into editable controls.
- Added per-cue text, start time, and duration fields for caption nodes.
- Added an Add cue action and a Remove action for individual caption cues.
- Added cue normalization so edited cues keep stable ids, finite timing values, and compact two-decimal timing precision.
- Preserved in-progress text editing while keeping Remotion spec compilation safe: empty cue text is still filtered during compile.
- Added a development QA hook updateCue(nodeId, cueId, key, value) for persistence checks.
- Kept the storage contract on CanvasDocument node data, so caption edits continue through /api/project/canvas and compileCanvasToAstroVideoSpec.
Validation:
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm typecheck
- pnpm lint
- Browser check: selected node-caption-generated-1 and confirmed 5 cue textareas, 10 timing inputs, and the Add cue control.
- Persistence check: changed the first caption cue text and startSec, saved, confirmed via /api/project, then restored the original values.
- Screenshot: data/exports/tldraw-cue-editor.png
- pnpm build
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
Remaining:
- Cue editing is still form-based; split/merge, drag handles, waveform timing, and timeline scrubbing are not implemented yet.
- tldraw zh-cn translation still reports missing page-menu.max-pages-reached and page-menu.resize.
- Production deployment still needs a tldraw license key.
- /tldraw first-load JS is still large; current build shows 542 kB route size and 648 kB first-load JS.
Next:
- Add guarded real-provider run controls so expensive DeepSeek/Yunwu/RunningHub jobs require explicit confirmation when env keys are present.
- Start P8 visual node groundwork: Three.js and D3 resource node contracts on top of tldraw.
- After visual node contracts are stable, add timeline-style cue adjustment tied to audio duration and captions.
```

```txt
Date: 2026-06-09
Phase: P7 Live Provider Guard
Done:
- Added a client-side provider guard helper shared by tldraw and the lightweight CanvasStudio.
- Added provider health loading from /api/providers/check in both canvas entry points.
- Mapped live-provider risk by job type: generate-script/generate-storyboard -> DeepSeek, generate-image -> Yunwu, generate-tts -> RunningHub IndexTTS.
- Added confirmation before creating a live-provider job; confirmed jobs include confirmLiveProvider and confirmedProviderId in job input.
- Added tldraw Inspector provider notices and a side-panel provider summary.
- Added lightweight CanvasStudio provider notices under node job buttons.
- Added server-side /api/jobs protection: live-provider jobs without explicit confirmation return 409 and do not create a job.
- Added runner protection so old pending/retried jobs without confirmation fail as user-fixable before attempts increment or providers run.
- Cleaned up the temporary verification job created while testing the guard.
Validation:
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm typecheck
- pnpm lint
- Temporary fake-env server: /api/providers/check reported DeepSeek ready.
- Temporary fake-env server: POST /api/jobs for unconfirmed generate-script returned 409 with providerRisk.
- Runner guard check: an unconfirmed retried generate-script job failed as user-fixable with attempts still 0.
- Normal dev restart: GET /tldraw?projectId=project-ascendant-intro returned 200.
- Normal dev restart: GET /api/project?projectId=project-ascendant-intro returned 200.
- Normal dev restart: GET /api/providers/check returned 200.
- Browser check: tldraw script, image, voice, and chart nodes report local-or-mock when live providers are not configured.
- Screenshot: data/exports/tldraw-provider-guard.png
- pnpm build
Remaining:
- Confirmation currently uses the browser confirm dialog; a custom modal with richer cost/context controls is still needed.
- Confirmed live-provider creation was not executed against real keys in this verification run.
- tldraw zh-cn translation still reports missing page-menu.max-pages-reached and page-menu.resize.
- /tldraw first-load JS remains large; current build shows 543 kB route size and 649 kB first-load JS.
Next:
- Start P8 visual node groundwork: Three.js and D3 resource node contracts on top of tldraw.
- Add timeline-style cue adjustment tied to audio duration and captions after visual node contracts settle.
- Add a custom confirmation modal before enabling real-provider production runs as the default operator flow.
```

```txt
Date: 2026-06-09
Phase: P8 D3 and Three Visual Node Contracts
Done:
- Added CanvasNodeKind entries for d3 and three.
- Added default D3 Diagram and Three Scene nodes to the web canvas seed and db seed.
- Added current project migration data for node-d3 and node-three, plus flow edges into composition.
- Extended compileCanvasToAstroVideoSpec so d3 nodes compile to d3-diagram scenes and three nodes compile to three-scene scenes.
- Added dataJson parsing with safe fallbacks for visual node contracts.
- Added Remotion D3DiagramScene and ThreeScene contract preview components.
- Replaced the previous unsupported d3/three scene renderer branch with concrete preview renderers.
- Added tldraw labels, node styling, and Inspector controls for D3 diagram type, Three scene preset, duration, narration, speed, accent color, and data JSON.
- Added lightweight CanvasStudio controls and default data for D3/Three nodes.
- Updated Remotion sample spec so still renders cover the new visual scene components.
Validation:
- pnpm typecheck
- pnpm lint
- pnpm --filter @zeroflow/core validate:tldraw
- pnpm --filter @zeroflow/core validate:examples
- Current project compile check: 22 nodes, 23 edges, scene types text, astro-chart, sketch, d3-diagram, three-scene, text.
- pnpm --filter @zeroflow/remotion-video still
- Rendered P8 D3 still: data/exports/p8-d3-still.png
- Rendered P8 Three still: data/exports/p8-three-still.png
- Browser check: /tldraw reports 22 ZeroFlow nodes.
- Browser check: node-d3 Inspector shows diagram selector and data JSON controls.
- Browser check: node-three Inspector shows scene selector and data JSON controls.
- Persistence check: changed node-d3 diagram from timeline to tree, saved, confirmed spec diagram tree, then restored timeline.
- Screenshot: data/exports/tldraw-p8-visual-nodes.png
- pnpm build
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200 and spec includes d3-diagram and three-scene.
Remaining:
- D3 and Three renderers are contract previews, not full runtime integrations with d3 or three packages yet.
- JSON editing is raw textarea-based; it needs schema-aware validation, formatting, and presets.
- tldraw first-load JS remains large; current build shows 544 kB route size and 650 kB first-load JS.
Next:
- Add schema-aware visual preset editors for common D3/Three templates.
- Add timeline-style cue adjustment tied to audio duration and captions.
- Introduce lazy-loaded real d3/three renderers after the visual contracts stabilize.
```

```txt
Date: 2026-06-09
Phase: P8 Visual Preset Editor
Done:
- Added a shared D3/Three visual preset catalog for timeline, relationship, tree, distribution, orbit, zodiac-space, and planet-focus templates.
- Added preset patch helpers so visualPreset, title, description, duration, diagram/scene, speed, accent color, camera, and dataJson update together.
- Added schema-aware JSON status checks for D3 diagram data and Three scene data.
- Added a one-click JSON formatter for valid visual node data.
- Added tldraw Inspector preset selectors, JSON status badges, and formatter controls for D3 and Three nodes.
- Added lightweight CanvasStudio preset selectors, JSON status badges, and formatter controls using the same shared preset catalog.
- Updated new lightweight CanvasStudio D3/Three nodes to initialize from the shared preset catalog.
- Added shared responsive styling for visual JSON status/tool rows.
Validation:
- pnpm typecheck
- pnpm lint
- Browser check: node-d3 Inspector shows preset selector, timeline diagram, valid JSON status, and enabled Format control.
- Persistence check: changed node-d3 preset to distribution, saved through Sync, confirmed store data and compiled spec diagram distribution, then restored timeline.
- Browser check: node-three Inspector shows preset selector, orbit scene, valid JSON status, and enabled Format control.
- Persistence check: changed node-three preset to planet-focus, saved through Sync, confirmed store data and compiled spec scene planet-focus, then restored orbit.
- Restore check: current project node-d3 is timeline and node-three is orbit with camera portrait-orbit.
- Screenshot: data/exports/tldraw-visual-preset-editor.png
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200 after initial compile.
Remaining:
- D3 and Three renderers are still contract previews, not lazy-loaded runtime integrations with d3 or three packages.
- JSON validation is intentionally lightweight; it does not provide a visual JSON builder or drag-editable data rows yet.
- tldraw first-load JS remains large; current build shows 545 kB route size and 651 kB first-load JS.
Next:
- Add timeline-style cue adjustment tied to audio duration and captions.
- Add asset-aware visual previews for D3/Three nodes before enabling full runtime renderers.
- Introduce lazy-loaded real d3/three renderers after the preset contracts stabilize.
```

```txt
Date: 2026-06-09
Phase: P8 Cue Timeline Editor
Done:
- Added a shared CaptionCueTimeline component for caption nodes.
- Added cue timeline bars, timeline duration control, cue text editing, start range, duration range, and numeric start/duration inputs.
- Added shared cue helpers for parsing, normalizing, clamping, rounding, and deriving timeline duration from caption duration and cue end time.
- Replaced the tldraw caption cue form with the shared timeline editor.
- Added lightweight CanvasStudio cue add/edit/remove/update callbacks and connected the same timeline editor there.
- Added responsive timeline styling for compact inspector panels.
- Adjusted timeline ruler labels so short endings do not overlap; 11s captions now show 0/3/6/11 markers.
Validation:
- pnpm typecheck
- pnpm lint
- Browser check: node-caption-generated-1 shows 5 timeline segments, 5 cue rows, 10 range controls, and duration 11s.
- Persistence check: changed the first cue startSec from 0 to 0.25 via the Inspector input, saved, confirmed store and compiled spec both reflected 0.25.
- Restore check: changed the first cue startSec back to 0, saved, and confirmed store and compiled spec both returned to 0.
- Screenshot: data/exports/tldraw-cue-timeline-editor.png
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200 after initial compile.
Remaining:
- Timeline editing is still range/input based; direct drag handles on the bar itself are not implemented yet.
- No waveform rendering yet; audio duration is represented by caption/scene duration and cue bounds.
- Lightweight CanvasStudio still keeps its older read-only caption cue summary below the new editor for now.
- tldraw first-load JS remains large; current build shows 546 kB route size and 652 kB first-load JS.
Next:
- Add direct drag/resize handles on caption timeline bars.
- Add waveform or audio energy preview once real TTS audio metadata is consistently available.
- Add asset-aware visual previews for D3/Three nodes before enabling full runtime renderers.
```

```txt
Date: 2026-06-09
Phase: P8 Cue Timeline Drag Handles
Done:
- Added direct drag behavior to caption timeline bars so the whole cue segment can move along the timeline.
- Added left and right resize handles on every cue segment for changing cue start and end bounds.
- Added keyboard support on cue segments: ArrowLeft/ArrowRight nudges start time, Alt+ArrowLeft/ArrowRight adjusts duration, and Shift increases the step.
- Added pointer-capture guards so real browser drags and automated pointer-event checks both work safely.
- Updated timeline segment styling with visible edge handles, grab/resize cursors, focus outline, and touch-action guards.
- Removed the old read-only cue summary from the lightweight Studio runtime path so CaptionCueTimeline is the single editable cue surface.
Validation:
- pnpm typecheck
- pnpm lint
- Browser check: node-caption-generated-1 shows 5 cue segments and 10 drag/resize handles.
- Drag check: moved the first cue segment on the timeline; startSec changed from 0 to 0.47, saved, and store plus compiled spec both reflected 0.47.
- Resize check: dragged the first cue end handle; duration changed from 1.44 to 1.83, saved through the same Inspector path.
- Restore check: returned the first cue to startSec 0 and durationSec 1.44, saved, and confirmed store plus compiled spec returned to the original values.
- Screenshot: data/exports/tldraw-cue-drag-handles.png
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200 after initial compile.
Remaining:
- No waveform or audio-energy backdrop yet; cue timing still uses caption/scene duration.
- Dragging currently permits overlap; collision snapping and neighbor-aware constraints are not implemented yet.
- tldraw first-load JS remains large; current build shows 547 kB route size and 653 kB first-load JS.
Next:
- Add waveform or audio energy preview once real TTS audio metadata is consistently available.
- Add optional snap-to-neighbor and overlap warnings for cue timing.
- Add asset-aware visual previews for D3/Three nodes before enabling full runtime renderers.
```

```txt
Date: 2026-06-09
Phase: P8 Caption Audio Energy Preview
Done:
- Added CaptionEnergyBar parsing, clamping, normalization, and cue-derived fallback helpers in the shared caption timeline component.
- Added a subtle audio-energy backdrop behind cue segments so caption timing can be adjusted against visible voice pacing.
- Connected tldraw Inspector caption nodes to node.data.audioEnergy while preserving fallback rendering for existing caption nodes.
- Connected lightweight CanvasStudio caption nodes to the same audio-energy timeline path.
- Updated align-captions job output so future caption alignment writes audioEnergy from TTS manifest-backed cues, with cue-derived bars as fallback.
- Kept cue segment drag, resize handles, keyboard nudging, and numeric cue editing on the same shared timeline surface.
Validation:
- pnpm typecheck
- pnpm lint
- Browser check: selected node-caption-generated-1 in /tldraw and confirmed 5 audio-energy bars, 5 cue segments, and 10 resize handles.
- Browser check: selected Inspector still shows 5 cues / 11.00s, cue text rows, start/duration controls, and the original first cue at 0.00s - 1.44s.
- Screenshot note: browser screenshot capture timed out at the CDP layer, so this phase is validated by DOM checks plus build/API smoke tests.
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200 after initial compile.
Remaining:
- This is an audio-energy preview derived from caption/TTS timing metadata, not a true PCM waveform analysis yet.
- Existing caption nodes use the cue-derived fallback until align-captions is rerun and writes audioEnergy into node data.
- Dragging currently permits overlap; collision snapping and neighbor-aware constraints are not implemented yet.
- tldraw first-load JS remains large; current build shows 547 kB route size and 653 kB first-load JS.
Next:
- Add optional snap-to-neighbor and overlap warnings for cue timing.
- Add real waveform extraction when TTS/audio assets consistently expose waveform or sample-level amplitude data.
- Add asset-aware visual previews for D3/Three nodes before enabling full runtime renderers.
```

```txt
Date: 2026-06-09
Phase: P8 Cue Snap and Overlap Warnings
Done:
- Added neighbor-aware snap points for caption cue dragging and resize boundaries.
- Cue move snapping now considers both the segment start and segment end, so a cue can snap cleanly to timeline edges or adjacent cue boundaries.
- Cue resize snapping now aligns start/end handles to timeline edges and other cue start/end boundaries within a small threshold.
- Added overlap detection for caption cues without treating perfectly touching cue edges as overlap.
- Added visual overlap styling on timeline segments and compact Overlap badges in the cue list.
- Exported caption cue snap/overlap helpers so future tests can cover timing behavior without browser pointer automation.
Validation:
- pnpm typecheck
- pnpm lint
- Pure helper check: touching edges are not overlap; moving segment end snaps to neighbor start; resize boundary snaps to neighbor start; overlapping cues flag both ids.
- Browser smoke: /tldraw?projectId=project-ascendant-intro loaded with 22 nodes after the change.
- Browser smoke: /studio/project-ascendant-intro?projectId=project-ascendant-intro loaded after the change.
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro returned 200 after initial compile.
- Dev restart after build: GET /studio/project-ascendant-intro?projectId=project-ascendant-intro returned 200 after initial compile.
Remaining:
- Browser pointer automation for tldraw shape selection was unreliable in this run, so deep drag e2e remains covered by previous drag checks plus pure helper checks.
- Snapping is threshold-based and does not enforce non-overlap; users can still intentionally overlap cue timing.
- tldraw first-load JS remains large; current build shows 548 kB route size and 653 kB first-load JS.
Next:
- Add real waveform extraction when TTS/audio assets consistently expose waveform or sample-level amplitude data.
- Add asset-aware visual previews for D3/Three nodes before enabling full runtime renderers.
- Start lazy-loaded real D3/Three renderers after the visual contracts and timeline controls stabilize.
```

```txt
Date: 2026-06-09
Phase: P8 D3 and Three Live Inspector Previews
Done:
- Added real D3 runtime modules for Inspector preview layout: d3-array, d3-scale, d3-shape, and d3-hierarchy.
- Added Three.js plus @types/three and implemented a lazy-loaded WebGL preview for Three visual nodes.
- Added a shared VisualPreview component for D3 SVG previews and Three.js canvas previews.
- D3 previews now render timeline, relationship, tree, and distribution data from the existing visual node JSON contract.
- Three previews now render orbit/zodiac/planet-focus-style spatial previews from the existing Three node JSON contract.
- Connected the shared preview component to both lightweight Studio Inspector and tldraw Inspector.
- Added nodeId deep links for Studio and tldraw so specific visual nodes can be opened directly for review.
Validation:
- pnpm typecheck
- pnpm lint
- Browser check: Studio nodeId=node-d3 shows D3 preview with 1 SVG, 1 path, and 4 circles.
- Browser check: Studio nodeId=node-three shows Three.js preview with 1 canvas at a stable 249x154 size.
- Browser check: tldraw nodeId=node-d3 selects node-d3 and shows D3 preview with 1 SVG, 1 path, and 4 circles.
- Browser check: tldraw nodeId=node-three selects node-three and shows Three.js preview with 1 canvas at a stable 271x154 size.
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /studio/project-ascendant-intro?projectId=project-ascendant-intro&nodeId=node-three returned 200 after initial compile.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro&nodeId=node-three returned 200 after initial compile.
Remaining:
- D3 preview uses runtime D3 layout helpers, but final video rendering still uses the Remotion contract renderer.
- Three preview is an Inspector preview, not yet a full Remotion Three.js scene renderer.
- tldraw first-load JS increased to 562 kB route size and 668 kB first-load JS after D3 preview integration.
Next:
- Promote D3/Three live previews into asset preview/export paths.
- Add real waveform extraction when TTS/audio assets consistently expose waveform or sample-level amplitude data.
- Start mapping visual preview output into Remotion render scenes where appropriate.
```

```txt
Date: 2026-06-09
Phase: P8 Visual Asset Export Jobs
Done:
- Added a new export-visual-asset job type to the shared job schema.
- Added local visual SVG export in the job runner for D3 and Three visual nodes.
- D3 visual export writes timeline, relationship, tree, and distribution SVG assets from existing node JSON data.
- Three visual export writes a spatial orbit-style SVG asset from existing Three node data.
- Exported visual assets are saved as project svg assets with local-visual-renderer metadata and project asset refs.
- D3/Three nodes now receive assetId, assetPath, assetUrl, provider, and exportedAt after export.
- Added lightweight Studio Inspector action for exporting D3/Three visual nodes.
- Added tldraw run mapping and label for exporting D3/Three visual nodes.
- Added a generic Studio asset summary so generated visual asset URLs and paths are visible on the selected node.
Validation:
- pnpm typecheck
- pnpm lint
- API job check: export-visual-asset succeeded for node-d3 and wrote project-asset-d3-2026-6-9-07-04-45-1780959885227.
- API job check: export-visual-asset succeeded for node-three and wrote project-asset-three-2026-6-9-07-04-45-1780959885384.
- Asset file check: generated D3 SVG is 1634 bytes and generated Three SVG is 4005 bytes.
- Asset API check: both generated SVG assets return 200 with image/svg+xml content type.
- Project check: node-d3 and node-three now have assetUrl and provider local-visual-renderer in /api/project.
- Browser check: Studio nodeId=node-d3 shows D3 preview plus Asset summary with the generated project-asset URL and path.
- Browser check: tldraw nodeId=node-d3 shows the generated project-asset URL in the Inspector asset summary.
- Project assets API check: both generated visual SVGs are listed as ready project assets with visualKind metadata.
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /studio/project-ascendant-intro?projectId=project-ascendant-intro&nodeId=node-d3 returned 200 after initial compile.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro&nodeId=node-d3 returned 200 after initial compile.
- Dev restart after build: generated D3 project asset endpoint returned 200.
Remaining:
- Visual asset export currently writes SVG snapshots, not PNG/video clips.
- Three asset export is a vector orbit-style representation, while the Inspector preview remains the real WebGL canvas.
- Remotion D3/Three scenes still render from the structured contract rather than directly consuming the exported SVG asset.
- tldraw first-load JS remains large; current build shows 563 kB route size and 668 kB first-load JS.
Next:
- Add optional PNG rasterization/export for visual assets.
- Wire exported visual assets into Remotion scene selection where the user chooses asset-based rendering.
- Add real waveform extraction when TTS/audio assets consistently expose waveform or sample-level amplitude data.
```

```txt
Date: 2026-06-09
Phase: P8 Visual Asset Remotion Render Mode
Done:
- Added renderMode, assetId, assetUrl, and assetSource fields to D3 and Three scene specs.
- Canvas compilation now carries exported D3/Three project assets into AstroVideoSpec.
- Existing D3/Three nodes with assetUrl compile as asset scenes by default, while nodes without assets remain contract-rendered.
- export-visual-asset now switches the selected D3/Three node to renderMode=asset after writing the SVG asset.
- Remotion D3DiagramScene and ThreeScene now load exported visual assets through RemoteVisualAsset in asset mode.
- Remotion still keeps the original structured contract renderer as fallback and as an explicit user-selectable mode.
- Studio Inspector now exposes Render mode for D3 and Three nodes.
- tldraw Inspector now exposes the same Render mode control for D3 and Three nodes.
- Recompiled the current project spec so node-d3 and node-three use the latest exported SVG assets in video preview specs.
Validation:
- pnpm typecheck
- pnpm lint
- API check: /api/project?projectId=project-ascendant-intro returns D3 and Three scenes with renderMode=asset and project asset URLs.
- Asset API check: generated D3 and Three SVG assets return 200 with image/svg+xml content type.
- Browser check: Studio nodeId=node-d3 shows Render mode=Asset and the generated project-asset URL.
- Browser check: tldraw nodeId=node-d3 shows Render mode=Asset and the generated project-asset URL.
- Browser console check: only the known tldraw zh-cn missing-message warning remains.
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /studio/project-ascendant-intro?projectId=project-ascendant-intro&nodeId=node-d3 returned 200 after initial compile.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro&nodeId=node-d3 returned 200 after initial compile.
- Dev restart after build: generated D3 project asset endpoint returned 200.
Remaining:
- Visual asset mode currently consumes exported SVG assets; PNG rasterization and transparent overlays are still future work.
- Three final asset mode uses the exported vector orbit SVG, while the Inspector preview remains the live WebGL preview.
- Standalone Remotion CLI rendering of relative /api/project-asset URLs still needs an explicit asset origin strategy before full MP4 export is promoted.
- tldraw first-load JS remains large; current build shows 563 kB route size and 668 kB first-load JS.
Next:
- Add asset origin handling for standalone Remotion render jobs.
- Add optional PNG rasterization/export for visual assets.
- Add real waveform extraction when TTS/audio assets consistently expose waveform or sample-level amplitude data.
```

```txt
Date: 2026-06-09
Phase: P8 Remotion Render Job Asset Origin
Done:
- render-sample.ts now accepts --spec, --output, --asset-origin, --frame, and --frame-range.
- The Remotion render script resolves relative /api/project-asset URLs against an explicit asset origin before rendering.
- Video renders are no longer muted by default; pass --muted only for silent test exports.
- Added frameRange support so short MP4 verification clips can be rendered without exporting the full project.
- render-preview jobs now render a PNG still through the Remotion package and register it as a project image asset.
- render-video jobs now render an MP4 through the Remotion package and register it as a project video asset.
- The render job runner writes the current project spec to the project asset folder before rendering.
- Render jobs update the preview/export canvas node with assetId, assetPath, assetUrl, provider, and renderedAt.
- Added export as a project asset usage so final renders can be tracked separately from scene/chart/audio assets.
Validation:
- pnpm typecheck
- pnpm lint
- Direct Remotion still check: rendered D3 asset scene frame 1020 to data/exports/p8-asset-render-d3-still.png.
- Direct Remotion MP4 check: rendered frame range 1020:1080 to data/exports/p8-asset-render-d3-clip.mp4.
- ffprobe check: direct MP4 duration is 2.090667 seconds and size is 100633 bytes.
- API job check: render-preview succeeded and registered project-asset-remotion-2026-6-9-07-35-22-1780961722973.
- API asset check: render-preview asset endpoint returns 200 image/png with PNG signature.
- API job check: render-video succeeded and registered project-asset-remotion-2026-6-9-07-38-43-1780961923424.
- API asset check: render-video asset endpoint returns 200 video/mp4 with ftyp signature.
- Project check: node-preview points to the generated preview PNG asset.
- Project check: node-export points to the generated MP4 asset and project status is exported.
Remaining:
- Full-length MP4 export was not run in this phase; the verified path uses a short D3 scene frameRange for speed.
- render-video currently uses local assetOrigin=http://localhost:3000 in dev; deployment should set ZEROFLOW_ASSET_ORIGIN.
- Render worker is still invoked by the Web server process via pnpm; a dedicated worker queue remains a future hardening step.
Next:
- Add a production-friendly render worker boundary and configurable asset origin.
- Add a UI affordance for short preview render vs full video render.
- Add optional PNG rasterization/export for visual assets.
```

```txt
Date: 2026-06-09
Phase: P8 RunningHub IndexTTS Existing CLI Config
Done:
- Confirmed ZeroFlow provider env names: DEEPSEEK_API_KEY, YUNWU_API_KEY, RUNNINGHUB_API_KEY, INDEXTTS_CLI_DIR.
- Added dotenv parsing helper in @zeroflow/providers without writing or copying secrets.
- IndexTTS provider now reads RUNNINGHUB_API_KEY from the existing G:\ob-book\indextts-cli\.env when the process env is not set.
- IndexTTS provider now reuses referenceAudioFileName/referenceAudio from existing RunningHub manifests when job input does not pass a reference.
- Provider health now uses the shared IndexTTS runtime config, so RunningHub can report ready from the existing CLI project.
- /api/providers/check now derives provider summary booleans from health readiness instead of raw env checks.
Validation:
- Provider health check: runninghub reports configured=true, ready=true, status=ready, details=CLI ready at G:\ob-book\indextts-cli.
- Provider health summary check: providers.runninghub=true.
- Secret handling check: no API key is written into ZeroFlow source or docs; the existing CLI .env is read in memory only.
Remaining:
- DeepSeek and Yunwu still require process env configuration in this dev server session; their provider implementations are ready but no key was written to disk.
- Live RunningHub TTS generation was not run in this phase to avoid spending credits unintentionally; health and CLI config discovery are verified.
Next:
- Start dev/prod processes with DEEPSEEK_API_KEY and YUNWU_API_KEY provided through the environment or a local secret manager.
- Add a provider settings panel that explains configured/ready/needs-input states without exposing secret values.
- Add a deliberate confirmation path before live paid provider calls.
```

```txt
Date: 2026-06-09
Phase: P8 Render Controls: Still, Clip, Full Video
Done:
- Added a shared render job helper for preview/export canvas nodes.
- Preview nodes now submit render-preview with a configurable still frame, defaulting to frame 30.
- Export nodes now submit render-video as either a short clip or full video.
- Export nodes default to clip mode with frameRange=0:60 so QA previews do not accidentally render the full project.
- Studio Inspector now exposes Still frame, Export scope, and Frame range controls for render nodes.
- tldraw Inspector now exposes the same render controls and writes them back to CanvasDocument node data.
- tldraw shape action labels now reflect the selected export scope: Render clip or Render full video.
- Render job buttons no longer pass projectId through node input; the API route owns the project context.
Validation:
- Browser check: Studio node-export shows Render clip, Export scope=Clip, and Frame range=0:60.
- Browser check: tldraw node-export Inspector shows Render clip, Export scope=Clip, and Frame range=0:60.
- Browser check: tldraw canvas node action button shows Render clip instead of the old Render video label.
- API job check: latest render-video job job-519cb50f-a2f5-4e08-b8d6-38b295372b1f succeeded with input frameRange=0:60.
- API project check: node-export points to project-asset-remotion-2026-6-9-08-04-48-1780963488633.
- Asset API check: generated clip asset returns 200 with video/mp4 content type.
- ffprobe check: generated clip duration is 2.090667 seconds and size is 143624 bytes.
- pnpm typecheck
- pnpm lint
- pnpm build
- Dev restart after build: GET /api/project?projectId=project-ascendant-intro returned 200.
- Dev restart after build: GET /studio/project-ascendant-intro?projectId=project-ascendant-intro&nodeId=node-export returned 200.
- Dev restart after build: GET /tldraw?projectId=project-ascendant-intro&nodeId=node-export returned 200.
- Dev restart after build: latest generated clip asset endpoint returned 200 video/mp4.
- Dev restart Browser check: Studio and tldraw still show Render clip with Export scope=Clip and Frame range=0:60.
Remaining:
- Full-length MP4 export remains available through Export scope=Full video but was not run in this phase to avoid a slow paid-style render path during QA.
- Browser screenshot capture timed out in the in-app Browser runtime; DOM, form-value, API, build, and restart smoke checks passed.
- The render worker still runs inside the Web server process; a dedicated worker queue remains future hardening.
Next:
- Add a production-friendly render worker boundary and configurable asset origin.
- Add optional PNG rasterization/export for visual assets.
- Add provider settings UI for DeepSeek/Yunwu/RunningHub readiness without exposing secrets.
```

## 12.2 tldraw 接入计划

tldraw 不放在当前轻量画布 MVP 的第一优先级里。当前画布已经能承载项目、资源、任务和 Remotion 预览闭环，过早替换底座会拖慢 AI/TTS/资源链路验证。

当前状态：
- 兼容层和真实 Editor MVP 已完成：业务 schema 仍以 CanvasDocument 为准，tldraw 作为可替换的编辑器外壳。
- `/tldraw?projectId=...` 已可打开项目、移动节点并同步回 CanvasDocument。
- 本地开发期优先使用 `/api/project/canvas/tldraw?projectId=...`，避免动态路由在当前 Windows dev server 上触发 `spawn EPERM`。

计划接入点：
- P6.5：在 P5 任务系统基本稳定、P6 文案/分镜闭环稳定后，开始 tldraw 技术迁移评估。
- P7 后半段：当素材节点、音频节点、星盘节点都需要更强的拖拽、缩放、分组、多选、对齐和批量操作时，正式迁移到 tldraw。
- P8 前：tldraw 作为 Three.js/D3/高级动画节点的画布底座，统一承载更复杂的视觉资源。

迁移标准：
- 现有 CanvasDocument 不能丢，tldraw shape 需要映射到我们的 CanvasNode。
- 任务状态、资源引用、spec 编译必须继续由业务 schema 驱动，而不是被 tldraw 内部状态绑死。
- 先做兼容层，再替换 UI；不要把 P5-P7 已经跑通的生成链路推倒重来。

## 12.3 tldraw 连接线层级修复

```txt
Date: 2026-06-09
Phase: P8 tldraw Edge Layering Cleanup
Done:
- tldraw edge sync now normalizes draw order after every edge rebuild.
- ZeroFlow arrow shapes are sent behind all ZeroFlow node cards.
- ZeroFlow node cards are brought to front after edge creation, preventing lines from covering card content.
- Large relation labels such as uses/produces/renders are hidden from the canvas while the relation is preserved in edge meta.
- Edge opacity is reduced so dependency lines read as background structure instead of foreground UI.
Validation:
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- Browser check: /tldraw?projectId=project-ascendant-intro renders 22 node cards and 23 edge shapes.
- Browser check: max edge z-index 8022 is below min node z-index 8023.
- Browser check: visible uses/produces/renders relation label count is 0.
- Browser interaction check: clicking the script card selects it and updates Inspector to 文案/node-script.
- Browser console check: no app errors; only known tldraw zh-cn missing translation warnings.
Remaining:
- The graph can still become visually dense when many edges converge; routing/bundling is a future readability improvement.
- tldraw zh-cn missing translation warnings are upstream UI copy warnings, not caused by this edge layering fix.
Next:
- Add optional relation visibility controls when the canvas starts needing edge inspection.
- Consider curved/routed edges or grouped dependency lanes for dense generated projects.
```

## 12.4 渐进式节点生成迁移

```txt
Date: 2026-06-09
Phase: P6/P7 Progressive Node Generation Migration
Decision:
- 新建项目默认画布只能创建主题节点。
- 完整流程节点不能作为新项目默认状态，只能作为 demo/template preview。
- 所有下游生产物都必须由上游节点按钮触发后创建。
Required behavior:
- Topic node -> 点击生成文案 -> 创建或更新 Script node，并创建 topic -> script 连线。
- Script node -> 用户修改文案并点击生成分镜 -> 创建对应数量的 Scene nodes，并创建 script -> scene 连线。
- Scene node -> 按需生成 Caption/Voice/Chart/Image/D3/Three 节点，并创建 scene -> resource 连线。
- Scene/resource ready -> 创建 Composition/Preview/Export 节点。
Implementation tasks:
- 拆分 production seed 与 demo seed：production seed 只含 topic node，demo seed 可保留完整示例画布。
- `generate-script` 支持 upsert Script node，不再依赖预置 `node-script`。
- `generate-storyboard` 支持从 Script node 读取当前文案并创建 Scene nodes，不再依赖预置 storyboard node。
- `generate-tts`、`align-captions`、`generate-chart`、`generate-image` 支持从 Scene node 创建或更新对应资源节点。
- Studio 和 tldraw 的节点按钮只展示当前节点的下一步动作。
- 新生成节点后刷新画布并自动选中新节点。
Validation:
- 新建项目后画布只出现主题节点。
- 点击主题节点生成文案后才出现文案节点。
- 修改文案后点击生成分镜才出现分镜节点。
- 每个资源节点只在对应分镜触发后出现。
- Remotion 预览和导出只在可渲染内容存在后出现。
Status:
- In Progress
```

## 12.5 渐进式节点生成第一段落地

```txt
Date: 2026-06-09
Phase: P6 Progressive Topic -> Script -> Scenes
Done:
- Split production seed from demo seed in db and web canvas seed modules.
- Production defaultCanvasDocument now contains only the topic node and no edges.
- Existing full example canvas is retained as demoCanvasDocument for demo/template-preview use.
- New VideoProject creation now starts from the topic-only production canvas.
- compileCanvasToAstroVideoSpec no longer creates fallback video scenes for a topic-only or script-only canvas.
- Preview panel now shows an empty state instead of mounting Remotion Player with durationInFrames=0.
- generate-script now uses the triggering topic node as source and creates/updates the script node plus topic -> script edge.
- generate-storyboard now uses the triggering script node as source and creates scene nodes plus script -> scene edges.
- generate-storyboard no longer creates caption nodes; caption/voice/chart/image/visual nodes remain separate downstream actions.
- Studio Inspector now maps topic -> Generate script and script -> Generate storyboard, and auto-selects new script/scene nodes.
- tldraw cards and Inspector now map topic -> Generate script and script -> Generate storyboard, and auto-select the generated script node.
Validation:
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/db typecheck
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video typecheck
- API check: new project starts with 1 topic node, 0 edges, 0 spec scenes.
- API check: generate-script creates node-script, keeps spec scenes/audio empty, and creates topic -> script edge.
- API check: generate-storyboard with sceneCount=3 creates 3 scene nodes, 0 caption nodes, and script -> scene edges.
- Browser Studio check: new project starts with only topic node, no script node, and an empty preview state.
- Browser Studio check: clicking 生成文案 creates script node, selects it, and shows 生成分镜.
- Browser Studio check: clicking 生成分镜 creates 5 scene nodes and no caption/voice nodes.
- Browser tldraw check: new project starts with one topic card, 0 edges, and Generate script.
- Browser tldraw check: clicking Generate script creates script card, selects it, and shows Generate storyboard.
Remaining:
- Scene node downstream resource actions are implemented in 12.6.
- Composition, preview, and export gated nodes are implemented in 12.7.
- Existing persisted demo projects are not automatically collapsed to topic-only; this preserves current work but means old projects can still show the old full graph.
Next:
- Implement Composition layout controls and scoped render behavior.
- Add a user-facing demo/template project path if we want to keep showing the full example graph separately from production projects.
```

## 13. 当前推荐起步

建议从 P0 开始，不跳阶段。

第一轮开发目标：

```txt
P0 + P1 + P2 + P3
```

也就是先完成：

- 工程骨架
- 核心 schema
- 最小无限画布
- 画布/spec 到 Remotion 静态预览

这四步跑通后，再接数据库、真实 AI、TTS、星盘和高级视觉。

## 12.6 Progressive Scene -> Resource Nodes

```txt
Date: 2026-06-09
Phase: P6/P7 Scene resource node generation
Done:
- Scene nodes now expose on-demand actions for Caption, Voice, Chart, Image, D3, and Three resources.
- align-captions can run from one Scene node and creates/updates only that Scene's Caption node.
- generate-image, generate-chart, and generate-tts can run from one Scene node and create/update Image, Chart, and Voice resource nodes instead of overwriting the Scene node.
- create-d3-node and create-three-node job types create reusable visual contract nodes from a Scene node.
- Generated resource nodes carry sceneId and sourceSceneNodeId so the canvas and compiler can bind them back to the originating Scene.
- compileCanvasToAstroVideoSpec now prefers scene-scoped resource nodes over unrelated global resource nodes.
- Scene-scoped Voice nodes can produce audio tracks at the matching scene start time.
- Studio Inspector shows a 2-column resource action grid for Scene nodes and auto-selects newly generated resource nodes.
- tldraw Inspector shows the same Scene resource action grid and can run explicit resource jobs.
- TTS dryRun jobs bypass live-provider confirmation so smoke tests can validate Voice node creation without spending external quota.
Validation:
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm --filter @zeroflow/db typecheck
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video typecheck
- API smoke: topic-only project -> generate-script -> generate-storyboard(sceneCount=2) creates only topic/script/2 scenes before resource actions.
- API smoke: running one Scene through align-captions, generate-image, generate-chart, create-d3-node, create-three-node, and generate-tts(dryRun=true) creates one scoped resource node of each kind.
- Browser Studio check: selected Scene displays Caption/Voice/Chart/Image/D3/Three resource buttons.
- Browser Studio check: Add Three creates node-three-scene-generated-1 and auto-selects the Three node inspector.
- Browser tldraw check: selected Scene displays the same resource buttons, and scene/resource connection lines remain behind node cards.
Remaining:
- Composition, Preview, and Export gated nodes are implemented in 12.7.
- Voice UI still defaults to real TTS with confirmation; dryRun is only an explicit job input for tests/debugging.
- Scene resource precedence is currently Chart -> Image -> D3 -> Three when a text Scene has multiple visual resources; a later composition step should expose an explicit visual layout choice.
Next:
- Review whether Composition should become a multi-resource layout editor instead of a lightweight contract node.
- Add explicit visual resource selection/layout controls when multiple visual resources exist for one Scene.
```

## 12.7 Progressive Composition -> Preview -> Export Nodes

```txt
Date: 2026-06-09
Phase: P7/P8 gated composition, preview, and export node creation
Done:
- Added create-composition-node, create-preview-node, and create-export-node job types.
- create-composition-node creates or reuses a scene-scoped Composition node from a Scene node.
- create-preview-node creates or reuses the project Preview node from a Composition node.
- create-export-node creates or reuses the project Export node from a Preview node.
- The progressive render chain now uses a sparse main line: scene -> composition -> preview -> export.
- Scene Inspector resource grid now includes Composition as the next downstream action.
- Studio Composition nodes expose Create preview; Preview nodes expose Render still plus Create export; Export nodes expose Render clip/full video.
- tldraw Scene Inspector includes Composition in the resource action grid.
- tldraw Composition cards use Create preview as their default card action.
- Auto-selection priority now prefers exportNodeId -> previewNodeId -> compositionNodeId before generic nodeId.
Validation:
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm --filter @zeroflow/db typecheck
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video typecheck
- API smoke: topic -> script -> scenes -> create-composition-node -> create-preview-node -> create-export-node creates one node of each downstream kind.
- API smoke: render edges are scene -> composition, composition -> preview, and preview -> export.
- Browser Studio check: selected Scene shows Create composition, clicking it selects Composition.
- Browser Studio check: Composition creates/selects Preview, Preview creates/selects Export, Export shows Render clip.
- Browser tldraw check: selected Scene shows Composition action and canvas displays the scene -> composition -> preview -> export chain with edges behind cards.
Remaining:
- Composition visual selection and participation controls are implemented in 12.8.
- Preview and Export nodes exist progressively, but render jobs still render the full current project spec rather than a composition-scoped clip unless the export frame range is edited.
Next:
- Tighten render-preview/render-video around composition/export scope.
```

## 12.8 Composition Scene Control Layer

```txt
Date: 2026-06-09
Phase: P7/P8 composition-scoped scene controls
Done:
- Composition nodes now participate in compileCanvasToAstroVideoSpec as scene-scoped control nodes.
- Composition data can override a Scene's primary visual through primaryVisualKind: auto, text, chart, image, d3, or three.
- Auto preserves the existing resource inference order; Text forces a text scene; Chart/Image/D3/Three only take over when that scene already has the matching resource node.
- Composition durationSec now overrides the source Scene duration for text, chart, image, D3, and Three scene outputs.
- Composition transition now overrides scene transitions using the existing cut/fade/wipe/zoom transition set.
- includeCaption=false removes caption text/cues from the compiled scene while preserving base layout defaults.
- includeVoice=false removes scene-scoped Voice audio tracks from the compiled spec.
- create-composition-node now seeds default composition controls: primaryVisualKind=auto, layoutPreset=single, includeCaption=true, includeVoice=true.
- Studio Composition Inspector now exposes Primary visual, Layout, Transition, Duration, Caption, and Voice controls.
- tldraw Composition Inspector exposes the same controls and can persist boolean checkbox values.
Validation:
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm --filter @zeroflow/db typecheck
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video typecheck
- API smoke: scene with Chart+Image resources and Composition auto compiles to astro-chart.
- API smoke: Composition primaryVisualKind=image compiles the same scene to sketch.
- API smoke: Composition primaryVisualKind=chart compiles the same scene back to astro-chart.
- API smoke: Composition primaryVisualKind=text compiles the same scene to text even when visual resources exist.
- API smoke: Composition durationSec and transition override the compiled scene output.
- API smoke: includeVoice=false removes scene-scoped audio tracks from the final spec.
- Browser tldraw check: selected Composition Inspector shows Primary visual, Layout, Transition, Caption, and Voice controls with no console errors.
- Browser Studio check: selected Composition Inspector shows the same controls with no console errors.
Remaining:
- layoutPreset is persisted and visible, but the Remotion renderer does not yet implement split/overlay layout semantics.
- Preview and Export scoped spec rendering is implemented in 12.9.
Next:
- Teach the Remotion scene renderer to honor Composition layoutPreset for single/split/overlay visual layout.
```

## 12.9 Composition-Scoped Preview/Export Render

```txt
Date: 2026-06-09
Phase: P8 scoped rendering from canvas nodes
Done:
- render-preview/render-video now resolve their target node before writing the Remotion spec.
- Preview nodes trace sourceCompositionNodeId -> Composition -> source Scene.
- Export nodes trace sourcePreviewNodeId -> Preview -> Composition -> source Scene.
- Composition and Scene nodes can also be resolved directly as scoped render targets for future job entry points.
- Preview renders now write a composition-scoped spec when a source Scene can be resolved.
- Export renders now write a composition-scoped spec by default for clip exports, while exportScope=full preserves the full project spec behavior.
- Scoped specs contain only the target Scene and shift any scene-starting audio tracks back to 0s.
- Render job metadata/output now records renderScope, sourceSceneId, sourceCompositionNodeId, and specSceneCount.
Validation:
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm --filter @zeroflow/db typecheck
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video typecheck
- API + Remotion smoke: two-scene project -> Composition for scene 2 -> Preview -> render-preview writes a spec with exactly one scene.
- API + Remotion smoke: render-preview output reports renderScope=composition and sourceSceneId=scene-scoped-preview-2.
Remaining:
- Remotion single/split/overlay layout rendering is implemented in 12.10.
- Export clip still uses the editable frameRange field when present, so default clip length is still controlled by the Export node UI.
Next:
- Consider making Export clip default frameRange derive from the scoped Composition duration.
```

## 12.10 Remotion Layout Presets

```txt
Date: 2026-06-09
Phase: P8 Remotion layout rendering
Done:
- Added sceneLayoutPresetSchema to core SceneSpec with single, split, and overlay values.
- compileCanvasToAstroVideoSpec now writes Composition layoutPreset into compiled scenes.
- Remotion SceneRenderer now wraps every scene with a layout frame.
- single preserves the original scene rendering exactly.
- split renders a left title/narration panel and scales the original scene into a right-side visual frame.
- overlay preserves the original full scene and adds a top translucent title/narration overlay.
- Scoped render-preview specs preserve layoutPreset, so a selected Composition can preview its layout directly.
Validation:
- pnpm --filter @zeroflow/core typecheck
- pnpm --filter @zeroflow/web typecheck
- pnpm --filter @zeroflow/web lint
- pnpm --filter @zeroflow/db typecheck
- pnpm --filter @zeroflow/core validate:examples
- pnpm --filter @zeroflow/remotion-video typecheck
- API + Remotion smoke: split layout render-preview writes a one-scene spec with layoutPreset=split and produces a nonblank PNG.
- API + Remotion smoke: overlay layout render-preview writes a one-scene spec with layoutPreset=overlay and produces a nonblank PNG.
Remaining:
- split/overlay are currently scene-level layout frames; they do not yet compose multiple visible resources at once.
- Export clip still uses the editable frameRange field when present, so default clip length is still controlled by the Export node UI.
Next:
- Extend Composition from primaryVisualKind to multi-layer resource slots so split/overlay can show, for example, chart plus sketch together.
- Consider making Export clip default frameRange derive from the scoped Composition duration.
```
