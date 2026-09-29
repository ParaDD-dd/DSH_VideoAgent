# Agent Note: Opt-in EvoLink image generation

Status: implemented

English | [中文](2026-09-18-evolink-image-tool.zh.md)

## Problem

Agents need an image-generation tool whose asynchronous provider task remains controllable from the existing plugin settings. Provider credentials must stay out of tool arguments and persisted settings, and a cancelled wait must not create another billed task.

## Decision

[`tool-image-evolink`](../../../../packages/web/tool-image-evolink/README.md) owns one EvoLink-specific tool rather than a provider registry without another consumer. The `dsh-video-app` bundle mounts it disabled; other shipped profiles omit its Host row. Its `image-evolink` settings section controls reversible registration of `image_generate`; the Plugins configuration tab dispatches its card only when the Host serves that section. The read-only inventory continues to describe Loader activation, which is distinct from tool enablement.

Each foreground call creates one task and polls every 5000 ms by default. The deployment can configure the polling interval and total deadline. Cancellation, disablement, reconfiguration, and unload abort local I/O; unload waits for settlement. The tool never retries task creation, because a lost response does not establish that the provider refused the billable request. Provider responses cannot supply error prose, and credentialed requests refuse redirects.

## Alternatives considered

**Separate service/provider/consumer packages.** Only EvoLink generation has a current consumer. A reusable registry would add interfaces without a second implementation or user.

**Two model-facing tools for create and query.** This would make the model own the polling schedule and repeatedly add polling messages to context. One foreground tool enforces the requested interval and returns the final URLs through the standard tool result.

**Mutating Loader activation from the inventory.** The inventory is read-only, and unloading the plugin would also remove its settings section. A persistent settings contributor keeps the switch available while the model-facing tool is disabled.

## Consequences

The tool works in native and programmatic tool modes with canonical `{ taskId, urls }` output and the existing logged tool events. It does not download images, cancel upstream tasks, or resume interrupted polling. Callers must retain temporary provider images themselves. The environment key requires a restart after editing `.env`; changing enablement applies live. Unit and Loader tests verify registration, polling, and failure handling; the live provider smoke requires `EVOLINK_API_KEY`.
