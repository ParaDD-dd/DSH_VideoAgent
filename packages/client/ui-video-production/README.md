---
description: "Video-production Web workspace for project history, frame previews, a three-track timeline, and the resident DSH Agent."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video-production

English | [中文](README.zh.md)

## Summary

`ui-video-production` adds a video project browser to the `video` profile. Each project has a Workspace and its `video-production` Session history; the panel reads the selected project's `script.json` and generated frame files and embeds DSH Conversation for the selected Session.

## Table of Contents

- [Use this package](#use-this-package)
- [Project and timeline data](#project-and-timeline-data)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Run `dsh --profile video` to load this plugin with the standard Web application and the Host media tools in `dsh-video-app`. Entering video mode clears the standard Session selection; leaving restores the Session that was selected in DSH.

Creating a project opens the installed directory chooser to select a parent, creates a named directory there, registers it as a Workspace, and starts a Session with `agentPreset: 'video-production'`. A project's New conversation action starts another preset Session in the same Workspace. Project and conversation history comes from Workspace membership and the recorded preset projection; the plugin does not maintain a second project database.

The Agent column renders the `conversation.embed` slot declared by `ui-conversation`. It uses the standard message renderer, Markdown, composer, activity disclosures, and Session state rather than a separate chat implementation. Selecting a Workspace from this embedded Conversation opens its latest video Session, or starts a `video-production` Session if it has none, without leaving the video panel.

<a id="project-and-timeline-data"></a>
## Project and timeline data

The selected Session's Workspace root contains `script.json`, whose `version` is `1` and whose `shots` records include narration, visual and transition descriptions, assets, duration, audio path, optional thumbnail path, and optional Qwen voice override. An optional top-level `voice` sets the project default; when absent, the first shot's voice supplies the default, falling back to Cherry. The parser accepts only positive integer canvas dimensions and unique positive integer shot orders. Audio and thumbnail paths must be project-relative slash paths without traversal segments or Windows drive syntax.

The visual track loads each non-null thumbnail through the Workspace Files Remote and `file` resource protocol. The preview starts HyperFrames `play` on demand for the selected `video-production` Session and embeds its player in the canvas; selecting a timeline clip seeks to that shot's accumulated start time, so composition animation and timed audio play together. Each visual clip has a Preview shot button that seeks to its start, plays it, and pauses at its end; when HyperFrames is not ready, the button starts the player and positions the shot for manual playback. Buttons stay disabled until the shot and all preceding durations are known. The selected shot's independent audio control remains available while the video player is active; playing it pauses the video, and starting a shot preview pauses the independent audio. The preview header toggle opens a scrollable overview with one card per shot, showing its thumbnail, subtitle, visual description, and duration; opening the overview pauses the video without unmounting the player. The player starts unmuted and waits for the user to press Play. The Workspace may contain `index.html` at its root or one direct-child HyperFrames project with `index.html` and `hyperframes.json`. Preview processes stop when the Session panel unmounts or the Host plugin unloads. Selecting a clip changes only local preview selection, not the Session log.

When HyperFrames preview is ready, the preview frame has a full-screen toggle. It uses the browser Fullscreen API on the frame that contains the player; the control stays available in full-screen mode, and browser-driven exit updates the button state. A rejected full-screen request displays an error without stopping playback.

`video-app` owns profile composition and Host tool configuration. No invariant companion is published because this package's Host entry provides no independent service and its UI has no runtime relationship that could diverge from what the browser renders.

The global voice selector uses the 17 Qwen3-TTS-Flash speakers listed in the Qwen model documentation. Changing the selector only chooses a candidate; Preview voice auditions it without changing project audio. Apply & regenerate all shots submits a request to update the project voice, clear shot overrides, and regenerate every shot. The selected-shot selector can inherit the global voice or override it; either action asks the Agent to regenerate only that shot. The Agent stores voice choices in `script.json`, downloads replacement audio without overwriting existing files, measures duration, and updates the affected audio path and duration. Regeneration requires the Qwen API key configured for the video preset.

The Preview voice button beside the global selector synthesizes and plays a fixed Chinese sample for the currently selected voice. It does not submit a Conversation message or change project audio. Qwen returns a temporary URL, and playback depends on the configured `DASHSCOPE_API_KEY` and browser access to that URL.

<a id="model-experience"></a>
## Model Experience

### Video workspace UI

#### What the model sees

Voice-change actions submit ordinary user messages through the selected Session's Conversation service, carrying the selected `voice` and regeneration scope so the Agent can apply it through `text_to_speech` and update `script.json`. Voice audition uses a separate fixed-sample Host route and adds no Session event, prompt content, or tool schema.

#### Token effect

Voice-change instructions consume normal Session input tokens. Voice audition and other UI state add none.

#### KV Cache effect

The UI adds no model-visible prefix; model-visible content and tool schemas remain owned by the Session's Agent preset.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Live preview requires a valid HyperFrames project `index.html` and a local HyperFrames CLI/browser setup; it does not render or export an MP4.
- The audio row displays its file name and a deterministic waveform placeholder; playback is available in the selected shot's preview panel, not directly on the track.
- Existing directories are not scanned for `script.json`; a project must have a Workspace and a Session using `video-production`.

<a id="dev-note"></a>
### Dev Note

See the [video workspace Agent Note](../../../.agents/notes/implemented/feature/2026-09-24-video-production-web-workspace.md) for project ownership, the embedded Conversation slot, and the versioned script format.
