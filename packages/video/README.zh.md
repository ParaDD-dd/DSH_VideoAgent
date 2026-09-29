---
description: "视频包组：面向模型提供 HyperFrames 检查、时间点网格截图与 MP4 渲染工具。"
kind: "package-group"
---

# video/：视频工具能力系列

[English](README.md) | 中文

## 概述

`video/` 包为 Agent 提供本地视频制作能力。第一个包包装 HyperFrames CLI，并将检查、时间点截图和 MP4 渲染放在标准 `ctx.tools` 注册表与子进程服务之后。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

这些包负责面向模型的视频操作，产物保留在执行世界的文件系统中。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`tool-hyperframes/`](tool-hyperframes/README.zh.md) | 通过受限子进程调用 HyperFrames 检查、时间点截图和 MP4 渲染 | 注册到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相关文档

- [工具子系统](../../docs/subsystems/tools.zh.md) — 面向模型的工具注册表与执行流程。
- [HyperFrames CLI](https://hyperframes.app/docs/5-packages/cli) — 被包装的检查、截图和渲染命令。
- [工具编写](../../docs/cookbook/adding-a-tool.zh.md) — Agent Tools schema、规范结果和取消。
- [子进程能力](../subprocess/README.zh.md) — 执行世界的进程所有权与输出收集。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
