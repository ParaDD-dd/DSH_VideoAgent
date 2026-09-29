# Agent Note: Video projects use Workspace and Session ownership

Status: implemented

English | [中文](2026-09-24-video-production-web-workspace.zh.md)

## Problem

The video preset needs a dedicated browser workspace without forking DSH's conversation behavior or adding a second project-history store. Project scripts and generated frame previews also need a stable location the Agent and UI can share.

## Decision

The shipped `video` profile composes `dsh-base`, `dsh-web-app`, and `dsh-video-app`. The video bundle owns the video workspace panel and the Host image, speech, and HyperFrames rows; other profiles do not load those rows or the panel.

Each project is one Workspace directory containing one or more Sessions created with the `video-production` Agent preset. The Client Session create API accepts `agentPreset` and publishes the returned value into the local Session projection before the call resolves. The project list and per-project conversation history derive from Workspace membership and that recorded preset instead of maintaining another catalog. A new project takes an explicitly selected parent directory; a new conversation reuses the project's Workspace.

The standard and video workspaces are alternate `main` entries. Entering video mode clears the standard Session selection, and leaving restores it. The video panel declares `conversation.embed`, which mirrors the registered `main.conversation` entry. Only the source entry declares Conversation's child slots, as each Slot key has one declarer. The embedded shell accepts a panel-owned Workspace selection action: video selection opens the Workspace's latest video Session or creates one with the preset, without invoking standard navigation; absent that action, DSH keeps its existing behavior. The project directory chooser uses the same mirror mechanism to place the installed directory flow in the video panel. Messages, Markdown, the composer, and intermediate activity disclosures use the selected video Session binding while only one editor mounts at a time.

The Agent writes a version-1 `script.json` in the project Workspace. The visual track loads each relative `thumbnailPath`. The preview starts the HyperFrames player for the selected `video-production` Session and seeks to each selected shot's accumulated start time, keeping composition animation and timed audio together. Each visual clip has a preview button that plays only that shot and pauses at its end; when the player is not ready, the button starts it and seeks to the shot for manual playback. The button is enabled only when the shot and all preceding durations are known. The selected shot's independent audio control remains visible while the video player is active; playing it pauses the video, and starting a shot preview pauses the independent audio. The preview-header toggle opens a scrollable card for every shot with its thumbnail, subtitle, visual description, and duration; opening it pauses video without unmounting the player. The player uses a root `index.html` when present or the unique direct-child HyperFrames project marked by `hyperframes.json`; multiple nested projects fail with an explicit ambiguity error. Before live playback starts, the selected thumbnail and its relative `audioPath` remain available through the browser's image and audio controls. The preview frame enters browser full-screen mode through the Fullscreen API, keeps its exit control inside the frame, and synchronizes with browser exits. Clip selection stays Client-local and does not add Session events.

The script may store a project-level `voice` and shot-level voice overrides. The global selector defaults from the first shot's voice, falling back to Cherry. Changing the selector chooses an unapplied candidate; the preview button auditions that candidate without changing project audio. A separate apply action submits a normal logged Conversation input that directs the Agent to regenerate every shot and clear overrides. A shot selector can inherit the global voice or request a one-shot override; either action regenerates that shot only. The Agent downloads replacement audio to new paths, measures its duration, and updates `script.json`; prior audio files remain untouched. Normal audio generation uses the shot override, project voice, first shot voice, then Cherry. The supported selector values match Qwen3-TTS-Flash's 17 speakers.

The global selector's preview action requests a fixed Chinese sample through a same-origin Host route. The Host keeps the DashScope key, limits the request to the 17 UI voices, and returns Qwen's temporary audio URL. The Client plays that URL without adding a Conversation message, Session event, or project audio file; the route is enabled by `dsh-video-app` and remains independent of the Agent tool's enabled setting.

## Alternatives considered

**Keep video tools and UI in the shared Web composition.** That would make video-specific Host rows part of the ordinary Web profile. The separate `video` profile preserves the standard profile's composition.

**Build a video-specific message renderer.** That would duplicate Markdown, composer, and activity presentation. The embedded Conversation shell reuses the existing presentation and Session binding.

**Add a second video-project index.** Workspace membership and the recorded Agent preset already identify projects, so another catalog would create duplicate ownership and synchronization work.

## Consequences

The standard DSH Web interface remains the initial view in the `video` profile, and the top-level switch enters or leaves the video panel. Existing directories are not discovered automatically; each video project must be registered as a Workspace with a `video-production` Session. Live preview requires a valid project `index.html` and local HyperFrames CLI prerequisites; it does not render or export an MP4. The audio track remains metadata-only.

The versioned script is shared file data, not a new Session event family. The Client validates project-relative thumbnail paths before reading them through Workspace Files; malformed paths do not become file requests.

## Verification

The HyperFrames project resolver tests root projects, a unique nested project, no project, and ambiguous nested projects. Client tests confirm that the embedded player loads HyperFrames `play`'s `/composition/index.html` route, that a visual clip's preview button seeks, plays, and pauses at the shot end, that the preview frame enters and exits browser full-screen mode and reports rejected requests without unmounting playback, that choosing and previewing a global voice does not submit a Conversation request until the explicit apply action, that applying requests project-wide regeneration while shot override and inheritance remain scoped to one shot, and that the full storyboard overview preserves both shot content and the mounted player. Script parser tests cover project voice metadata and shot overrides.
