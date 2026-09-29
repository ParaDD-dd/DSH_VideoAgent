# Agent Note：视频项目由 Workspace 与 Session 管理

Status: implemented

[English](2026-09-24-video-production-web-workspace.md) | 中文

## Problem

视频 preset 需要专用浏览器工作区，但不能复制 DSH 的对话行为，也不应增加第二套项目历史存储。Agent 与 UI 还需要共享稳定位置来保存脚本和生成的画面预览。

## Decision

随附的 `video` profile 组合 `dsh-base`、`dsh-web-app` 与 `dsh-video-app`。视频 bundle 拥有视频工作区面板和 Host 图像、语音、HyperFrames 配置行；其他 profile 不会加载这些配置行或面板。

每个项目由一个 Workspace 目录和一个或多个使用 `video-production` Agent preset 创建的 Session 组成。Client Session create API 接受 `agentPreset`，并在创建调用结束前将 Host 返回的值发布到本地 Session 投影。项目列表及每个项目的对话历史直接由 Workspace 关系和已记录的 preset 派生，不维护第二个项目目录。新项目使用明确选定的上级目录；新对话复用项目的 Workspace。

标准工作区与视频工作区是不同的 `main` entry。进入视频模式会清除标准会话选择，退出时会将其恢复。视频面板声明 `conversation.embed`，它镜像已注册的 `main.conversation` entry。每个 Slot key 只有一个声明者，因此只有源 entry 声明 Conversation 的子 Slot。嵌入式 shell 接受面板提供的工作区选择动作：视频工作区打开该 Workspace 最近的视频 Session，若没有则使用 preset 创建一个，而不调用标准导航；未提供时，DSH 保持既有行为。项目目录选择器通过同一机制在视频面板中复用已安装的目录流程。消息、Markdown、composer 和中间活动折叠使用所选视频 Session 的 binding，同时一次只挂载一个编辑器。

Agent 会在项目 Workspace 写入 version-1 `script.json`。画面轨道读取相对 `thumbnailPath`。预览面板为所选 `video-production` Session 启动 HyperFrames 播放器，并跳转到当前分镜累计起始时间，使动画与计时音频同步。每个画面分镜都有预览按钮，可只播放该分镜并在结束时暂停；若播放器尚未就绪，按钮会启动播放器并定位到该分镜，随后由用户手动按下播放。只有当前分镜及之前分镜的时长都已确定时，该按钮才可用。视频播放器运行时，所选分镜的独立音频控件仍保持可见；播放独立音频会暂停视频，启动分镜预览会暂停独立音频。预览区顶部的切换按钮会打开可滚动的分镜卡片总览，分别显示缩略图、字幕、画面描述和时长；打开总览会暂停视频，但不卸载播放器。若 Workspace 根目录有 `index.html`，预览直接使用该目录；否则选择带有 `hyperframes.json` 的唯一直接子项目，多个嵌套项目会以明确的歧义错误结束。动态预览启动前，所选缩略图和相对 `audioPath` 仍可通过浏览器图片和音频控件查看。预览画面通过浏览器 Fullscreen API 进入全屏，退出控件留在画面内，并跟随浏览器的退出状态同步。clip 选择仅保存在 Client 内存，不新增 Session event。

脚本可以记录项目级 `voice` 和分镜级音色覆盖。全局选择器默认使用第一分镜的音色，若无则使用 Cherry。更改选择器只会选择尚未应用的候选音色；试听按钮会试听候选项，不改变项目音频。单独的应用操作会通过 Conversation 提交一条正常记录的输入，要求 Agent 重生成所有分镜并清除覆盖。分镜选择器可以跟随全局音色或请求单镜覆盖，这两种操作都只重生成该分镜。Agent 将替换音频下载到新路径、测量实际时长并更新 `script.json`，保留原音频文件。普通音频生成依次使用分镜覆盖、项目音色、第一分镜音色，再回退到 Cherry。选择器取值与 Qwen3-TTS-Flash 的 17 种音色一致。

全局选择器的试听操作通过同源 Host 路由请求固定中文样例。Host 保管 DashScope 密钥，将请求限制为 UI 的 17 种音色，并返回 Qwen 临时音频链接。Client 播放该链接，不会添加 Conversation 消息、Session event 或项目音频文件；该路由由 `dsh-video-app` 启用，且独立于 Agent 工具启用状态。

## Alternatives considered

**把视频工具和 UI 放进共享 Web 组合。** 这会让视频专用 Host 配置行成为普通 Web profile 的一部分。独立的 `video` profile 保留了标准 profile 的配置树。

**实现视频专用消息渲染器。** 这会复制 Markdown、composer 和活动状态呈现。嵌入 Conversation shell 可复用现有呈现与 Session binding。

**添加单独的视频项目目录。** Workspace 关系和已记录的 Agent preset 已能识别项目，再建目录会造成重复所有权与同步成本。

## Consequences

`video` profile 启动后仍先显示标准 DSH Web 界面，顶部切换器负责进入或离开视频面板。系统不会自动发现既有目录；每个视频项目都必须注册为 Workspace，并拥有使用 `video-production` 的 Session。动态预览需要有效的项目 `index.html` 和本地 HyperFrames CLI 环境；它不会渲染或导出 MP4。音频轨道仍只显示元数据。

带版本的脚本是共享文件数据，不是新的 Session event family。Client 在通过 Workspace Files 读取前会校验缩略图路径，格式错误的路径不会形成文件请求。

## Verification

HyperFrames 项目解析器测试覆盖根目录项目、唯一嵌套项目、项目缺失和多个嵌套项目的歧义情况。Client 测试确认内嵌播放器加载 HyperFrames `play` 提供的 `/composition/index.html` 路由、视频预览启动后仍显示独立音频控件且播放独立音频会暂停视频、画面分镜按钮会跳转并在分镜结束时暂停、预览画面可进入或退出浏览器全屏且全屏请求失败时不会卸载播放、选择和试听全局候选音色不会提交 Conversation 请求而显式应用后才提交全项目重生成，并且单分镜覆盖与继承仍只作用于单镜，以及总览会展示所有分镜内容并保留已挂载的播放器。脚本解析测试覆盖项目默认音色和分镜覆盖。
