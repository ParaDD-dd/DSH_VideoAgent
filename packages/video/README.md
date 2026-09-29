---
description: "The video package group: model-facing HyperFrames tools for linting, timestamp contact sheets, and MP4 rendering."
kind: "package-group"
---

# video/ — video tooling capability family

English | [中文](README.zh.md)

## Summary

The `video/` packages expose local video-production capabilities to Agents. The first package wraps the HyperFrames CLI and keeps lint, timestamp snapshots, and MP4 rendering behind the standard `ctx.tools` registry and subprocess service.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

These packages own model-facing video operations whose output stays in the execution-world filesystem.

| Package | Role | ctx key |
|---|---|---|
| [`tool-hyperframes/`](tool-hyperframes/README.md) | Runs HyperFrames lint, timestamp snapshots, and MP4 rendering through bounded subprocess calls | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Tools subsystem](../../docs/subsystems/tools.md) — the model-facing tool registry and execution pipeline.
- [HyperFrames CLI](https://hyperframes.app/docs/5-packages/cli) — the wrapped lint, snapshot, and render commands.
- [Tool authoring](../../docs/cookbook/adding-a-tool.md) — Agent Tools schemas, canonical results, and cancellation.
- [Subprocess capability](../subprocess/README.md) — execution-world process ownership and output collection.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
