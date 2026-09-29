---
description: "Video-production UI and media tools: projects, generated thumbnails, speech, HyperFrames lint and snapshot review, and explicitly approved rendering."
kind: "package-bundle"
---

# @deepseek-ai/dsh-video-app

English | [中文](README.zh.md)

## Summary

Add the dedicated video-production workspace and its image, speech, and HyperFrames tools to a Web profile. The layer builds on `dsh-base` and `dsh-web-app`; run `dsh --profile video` to enable it. The video UI starts with the standard DSH Web view and can switch to project history, preview, timeline, and the existing Agent conversation.

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

Use the shipped [`video` profile](../../../apps/cli/README.md#profiles) to run the Web GUI with the video workspace and host media tools. Each project uses one dedicated Workspace and can contain multiple `video-production` Sessions. Creating a project opens the installed directory chooser for its parent. Project and conversation history come from the Workspace list and the Sessions' recorded Agent preset.

The video tool rows are host-owned and disabled by default. The `video-production` preset enables its scoped image, speech, and HyperFrames tools while leaving their global settings providers available to Web Settings. The agent workflow writes `script.json`, generates media and snapshots after script approval, and calls `video_render` only after the user explicitly authorizes export.

### Composition

```sh
dsh --profile video
```

The profile applies the `dsh-base`, `dsh-web-app`, and `dsh-video-app` patch layers in that order. Other profiles do not load this package's tools or browser UI.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is patch-only. Its layer moves the opt-in image-generation, Qwen speech, and HyperFrames host rows out of the shared base and adds the browser video-production plugin. `ui-video-production` registers a main-panel entry and a top-level switch; its Agent column declares `conversation.embed`, which `ui-conversation` fills with the same resident conversation shell used by the standard page.

The browser reads `script.json` and relative thumbnail files through the existing workspace-file Remote and `file` resource protocol. The timeline derives its three tracks from validated shot records and never writes preview state into Session history. Creating a project creates its directory, registers a Workspace, and creates a Session with the `video-production` preset. New conversation creates another preset Session in that Workspace.

No invariant companion is published because this patch-only bundle owns no runtime state separate from its configured plugin rows.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Adds the media tool rows and browser plugin after the Web profile |
| [`src/index.ts`](src/index.ts) | Empty Host entry for the patch-only bundle |
| [`../../client/ui-video-production/README.md`](../../client/ui-video-production/README.md) | Browser project workspace, timeline, Conversation embedding, and file-read behavior |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [dsh-base](../base/README.md) — shared Host services and model defaults.
- [dsh-web-app](../web-app/README.md) — browser server and Web Client composition.
- [Video-production preset](../../preset/agent-presets/presets/video-production/agent.cordis.yml) — staged script, media, review, and render instructions.
- [HyperFrames tools](../../video/tool-hyperframes/README.md) — `video_lint`, `video_snapshot`, and `video_render`.
- [Video app note](../../../.agents/notes/implemented/feature/2026-09-24-video-production-web-workspace.md) — project ownership and embedded Conversation rationale.

<a id="model-experience"></a>
## Model Experience

### Video preset tools

#### What the model sees

The `video-production` preset gives each video Session the image generation, text-to-speech, and HyperFrames tool schemas. Host tool rows remain disabled outside that preset; the browser workspace itself sends no model requests.

#### Token effect

The preset tool schemas contribute to each video Session's tool context; the UI bundle adds no prompt text.

#### KV Cache effect

The preset's tool schemas are fixed for each Session's composition. The UI bundle contributes no model prompt text or tool schema of its own.

## Known Limitations and Deferred Work

- Project history includes only Workspaces with at least one Session whose recorded preset is `video-production`.
- Existing directories are not searched for `script.json`; imported projects must first be opened as a video Session in a Workspace.

<a id="dev-note"></a>
### Dev Note

None.
