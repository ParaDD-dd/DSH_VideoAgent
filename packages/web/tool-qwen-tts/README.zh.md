---
description: "使用 Qwen3-TTS 将文字生成可下载语音，支持每次调用选择音色，并可在系统设置中启用工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-qwen-tts

[English](README.md) | 中文

## 概述

视频 profile 可以为所选音色生成固定短句试听，不会增加 Conversation 消息。

Agent 可以使用 Qwen3-TTS 将文字转换为语音，并获得临时音频链接。每次调用都可以选择 Qwen 音色和语言，API Key 保留在启动环境中。工具默认关闭，可以在系统设置 → 插件 → 插件配置 → 语音合成（Qwen3-TTS）中实时启用。Qwen 返回的链接 24 小时后失效，因此调用方应在失效前下载或转发音频。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

运行 `dsh --profile video` 加载 Host 插件行，然后在启动目录的 `.env` 中设置 `DASHSCOPE_API_KEY` 并重启应用。在系统设置 → 插件 → 插件配置 → 语音合成（Qwen3-TTS）中保存“启用语音合成”开关。`dsh-video-app` bundle 会提供此插件；Loader 条目也会出现在只读的插件列表标签中。保存开关会立即添加或移除 `text_to_speech`。

### 适用场景

当 Agent 需要短文本语音并且可以接受提供方托管的临时音频链接时，选择此包。当调用方需要本地留存、流式分片或长期有效链接时，应使用其他提供方或由应用拥有音频处理流程。

### 最小配置

自定义组合可以在 `dsh-tools` 旁边挂载此插件：

```yaml
- name: '@deepseek-ai/dsh-tool-qwen-tts'
  config:
    enabled: true
    apiKeyEnv: DASHSCOPE_API_KEY
    model: qwen3-tts-flash
    defaultVoice: Cherry
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 为 true 时注册 `text_to_speech`。 |
| `registerSettings` | `true` | 注册 Host 设置区；preset 自己提供工具实例时设为 `false`。 |
| `registerVoicePreview` | `false` | 实时设置，用于注册同源固定文本试听路由；video profile 会启用。 |
| `apiKeyEnv` | `DASHSCOPE_API_KEY` | 存放 API Key 的启动环境变量。 |
| `baseURL` | `https://dashscope.aliyuncs.com/api/v1` | DashScope API 基础地址。 |
| `model` | `qwen3-tts-flash` | 发送给 API 的 Qwen 语音模型。 |
| `defaultVoice` | `Cherry` | 调用省略 `voice` 时使用的音色。 |
| `timeoutMs` | `120000` | 单次语音生成请求的最长时间。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-qwen-tts)列出所有可接受字段。面向模型的 `text_to_speech` 调用接受最多 600 个字符的文本、可选 Qwen 音色名称或自定义音色 ID，以及可选语言。成功结果包含 `url`、`voice`、`model`，以及 Qwen 返回时才有的 `expiresAt`。

Agent preset 可以设置 `registerSettings: false`，让工具只注册到自己的作用域而不占用 Host 的 `qwen-tts` 设置命名空间。随附的 `video-production` preset 使用这种方式，使旁白工具可以和 Host 设置卡片共存。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
可选的试听路由通过 Cordis 注入跟随 Host WebServer 的生命周期；即使服务在本插件后启动，路由也会注册，服务或插件卸载时会移除。
<summary>实现细节 — 点击展开</summary>

插件通过 `ctx.tools` 注册一个前台工具。它向 Qwen 发送非流式 `POST /api/v1/services/aigc/multimodal-generation/generation` 请求，并提供模型以及 `input.text`、`input.voice` 和可选的 `input.language_type` 字段。插件会校验返回的 HTTP(S) 音频链接和过期时间戳，再通过标准 `tool/call` 和 `tool/result` 事件提供规范结果。

当 `registerVoicePreview` 为 `true` 且 Host WebServer 可用时，插件会注册 `POST /api/qwen-tts/voice-preview`。该路由只接受同源请求和 17 种视频 UI 音色之一，使用固定中文短句合成语音，并返回 Qwen 临时音频链接，不写入 Session event。浏览器会直接播放链接；链接在 24 小时后过期。

当 `registerVoicePreview` 为 `true` 且 Host WebServer 可用时，插件会注册 `POST /api/qwen-tts/voice-preview`。该路由只接受同源请求和 17 种视频 UI 音色之一，使用固定中文短句合成语音，并返回 Qwen 临时音频链接，不写入 Session event。浏览器会直接播放链接；链接在 24 小时后过期。

工具开始调用时才从启动环境解析 API Key。提供方响应正文不会复制到工具错误中，携带凭据的请求会拒绝重定向。调用方取消、设置中关闭、重新配置或卸载插件都会中止本地 I/O；卸载会等待已开始的调用结束。

[工具编写参考](../../../docs/cookbook/adding-a-tool.zh.md)负责 AgentTools 的执行、规范结果和取消规则。此包没有单独的服务，当前唯一的消费者就是它注册的工具，因此不发布 invariant companion。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [Qwen-TTS API 参考](https://docs.qwencloud.com/api-reference/speech-synthesis/qwen-tts) — 请求字段和响应链接语义。
- [Qwen 音色列表](https://docs.qwencloud.com/developer-guides/speech/voice-list/qwen-tts) — 可用系统音色和语言。
- [工具编写](../../../docs/cookbook/adding-a-tool.zh.md) — AgentTools schema、取消和结果。
- [设置](../../settings/settings/README.zh.md) — 持久化和实时配置。

-----

<a id="model-experience"></a>
## 模型体验

### 启用语音合成

#### 模型看到的内容

[工具目录](../../../docs/tool-catalog.zh.md#text_to_speech)描述文本、音色和语言参数。成功结果返回临时音频链接及所选音色；失败请求返回工具错误，不包含提供方响应正文。

#### Token 影响

启用插件会增加一个工具 schema。每次完成调用都会追加一个包含音频链接和元数据的小型 JSON 结果；音频字节不会进入模型上下文。

#### KV Cache 影响

结果会追加到会话历史。启用或关闭工具会改变 schema 集合，可能使请求前缀无法复用。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

以下限制定义当前 Qwen 集成的行为。

- **临时音频链接** — Qwen 说明链接有效期为 24 小时。此插件不会下载、缓存或附加返回的音频。
- **非流式请求** — 工具等待完整链接，不提供流式 PCM 分片。
- **提供方音色目录** — `voice` 会作为 Qwen 系统音色名称或自定义音色 ID 直接传递；插件不维护可能过期的第二份列表。
- **Key 变更** — 修改 `.env` 后需要重启应用；修改设置开关会立即生效。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
