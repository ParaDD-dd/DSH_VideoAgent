# Agent Note: HyperFrames project tools

Status: implemented

English | [中文](2026-09-22-hyperframes-tools.zh.md)

## Problem

Agents needed a standard way to inspect, preview, and render HyperFrames projects without embedding HyperFrames runtime logic in the harness.

## Decision

Add the opt-in `@deepseek-ai/dsh-tool-hyperframes` function plugin. It registers `video_lint`, `video_snapshot`, and `video_render` through `ctx.tools`, invokes the HyperFrames CLI through `ctx.subprocess`, and exposes a `hyperframes` settings namespace whose `enabled` field registers or removes all three tools live.

The snapshot operation passes the requested timestamps to HyperFrames, writes into a unique project-local directory, and uses the existing Sharp dependency family to assemble numbered PNGs into a three-column grid with at most nine frames.

The `dsh-video-app` bundle mounts the plugin with `enabled: false`; other shipped profiles omit its Host row. The Web client owns the locale-backed settings card when the Host serves its namespace, while the read-only plugin inventory receives the normal Loader entry.

The subprocess wrapper forwards an explicit browser executable to HyperFrames. Lint and snapshot keep the configured path in both browser-path environment variables. On Windows render calls, `HYPERFRAMES_BROWSER_PATH` instead names the current Node executable for HyperFrames' version-only preflight, while `PRODUCER_HEADLESS_SHELL_PATH` names the configured Chrome used by the producer. This avoids the preflight's access to Chrome's default profile without bypassing `ctx.subprocess`. The `dsh-video-app` bundle selects the installed Chrome path supplied for this deployment and accepts `HYPERFRAMES_BROWSER_PATH` as an override.

## Alternatives considered

- Embedding HyperFrames internals would couple the harness to a second rendering implementation and bypass the CLI's project-version resolution.
- Registering one generic video tool would make the three lifecycle and output contracts ambiguous to the model.
- Writing snapshots to a shared fixed directory would cause concurrent Agent calls to overwrite one another.

## Consequences

The host must have Node.js, FFmpeg, a supported browser, and the HyperFrames CLI available in the subprocess execution world. Windows deployments with Chrome elsewhere must override `browserPath` or `HYPERFRAMES_BROWSER_PATH`. Tool results contain filesystem paths rather than media bytes; generated directories remain available for follow-up inspection and cleanup.
