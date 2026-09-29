---
description: "视频制作 UI 与媒体工具：项目列表、生成缩略图、语音、HyperFrames 检查与快照预览，以及经明确授权的渲染。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-video-app

[English](README.md) | 中文

## 概述

为 Web profile 增加专用的视频制作工作区，以及图像、语音和 HyperFrames 工具。该层构建于 `dsh-base` 与 `dsh-web-app` 之上；运行 `dsh --profile video` 启用它。视频 UI 默认显示标准 DSH Web 界面，并可切换到项目历史、预览、时间轴与现有 Agent 对话。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

使用随包提供的 [`video` profile](../../../apps/cli/README.zh.md#profiles) 运行包含视频工作区与宿主媒体工具的 Web GUI。每个项目使用独立的 Workspace，并可包含多个 `video-production` Session。创建项目会打开已安装的目录选择器来指定父目录。项目与对话历史直接来自 Workspace 列表和 Session 已记录的 Agent preset。

视频工具行归宿主管理，默认禁用。`video-production` preset 会在其作用域内启用图像、语音和 HyperFrames 工具，同时保留 Web 设置中可用的全局设置提供方。Agent 工作流会写入 `script.json`，在脚本确认后生成媒体和快照，并且只有在用户明确授权导出后才调用 `video_render`。

### 组合方式

```sh
dsh --profile video
```

profile 按顺序应用 `dsh-base`、`dsh-web-app` 与 `dsh-video-app` 三个 patch layer。其他 profile 不会加载此包的工具或浏览器 UI。

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>实现细节（点击展开）</summary>

该 bundle 只包含 patch。此层把 opt-in 图像生成、Qwen 语音和 HyperFrames 宿主行从共享 base 移出，并增加浏览器视频制作插件。`ui-video-production` 注册 main panel 和顶部切换器；其 Agent 列声明 `conversation.embed`，由 `ui-conversation` 填入与标准页面相同的常驻对话壳。

浏览器通过现有 workspace-file Remote 与 `file` resource protocol 读取 `script.json` 和相对缩略图路径。时间轴从校验后的分镜记录派生字幕、画面、音频三条轨道，不会把预览状态写入 Session 历史。创建项目时会新建目录、注册 Workspace，并创建使用 `video-production` preset 的 Session。新对话会在同一个 Workspace 中创建另一个 preset Session。

此 patch-only bundle 没有独立于所配置插件行的运行时状态，因此不发布 invariant companion。

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 在 Web profile 之后增加媒体工具行与浏览器插件 |
| [`src/index.ts`](src/index.ts) | patch-only bundle 的空 Host entry |
| [`../../client/ui-video-production/README.zh.md`](../../client/ui-video-production/README.zh.md) | 浏览器项目工作区、时间轴、Conversation 嵌入与文件读取行为 |

</details>

<a id="further-exploration"></a>
## 进一步阅读

- [dsh-base](../base/README.zh.md) — 共享宿主服务与模型默认值。
- [dsh-web-app](../web-app/README.zh.md) — 浏览器服务器与 Web Client 组合。
- [视频制作 preset](../../preset/agent-presets/presets/video-production/agent.cordis.yml) — 脚本、媒体、审核与渲染阶段指令。
- [HyperFrames 工具](../../video/tool-hyperframes/README.zh.md) — `video_lint`、`video_snapshot` 与 `video_render`。
- [视频工作区 note](../../../.agents/notes/implemented/feature/2026-09-24-video-production-web-workspace.zh.md) — 项目归属与嵌入 Conversation 的依据。

<a id="model-experience"></a>
## 模型体验

### 视频 preset 工具

#### 模型看到什么

`video-production` preset 会向每个视频 Session 提供图像生成、text-to-speech 和 HyperFrames 工具 schema。宿主工具行在 preset 以外保持禁用；浏览器工作区本身不会发起模型请求。

#### Token 影响

preset 工具 schema 会进入每个视频 Session 的工具上下文；UI bundle 不添加提示词文本。

#### KV Cache 影响

每个 Session 的 preset composition 固定其工具 schema。UI bundle 自身不会贡献模型 prompt 文本或工具 schema。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 项目历史仅包含至少有一个 Session 已记录为 `video-production` preset 的 Workspace。
- 系统不会扫描既有目录中的 `script.json`；导入项目需要先将其目录注册为 Workspace，再创建视频 Session。

<a id="dev-note"></a>
### 开发备注

无。
