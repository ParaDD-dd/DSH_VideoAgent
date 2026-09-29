# Agent Note: Opt-in Qwen3-TTS speech synthesis

Status: implemented

English | [中文](2026-09-22-qwen-tts-tool.zh.md)

## Problem

Agents need a text-to-speech tool that can choose a Qwen voice while keeping the DashScope key out of tool arguments and persisted settings. Users also need to enable or disable the capability without changing the profile composition.

## Decision

The optional voice-preview route waits for `webServer` through Cordis injection. This keeps the Qwen plugin usable without a WebServer and registers the route when the service starts later.

[`tool-qwen-tts`](../../../../packages/web/tool-qwen-tts/README.md) owns the `text_to_speech` AgentTools registration and its `qwen-tts` settings section. The `dsh-video-app` bundle mounts the plugin disabled; other shipped profiles omit its Host row. The Plugins configuration card appears only when the Host serves the namespace and persists the live enablement switch; the tool accepts a voice name or custom voice ID for each call and uses `Cherry` when the call omits one.

The tool uses Qwen3-TTS non-streaming HTTP synthesis at `/services/aigc/multimodal-generation/generation`. It reads `DASHSCOPE_API_KEY` from the launch environment, validates the returned HTTP(S) URL and optional expiration timestamp, and returns the URL through the normal canonical tool result. The provider URL is temporary and the tool does not download or retain audio bytes.

Caller cancellation, disablement, reconfiguration, and unload abort local requests. Unload waits for started calls to settle. Provider response bodies stay out of tool errors, and credentialed requests reject redirects.

## Alternatives considered

**A startup-only optional service lookup.** Concurrent plugin initialization can run the Qwen plugin before the WebServer exists, so a one-time lookup can permanently omit the preview route. Cordis injection tracks the optional service lifecycle.

**Realtime WebSocket synthesis.** Non-streaming HTTP matches the requested API and returns one URL that the Agent can use directly. A realtime transport would add a second lifecycle and would not improve the current tool's output contract.

**A stored API key in the settings card.** The key remains in the launch environment, consistent with deployment secrets and the existing external-provider tool pattern. The card only controls enablement.

**A shared speech-provider registry.** Qwen3-TTS has one current consumer. A provider registry would add an interface without another provider or consumer to own it.

## Consequences

The capability is available to native and programmatic AgentTools callers after the switch is enabled, with model-visible `text`, `voice`, and `language` arguments and a canonical `{ url, voice, model, expiresAt? }` result. Profiles without `dsh-video-app` omit the Host tool row; the video preset's scoped tool remains separate from global enablement.

The integration does not stream PCM, persist audio locally, refresh expired URLs, or cancel provider-side work after a request has been accepted. The package tests cover AgentTools validation, API request projection, URL validation, live settings changes, cancellation, unload quiescence, and real Loader composition; the provider smoke is keyed by `DASHSCOPE_API_KEY`.
