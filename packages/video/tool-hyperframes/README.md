---
description: "Opt-in Agent Tools that wrap the HyperFrames CLI for project lint, timestamp contact sheets, and MP4 rendering."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-hyperframes

English | [中文](README.zh.md)

## Summary

This package adds three opt-in Agent Tools for a local HyperFrames project: `video_lint`, `video_snapshot`, and `video_render`. In Web compositions it also serves the HyperFrames player asset and owns the on-demand preview process requested by the video workspace. Tool calls accept a project directory, invoke the HyperFrames CLI through `ctx.subprocess`, and return a bounded JSON result with paths in the same execution world.

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

The `dsh-video-app` bundle mounts this plugin with tools disabled; other shipped profiles omit its Host row. Run `dsh --profile video` and enable **HyperFrames tools** in Settings → Plugins → Plugin configuration, or mount the plugin explicitly beside `dsh-tools` and a subprocess provider:

```yaml
- id: tool-hyperframes
  name: '@deepseek-ai/dsh-tool-hyperframes'
  config:
    enabled: true
    cliCommand: npx
    browserPath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    timeoutMs: 600000
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Registers the three model-facing tools when true. |
| `registerSettings` | `true` | Registers the host settings section; scoped presets set `false` when they provide their own tool instance. |
| `cliCommand` | `npx` | Executable resolved in the mounted subprocess execution world. |
| `browserPath` | unset | Actual browser executable used by HyperFrames. On Windows `video_render` uses the Node runtime only for HyperFrames' version-only preflight and keeps this path for the producer; `video_snapshot` uses this path directly. |
| `timeoutMs` | `600000` | Maximum duration of one tool call and child process. |
| `maxOutputBytes` | `524288` | Retained stdout and stderr bytes per child process. |
| `graceMs` | `3000` | Termination grace passed to the subprocess provider. |
| `previewStartupTimeoutMs` | `20000` | Maximum time for the embedded local player server to become ready. |

The project directory should contain a HyperFrames project with its `index.html` and package metadata. The preview route also accepts one direct-child project marked by `hyperframes.json` when the Workspace root has no `index.html`; multiple nested projects are rejected as ambiguous. Install the HyperFrames CLI prerequisites, including Node.js, FFmpeg, and a supported browser, in the same execution world. On Windows, the video-app bundle selects `C:/Program Files/Google/Chrome/Application/chrome.exe`; set `HYPERFRAMES_BROWSER_PATH` or the `browserPath` field when Chrome is installed elsewhere. During `video_render`, the plugin separates HyperFrames' version-only browser preflight from the producer browser path because DSH denies the preflight's access to Chrome's default profile. The actual producer still launches the configured Chrome through `ctx.subprocess`; the plugin does not bypass process management. The CLI can use a project-pinned HyperFrames version when the project declares one.

The package includes the `hyperframes` CLI dependency as a DSH fallback. A project should still declare and pin its own HyperFrames version; the shipped `video-production` preset uses `hyperframes@0.8.61` as its current project baseline and registers the three tools without a second host settings section.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers three foreground tools only while `enabled` is true. When `webServer` is present, it also registers the preview asset and player routes. The preview route accepts only a Session marked with the `video-production` preset, gets its Workspace directory from the live Session or persisted header, selects the root composition or the unique direct-child project marked by `hyperframes.json`, and starts one loopback HyperFrames `play --no-open` process at an OS-selected port. A new Session replaces the previous preview; DELETE stops the matching process. The preview player script is served from the pinned `hyperframes` dependency. Process termination is awaited on Session cleanup and plugin unload. Tool calls resolve the project path from the calling session cwd, resolve the configured CLI executable through `ctx.subprocess`, and pass every project and output path as a separate argv element without a shell.

`video_lint` runs `hyperframes lint <project> --json` and returns the exit facts plus bounded stdout and stderr, so lint diagnostics remain a successful tool value even when the lint command reports errors. `video_snapshot` runs the HyperFrames snapshot command with the requested `--at` list and `--no-end`, then uses Sharp to assemble the numbered PNGs into a three-column `grid.png`. `video_render` runs the render command with a unique MP4 destination and verifies that the resulting file is non-empty.

Each operation creates a unique `snapshots/dsh-<uuid>/` or `renders/dsh-<uuid>/` directory under the project. Settings reconfiguration removes the old registrations, aborts their activation signal, and unload waits for started calls to settle.

No invariant companion is published because the tool registry owns registration state and each operation verifies its own output.

The plugin forwards an explicit `browserPath` to HyperFrames' browser manager and producer. For Windows render calls, `HYPERFRAMES_BROWSER_PATH` is set to the current Node executable for the CLI's `--version` preflight, while `PRODUCER_HEADLESS_SHELL_PATH` retains the configured Chrome path. Snapshot calls pass the configured path to both variables. This avoids Chrome's default-profile access failure without bypassing the subprocess provider. The [tool authoring reference](../../../docs/cookbook/adding-a-tool.md) owns Agent Tools validation and canonical-result rules. The [HyperFrames CLI reference](https://hyperframes.app/docs/5-packages/cli) owns the wrapped command semantics.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [HyperFrames CLI](https://hyperframes.app/docs/5-packages/cli) — lint, snapshot, and render options.
- [HyperFrames core](https://hyperframes.app/docs/4-core) — project composition and deterministic rendering rules.
- [Tool authoring](../../../docs/cookbook/adding-a-tool.md) — schemas, cancellation, and result presentation.
- [Subprocess capability](../../subprocess/README.md) — execution-world process ownership.
- [Settings](../../settings/settings/README.md) — durable settings and live reconfiguration.

-----

<a id="model-experience"></a>
## Model Experience

### Enabled HyperFrames tools

#### What the model sees

The tool catalog exposes one project path for lint and render, plus a project path and one-to-nine non-negative timestamps for snapshots. Lint returns `ok`, exit facts, and bounded diagnostics. Snapshot returns the contact-sheet path, individual frame paths, and its three-column dimensions. Render returns the verified MP4 path.

#### Token effect

Enabling the plugin adds three tool schemas. Completed results contain paths and bounded lint diagnostics; PNG and MP4 bytes stay in the filesystem and do not enter model context.

#### KV Cache effect

Tool results are appended to session history. Enabling or disabling the plugin changes the available schema set and can invalidate reuse of the request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Local execution world** — the CLI, browser, FFmpeg, project files, and subprocess provider must be available in one execution world; the plugin does not copy a project to another host.
- **Contact-sheet dimensions** — frames use the first rendered frame's dimensions and the output always has three columns; unused cells remain black.
- **CLI diagnostics** — lint output is bounded by `maxOutputBytes`; the plugin does not persist a complete diagnostic spill file.
- **Output retention** — generated directories are unique and are not automatically deleted, so callers can inspect or remove completed artifacts.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
