# Agent Note: Video production preset composes scoped HyperFrames tools

Status: implemented

English | [中文](2026-09-23-video-production-agent-preset.zh.md)

## Problem

Video work needs a stable Agent workflow that keeps script data available to the UI, ties shot timing to generated narration, and prevents an expensive MP4 render from starting before the user approves it. The existing media plugins also own global settings namespaces, so mounting their ordinary rows inside a preset would collide with the host settings provider.

## Decision

The shipped `video-production` preset adds a dedicated video-production Agent with a persona that defines three confirmed stages: script, video construction, and render/export. The persona requires one project directory per video, a UI-readable `script.json`, per-shot narration, audio-first timing, HyperFrames HTML animation by default, optional generated images, lint and snapshot review, and explicit approval before `video_render`.

The preset mounts the existing image, Qwen TTS, and HyperFrames plugins in its scoped tool layer. Each plugin accepts `registerSettings: false`; this composition-only setting skips its global settings section while preserving the tool registration in the preset scope. The `dsh-video-app` bundle adds the Host rows for global enablement; the Web Plugins settings surface dispatches those cards only while the Host serves their namespaces. The [video workspace note](../feature/2026-09-24-video-production-web-workspace.md) records how the browser creates and lists project Workspaces and Sessions.

Project initialization does not depend on a successful CLI `init`. On the Windows DSH execution world, `npx hyperframes init` can terminate with `0xC0000409`; the preset tells the Agent to stop retrying, use a fresh project directory, create the official blank-equivalent `hyperframes.json`, `package.json`, `meta.json`, and `index.html` with file tools, and validate the result with `video_lint`. The Agent reports those files as DSH-created fallback files rather than as `init` output. A successful `init` is still usable only after its files pass the same validation.

The HyperFrames tool package declares `hyperframes@^0.8.61` as a production dependency. Each project records the same pinned CLI in its scripts as `npx --yes hyperframes@0.8.61`; the DSH fallback therefore preserves reproducible project metadata without depending on a global installation.

## Alternatives considered

**Enable the host settings sections from the preset.** This loses scope ownership and fails because `SettingsProvider` accepts one registration per namespace. The preset therefore uses a settings-free composition path.

**Put the media tools in the global tool layer.** Global registration would expose video-generation capabilities to every preset and would make the video workflow prompt incomplete for agents that did not choose it. Scoped registration keeps the capability and prompt together.

**Duplicate the media tool implementations in a new video-only package.** Duplication would split provider behavior and lifecycle fixes across two implementations. The existing plugins remain the single implementation and only gain the explicit composition option needed by presets.

## Consequences

The Agent preset picker lists `video-production`, and the Web composition test proves that its prompt and five media tools are visible only after the preset is mounted. Host plugin settings remain available for ordinary host-owned tool instances. A video-production Agent always receives the scoped media tools when its preset is selected; changing a host settings card does not remove those scoped tools.

Project setup now has two version responsibilities: DSH installs the CLI dependency for the tool package, while each video project records the version it uses. Rendering remains an explicit user-authorized action, and generated files remain in the project directory.

The fallback avoids a Windows subprocess failure at the cost of duplicating a small, version-pinned blank scaffold in the Agent's file writes; `video_lint` remains the acceptance check for that scaffold.
