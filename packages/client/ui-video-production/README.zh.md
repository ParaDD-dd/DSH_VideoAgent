---
description: "用于项目历史、画面预览、三轨时间轴和常驻 DSH Agent 的视频制作 Web 工作区。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video-production

[English](README.md) | 中文

## 概述

`ui-video-production` 为 `video` profile 增加视频项目浏览器。每个项目有一个 Workspace 和多个可回看的 `video-production` Session；面板读取所选项目的 `script.json` 与生成帧文件，并为所选 Session 嵌入 DSH Conversation。

## 目录

- [使用本 package](#use-this-package)
- [项目与时间轴数据](#project-and-timeline-data)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本 package

运行 `dsh --profile video`，即可与标准 Web 应用及 `dsh-video-app` 中的 Host 媒体工具一起加载本插件。进入视频模式会清除标准会话选择；退出时恢复此前在 DSH 中选择的会话。

创建项目时会打开已安装的目录选择器，让用户选择上级文件夹，再创建命名目录、注册 Workspace，并启动 `agentPreset: 'video-production'` 的 Session。项目中的“新对话”会在同一个 Workspace 下启动另一个 preset Session。项目与对话历史直接来自 Workspace 关系和 Session 已记录的 preset 投影；插件不维护第二套项目数据库。

Agent 区域渲染 `ui-conversation` 声明的 `conversation.embed` Slot。它复用标准消息渲染器、Markdown、composer、中间步骤折叠与 Session 状态，而不是另建聊天实现。从嵌入式 Conversation 中选择工作区时，会打开该工作区最近的视频 Session；若没有，则创建一个 `video-production` Session。视频面板始终保持打开。

<a id="project-and-timeline-data"></a>
## 项目与时间轴数据

选中 Session 的 Workspace 根目录包含 `script.json`，其 `version` 为 `1`；`shots` 项包含旁白、画面与转场描述、素材、时长、音频路径、可选缩略图路径及可选的 Qwen 音色覆盖。可选的顶层 `voice` 设置项目默认音色；缺省时使用第一分镜的音色，再缺省则使用 Cherry。解析器只接受正整数画幅尺寸、唯一的正整数分镜顺序，以及不含路径穿越段或 Windows 驱动器语法的项目相对斜杠音频与缩略图路径。

画面轨道通过 Workspace Files Remote 和 `file` resource protocol 读取非空缩略图。预览面板按需为所选 `video-production` Session 启动 HyperFrames `play`，并将播放器嵌入画布；选择时间轴分镜会跳转到该分镜累计起始时间，使动画与计时音频同步播放。每个画面分镜都有“预览分镜”按钮，可从该镜头起点播放并在结束处暂停；若 HyperFrames 尚未就绪，按钮会启动播放器并定位分镜，之后需手动按播放器的播放键。当前分镜及之前分镜的时长确定后，按钮才可用。所选分镜的独立音频控件在视频播放器启动后仍会显示；播放独立音频会暂停视频，启动分镜预览则会暂停独立音频。预览区顶部的切换按钮会打开可滚动的分镜总览，每张卡片分别显示缩略图、字幕、画面描述和时长；打开总览会暂停视频，但不会卸载播放器。播放器默认开启声音，用户按下播放后开始播放。Workspace 根目录可以直接包含 `index.html`，也可以包含一个带有 `index.html` 和 `hyperframes.json` 的直接子项目目录。切换 Session 或卸载 Host 插件时会停止预览进程。选择 clip 仅更改本地预览选择，不写入 Session 日志。

HyperFrames 预览就绪后，预览画面提供全屏切换按钮。按钮使用浏览器 Fullscreen API 将包含播放器的画面设为全屏；进入全屏后按钮仍可使用，按浏览器方式退出也会同步按钮状态。浏览器拒绝全屏请求时会显示错误，但不会停止播放。

profile 组合与 Host 工具配置由 `video-app` 负责。本 package 的 Host entry 不提供独立服务；UI 没有可能与浏览器显示结果分歧的运行时关系，因此不发布 invariant companion。

全局音色选择器使用 Qwen 文档列出的 17 个 Qwen3-TTS-Flash 音色。更改选择器只会选择候选音色；“试听音色”只试听候选项，不改变项目音频。点击“应用并重新生成全部分镜”才会请求 Agent 更新项目音色、清除分镜覆盖并重新生成全部分镜。所选分镜可以跟随全局音色或单独覆盖；这两种操作都会要求 Agent 只重生成该分镜。Agent 将音色保存到 `script.json`，下载替换音频但不覆盖已有文件，测量实际时长，并更新受影响分镜的音频路径及时长。重生成需要为视频 preset 配置 Qwen API key。

全局选择器旁的“试听音色”按钮会为当前所选音色生成并播放一条固定中文短句。它不会提交 Conversation 消息或更改项目音频。Qwen 会返回临时链接；播放需要已配置 `DASHSCOPE_API_KEY`，且浏览器能够访问该链接。

<a id="model-experience"></a>
## 模型体验

### 视频工作区 UI

#### 模型看到什么

音色更改通过所选 Session 的 Conversation 服务提交普通用户消息，其中包含所选 `voice` 和重生成范围，供 Agent 使用 `text_to_speech` 执行并更新 `script.json`。试听使用单独的固定样例 Host 路由，不增加 Session event、提示词内容或工具 schema。

#### Token 影响

更改音色的指令会消耗正常的 Session 输入 token；音色试听和其他 UI 状态不增加 token。

#### KV Cache effect

UI 不增加模型可见前缀；模型可见内容与工具 schema 仍由 Session 的 Agent preset 负责。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 动态预览需要有效的 HyperFrames 项目 `index.html`、本地 HyperFrames CLI 和浏览器；它不会渲染或导出 MP4。
- 音频轨道显示文件名与确定性的波形占位图；试听控件位于所选分镜的预览面板中，而不直接位于轨道上。
- 系统不会扫描现有目录中的 `script.json`；项目必须注册为 Workspace，并拥有使用 `video-production` 的 Session。

<a id="dev-note"></a>
### 开发备注

项目归属、嵌入式 Conversation Slot 与版本化脚本格式见[视频工作区 Agent Note](../../../.agents/notes/implemented/feature/2026-09-24-video-production-web-workspace.zh.md)。
