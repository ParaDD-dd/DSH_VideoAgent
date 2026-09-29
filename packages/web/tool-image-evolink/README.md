---
description: "Configure EvoLink Z-Image Turbo image generation, environment credentials, live enablement, and task polling."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-evolink

English | [中文](README.zh.md)

## Summary

Agents can generate images from text with EvoLink Z-Image Turbo and receive the resulting image URLs. Image generation is off by default and can be enabled in Settings → Plugins → Plugin configuration. Each call creates one task and waits for its result, checking every five seconds by default. The API key stays in the launch environment.

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

Run `dsh --profile video` to load the host plugin row, then set `EVOLINK_API_KEY` in the launch directory's `.env` and restart the application. Save the **Enable image generation** switch in Settings → Plugins → Plugin configuration → Image generation (EvoLink). The `dsh-video-app` bundle supplies the plugin; its Loader entry appears in the read-only Plugin list tab. Saving the switch adds or removes `image_generate` immediately and persists the choice through the existing settings provider.

```dotenv
EVOLINK_API_KEY=your_evolink_api_key
```

Custom compositions mount the plugin beside `dsh-tools`:

```yaml
- name: '@deepseek-ai/dsh-tool-image-evolink'
  config:
    enabled: true
    apiKeyEnv: EVOLINK_API_KEY
    pollIntervalMs: 5000
```

The [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-image-evolink) lists all fields. `timeoutMs` bounds creation and polling together; the default is 300000 ms. Credentials are resolved from the launch environment at invocation and are never settings fields or tool arguments. Missing credentials reject a call before network access.

An agent preset can set `registerSettings: false` to register the tool in its own scoped tool layer without claiming the host `image-evolink` settings namespace. The shipped `video-production` preset uses this form so its image tool can coexist with the host settings card.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers through the scoped tool runtime and uses the existing `tool/call` and `tool/result` events. Its canonical result is `{ taskId, urls }`, available directly to programmatic tool callers. Native output is the same JSON in a text block; clients use their generic tool card. There is no additional prompt section or session event type.

The executor submits `POST /v1/images/generations` with model `z-image-turbo`, then waits between `GET /v1/tasks/{task_id}` requests until completion, failure, cancellation, or the deadline. Requests refuse redirects and validate task IDs, statuses, and result URLs. Creation is never retried automatically because a lost response can still represent a billed upstream task. Configuration changes and unload abort local operations; unload joins their settlement.

**Runtime invariant:** No companion is published. Tool registration is owned by the existing registry, and this plugin has no independently maintained observation to reconcile.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [EvoLink API](https://evolink.ai/z-image-turbo) — provider parameters and task workflow.
- [Tool authoring](../../../docs/cookbook/adding-a-tool.md) — schemas, execution, and result presentation.
- [Settings](../../settings/settings/README.md) — persistence and live configuration.

-----

<a id="model-experience"></a>
## Model Experience

### Enabled image generation

#### What the model sees

The [image tool schema](../../../docs/tool-catalog.md#image_generate) describes the prompt, size, seed, and moderation options. Successful results contain the task ID and image URLs; failures return tool errors. The tool is absent while disabled.

#### Token effect

Enablement adds one tool schema. Each completed call appends a JSON result containing the task ID and URLs; image bytes do not enter model context.

#### KV Cache effect

Results append to session history. Enabling or disabling changes the tool schema set and can invalidate reuse of the request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Temporary remote images** — EvoLink documents a 24-hour URL lifetime. This plugin does not download or retain images, edit reference images, or add a dedicated image preview card.
- **Upstream cancellation** — stopping locally cannot cancel a submitted task or reverse its charge. Errors after creation retain its task ID; automatic resume is not provided.
- **Live verification** — the provider smoke self-skips without `EVOLINK_API_KEY`; keyless tests verify polling against controlled responses.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
