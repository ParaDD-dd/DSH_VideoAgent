---
description: "Generate downloadable speech from text with Qwen3-TTS, select a voice per call, and enable the tool from Settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-qwen-tts

English | [中文](README.zh.md)

## Summary

The video profile can generate a fixed-sentence preview for a selected voice without adding a Conversation message.

Agents can convert text to speech with Qwen3-TTS and receive a temporary audio URL. Each call can select a Qwen voice and language, while the API key stays in the launch environment. The tool is disabled by default and can be enabled live from Settings → Plugins → Plugin configuration. Qwen returns a URL that expires after 24 hours, so callers must download or forward the audio before it expires.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Run `dsh --profile video` to load the host plugin row, then set `DASHSCOPE_API_KEY` in the launch directory's `.env` and restart the application. Save the **Enable speech synthesis** switch in Settings → Plugins → Plugin configuration → Speech synthesis (Qwen3-TTS). The `dsh-video-app` bundle supplies the plugin; its Loader entry also appears in the read-only Plugin list tab. Saving the switch adds or removes `text_to_speech` immediately.

### When to choose it

Choose this package when an Agent needs a short spoken rendering and a provider-hosted temporary audio URL is acceptable. Use a different provider or an application-owned audio pipeline when the caller needs local retention, streaming chunks, or a URL that does not expire.

### Minimal configuration

Custom compositions mount the plugin beside `dsh-tools`:

```yaml
- name: '@deepseek-ai/dsh-tool-qwen-tts'
  config:
    enabled: true
    apiKeyEnv: DASHSCOPE_API_KEY
    model: qwen3-tts-flash
    defaultVoice: Cherry
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Registers `text_to_speech` when true. |
| `registerSettings` | `true` | Registers the host settings section; scoped presets set `false` when they provide their own tool instance. |
| `registerVoicePreview` | `false` | Live setting that registers the same-origin fixed-sample route; the video profile enables it. |
| `apiKeyEnv` | `DASHSCOPE_API_KEY` | Launch environment variable containing the API key. |
| `baseURL` | `https://dashscope.aliyuncs.com/api/v1` | DashScope API base URL. |
| `model` | `qwen3-tts-flash` | Qwen speech model sent to the API. |
| `defaultVoice` | `Cherry` | Voice used when a call omits `voice`. |
| `timeoutMs` | `120000` | Maximum time for one synthesis request. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-qwen-tts) lists every accepted field. The model-facing `text_to_speech` call accepts text up to 600 characters, an optional Qwen voice name or custom voice ID, and an optional language. Successful output contains `url`, `voice`, `model`, and, when supplied by Qwen, `expiresAt`.

An agent preset can set `registerSettings: false` to register the tool in its own scoped tool layer without claiming the host `qwen-tts` settings namespace. The shipped `video-production` preset uses this form so its narration tool can coexist with the host settings card.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
The optional preview route follows the Host WebServer lifecycle through Cordis injection, so it registers if the server starts after this plugin and is removed when the server or plugin unloads.
<summary>Implementation internals — click to expand</summary>

The plugin registers one foreground tool through `ctx.tools`. It sends a non-streaming `POST /api/v1/services/aigc/multimodal-generation/generation` request with the Qwen model and `input.text`, `input.voice`, and optional `input.language_type` fields. It validates the returned HTTP(S) audio URL and expiration timestamp before exposing the canonical result through the normal `tool/call` and `tool/result` events.

When `registerVoicePreview` is true and the Host WebServer is present, the plugin registers `POST /api/qwen-tts/voice-preview`. The route accepts only a same-origin request and one of the 17 video UI voices, synthesizes a fixed Chinese sample, and returns Qwen's temporary audio URL without writing a Session event. The browser plays the URL directly; the provider URL expires after 24 hours.

The API key is resolved from the launch environment only when a call starts. Provider response bodies are not copied into tool errors, and credentialed requests refuse redirects. Caller cancellation, a settings disable, reconfiguration, or plugin unload aborts local I/O; unload waits for all started calls to settle.

The [tool authoring reference](../../../docs/cookbook/adding-a-tool.md) owns the AgentTools execution and canonical-result rules. No invariant companion is published because the package has no separate service and its only consumer is the tool it registers.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Qwen-TTS API reference](https://docs.qwencloud.com/api-reference/speech-synthesis/qwen-tts) — request fields and response URL semantics.
- [Qwen voice list](https://docs.qwencloud.com/developer-guides/speech/voice-list/qwen-tts) — available system voices and languages.
- [Tool authoring](../../../docs/cookbook/adding-a-tool.md) — AgentTools schemas, cancellation, and results.
- [Settings](../../settings/settings/README.md) — persistence and live configuration.

-----

<a id="model-experience"></a>
## Model Experience

### Enabled speech synthesis

#### What the model sees

The [tool catalog](../../../docs/tool-catalog.md#text_to_speech) describes the text, voice, and language arguments. A successful result returns a temporary audio URL and its selected voice; a failed request returns a tool error without the provider response body.

#### Token effect

Enabling the plugin adds one tool schema. Each completed call appends a small JSON result containing the audio URL and metadata; the audio bytes do not enter model context.

#### KV Cache effect

Results append to session history. Enabling or disabling the tool changes the schema set and can invalidate reuse of the request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define how the current Qwen integration behaves.

- **Temporary audio URLs** — Qwen documents a 24-hour URL lifetime. This plugin does not download, cache, or attach the returned audio.
- **Non-streaming requests** — the tool waits for the complete URL and does not expose streamed PCM chunks.
- **Provider voice catalog** — `voice` is passed through as a Qwen system-voice name or custom voice ID; the plugin does not maintain a second list that could become stale.
- **Key changes** — editing `.env` requires an application restart; changing the settings switch applies immediately.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
