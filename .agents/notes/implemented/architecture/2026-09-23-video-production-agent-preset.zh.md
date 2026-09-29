# Agent Note: Video production preset composes scoped HyperFrames tools

Status: implemented

[English](2026-09-23-video-production-agent-preset.md) | 中文

## Problem

视频制作需要稳定的 Agent 工作流：脚本数据要能被 UI 解析，分镜时长要跟随生成的旁白，并且在用户确认前不能启动高成本的 MP4 渲染。现有媒体插件还各自拥有全局 settings 命名空间，因此把普通插件行直接挂进 preset 会与 Host 的 settings 提供方冲突。

## Decision

随附的 `video-production` preset 提供专用的视频制作 Agent，其 persona 定义必须确认的三个阶段：写脚本、制作视频、渲染导出。该 persona 要求每个视频使用独立工程文件夹、保存 UI 可读取的 `script.json`、逐分镜拆分旁白、先生成音频再决定时长、默认使用 HyperFrames HTML 动画、按需生成图片、执行 lint 和 snapshot 检查，并在调用 `video_render` 前取得明确授权。

该 preset 在自己的作用域工具层中挂载已有的图片生成、Qwen TTS 和 HyperFrames 插件。每个插件都接受 `registerSettings: false`；这个只用于组合的设置会跳过全局 settings 区，同时保留 preset 作用域中的工具注册。`dsh-video-app` bundle 增加全局启用所需的 Host 配置行；Web Plugins 设置分区只会在 Host 提供这些命名空间时派发对应卡片。[视频工作区 note](../feature/2026-09-24-video-production-web-workspace.zh.md)记录浏览器如何创建和列出项目 Workspace 与 Session。

工程初始化不依赖 CLI `init` 成功。在 Windows DSH 执行世界中，`npx hyperframes init` 可能以 `0xC0000409` 退出；preset 要求 Agent 停止重试，在新的工程目录中用文件工具创建与官方 blank 模板等价的 `hyperframes.json`、`package.json`、`meta.json` 和 `index.html`，再用 `video_lint` 验证。Agent 必须把这些文件说明为 DSH 手工 fallback 创建，而不是 `init` 的产物。`init` 成功时也必须先通过同样的文件验证才能继续。

HyperFrames 工具包声明 `hyperframes@^0.8.61` 为生产依赖。每个工程在 scripts 中记录同一固定 CLI：`npx --yes hyperframes@0.8.61`；因此 DSH fallback 仍保持工程元数据可复现，而不依赖全局安装。

## Alternatives considered

**让 preset 启用 Host settings 区。** 这会破坏作用域所有权，并因 `SettingsProvider` 对每个命名空间只允许一次注册而失败。因此 preset 使用不注册 settings 的组合路径。

**把媒体工具放进全局工具层。** 全局注册会把视频生成能力暴露给每个 preset，而没有选择视频模式的 Agent 也会得到不完整的工作流提示词。作用域注册让能力和提示词保持在一起。

**在新的视频专用包中复制媒体工具实现。** 复制会让提供方行为和生命周期修复分散到两套实现。现有插件继续作为唯一实现，只增加 preset 所需的显式组合选项。

## Consequences

Agent preset 选择器会列出 `video-production`；Web 组合测试证明，只有挂载该 preset 后，视频提示词和五个媒体工具才会对 Agent 可见。Host 插件设置仍可供普通的 Host 工具实例使用。选中视频制作 preset 的 Agent 始终获得这些作用域媒体工具；修改 Host 设置卡不会移除它们。

项目设置现在有两层版本职责：DSH 为工具包安装 CLI 依赖，每个视频工程记录自己使用的版本。渲染仍然是用户明确授权的动作，生成文件仍保存在工程文件夹中。

该 fallback 以少量固定版本的 blank 骨架文件写入换取避开 Windows 子进程失败；`video_lint` 仍是该骨架的验收检查。
