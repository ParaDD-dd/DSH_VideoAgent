# Agent Note: 按需启用 Qwen3-TTS 语音合成

Status: implemented

[English](2026-09-22-qwen-tts-tool.md) | 中文

## Problem

Agent 需要一个可以选择 Qwen 音色的文字转语音工具，同时 DashScope Key 不能进入工具参数或持久化设置。用户还需要在不修改 profile 组合的情况下启用或关闭此能力。

## Decision

音色试听路由通过 Cordis 注入等待 `webServer`。这样 Qwen 插件可在没有 WebServer 时使用；服务稍后启动时也会注册试听路由。

[`tool-qwen-tts`](../../../../packages/web/tool-qwen-tts/README.zh.md) 负责 `text_to_speech` AgentTools 注册和 `qwen-tts` 设置区。`dsh-video-app` bundle 挂载但默认禁用该插件；其他随附 profile 不包含其 Host 配置行。Host 提供该命名空间时，Plugins 配置卡片才会出现并保存实时启用开关；工具每次调用接受音色名称或自定义音色 ID，调用省略音色时使用 `Cherry`。

工具通过 `/services/aigc/multimodal-generation/generation` 使用 Qwen3-TTS 非流式 HTTP 语音合成。它从启动环境读取 `DASHSCOPE_API_KEY`，校验返回的 HTTP(S) 链接和可选过期时间戳，并通过标准规范工具结果返回链接。提供方链接是临时链接，工具不会下载或保留音频字节。

调用方取消、关闭、重新配置或卸载都会中止本地请求。卸载会等待已开始的调用结束。提供方响应正文不会进入工具错误，携带凭据的请求会拒绝重定向。

## Alternatives considered

**启动时一次性读取可选服务。** 插件并发初始化时，Qwen 插件可能先于 WebServer 启动；一次性读取会导致试听路由一直缺失。Cordis 注入会跟踪该可选服务的生命周期。

**实时 WebSocket 合成。** 非流式 HTTP 与用户指定的 API 一致，并返回 Agent 可以直接使用的单个链接。实时传输会增加另一套生命周期，但不会改善当前工具的输出协议。

**在设置卡片中保存 API Key。** Key 保留在启动环境中，与部署密钥和现有外部提供方工具的模式一致。卡片只负责启用开关。

**共享语音提供方注册表。** 当前只有 Qwen3-TTS 一个消费者。提供方注册表会在没有第二个提供方或消费者时增加接口。

## Consequences

原生和程序化 AgentTools 调用方在开关启用后都可以使用此能力；模型可见参数为 `text`、`voice` 和 `language`，规范结果为 `{ url, voice, model, expiresAt? }`。不包含 `dsh-video-app` 的 profile 不会挂载 Host 工具行；视频 preset 的作用域工具独立于全局启用状态。

此集成不提供 PCM 流式传输、不在本地持久化音频、不刷新过期链接，也不会在请求被提供方接受后取消提供方侧工作。包测试覆盖 AgentTools 校验、API 请求投影、链接校验、实时设置变更、取消、卸载静默和真实 Loader 组合；提供方冒烟测试由 `DASHSCOPE_API_KEY` 控制。
