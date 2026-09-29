---
description: "Package map for the web access capability family: the search/fetch service, its provider backends, and the model-facing tools that consume them."
kind: "package-group"
---

# web/ — web access capability family

English | [中文](README.zh.md)

## Summary

The `web/` packages let models search the public web and fetch HTTP(S) pages through the `web_search` and `web_fetch` tools. Deployments can choose Exa, Perplexity, or DeepSeek for search and anonymous HTTP(S) access for fetch; availability and resource limits depend on the configured provider. Use this family for search and page retrieval, not interactive browsing, content extraction, or per-URL policy enforcement. Models receive consistent tool behavior, cancellation, and error reporting when providers change.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

These packages provide web retrieval and remote image generation; the subsystem reference owns the search and fetch contracts.

| Package | Role | ctx key |
|---|---|---|
| [`web/`](web/README.md) | Search/fetch service: search and fetch URLs through interchangeable backends, one selection and error policy | `ctx.web` |
| [`web-search-exa/`](web-search-exa/README.md) | Searches the web through Exa | registers on `ctx.web` |
| [`web-search-perplexity/`](web-search-perplexity/README.md) | Searches the web through Perplexity | registers on `ctx.web` |
| [`web-search-deepseek/`](web-search-deepseek/README.md) | Searches the web through DeepSeek native search | registers on `ctx.web` |
| [`web-fetch-http/`](web-fetch-http/README.md) | Fetches public HTTP(S) pages anonymously | registers on `ctx.web` |
| [`tool-web/`](tool-web/README.md) | Exposes `web_search` and `web_fetch` to the model | registers on `ctx.tools` |
| [`tool-image-evolink/`](tool-image-evolink/README.md) | Generates images through EvoLink with opt-in settings and task polling | registers on `ctx.tools` |
| [`tool-qwen-tts/`](tool-qwen-tts/README.md) | Generates speech through Qwen3-TTS with opt-in settings and voice selection | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the shared vocabulary, then the design decision behind the single provider-selection service.

- [Web subsystem](../../docs/subsystems/web.md) — the search/fetch requests and results, provider availability, `WebError`, and public-address enforcement.
- [Web capability seam decision](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) — why search and fetch share one provider-selection service.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
