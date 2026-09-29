---
description: "可选的 Agent Tools：包装 HyperFrames CLI，提供项目检查、时间点网格截图和 MP4 渲染。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-hyperframes

[English](README.md) | 中文

## 概述

此包为本地 HyperFrames 项目添加三个可选 Agent Tool：`video_lint`、`video_snapshot` 和 `video_render`。每次调用都接受项目目录，通过 `ctx.subprocess` 调用 HyperFrames CLI，并在同一执行世界返回带路径的有界 JSON 结果。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

`dsh-video-app` bundle 会挂载此插件但默认关闭工具；其他随附 profile 不包含其 Host 配置行。运行 `dsh --profile video` 并在“设置 → 插件 → 插件配置”中启用“HyperFrames 工具”，也可以在 `dsh-tools` 和子进程提供方旁显式挂载：

```yaml
- id: tool-hyperframes
  name: '@deepseek-ai/dsh-tool-hyperframes'
  config:
    enabled: true
    cliCommand: npx
    browserPath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    timeoutMs: 600000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 为 true 时注册三个面向模型的工具。 |
| `registerSettings` | `true` | 注册 Host 设置区；preset 自己提供工具实例时设为 `false`。 |
| `cliCommand` | `npx` | 在挂载的子进程执行世界中解析的可执行文件。 |
| `browserPath` | 未设置 | HyperFrames 实际使用的浏览器可执行文件路径。Windows 的 `video_render` 只在 HyperFrames 版本预检时使用 Node 运行时，producer 仍使用此路径；`video_snapshot` 直接使用此路径。 |
| `timeoutMs` | `600000` | 单次工具调用和子进程的最长时间。 |
| `maxOutputBytes` | `524288` | 每个子进程保留的 stdout 和 stderr 字节数。 |
| `graceMs` | `3000` | 传给子进程提供方的终止宽限时间。 |
| `previewStartupTimeoutMs` | `20000` | 等待嵌入式本地播放器服务器就绪的最长时间。 |

项目目录应包含带有 `index.html` 和包元数据的 HyperFrames 项目。若 Workspace 根目录没有 `index.html`，预览也会接受带有 `hyperframes.json` 的唯一直接子目录；存在多个嵌套项目时会报告歧义。请在同一执行世界安装 Node.js、FFmpeg、受支持的浏览器等 HyperFrames CLI 前置依赖。Windows video-app bundle 默认选择 `C:/Program Files/Google/Chrome/Application/chrome.exe`；如果 Chrome 安装在其他位置，请设置 `HYPERFRAMES_BROWSER_PATH` 或 `browserPath` 字段。执行 `video_render` 时，插件会把 HyperFrames 的版本预检与 producer 浏览器路径分开，因为 DSH 会拒绝预检访问 Chrome 默认用户配置目录；实际 producer 仍通过 `ctx.subprocess` 启动配置的 Chrome，插件不会绕过进程管理。项目声明的 HyperFrames 版本可以优先使用。

Web composition 提供 `webServer` 时，本插件还会注册播放器资源与预览路由。视频工作区只能为标记为 `video-production` 的 Session 请求预览；Host 从活动 Session 或持久化头部读取 Workspace，选择根目录 composition 或带有 `hyperframes.json` 的唯一直接子目录，再以随机可用端口启动一个 loopback HyperFrames `play --no-open` 进程。新 Session 会替换旧预览，DELETE 请求会停止匹配的进程；插件卸载时也会等待进程退出。

此包包含 `hyperframes` CLI 依赖，作为 DSH 的 fallback。项目仍应声明并固定自己的 HyperFrames 版本；随附的 `video-production` preset 当前以 `hyperframes@0.8.61` 作为项目基线，并在不重复声明 Host 设置区的情况下注册三个工具。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节 — 点击展开</summary>

只有 `enabled` 为 true 时，插件才注册三个前台工具。它根据调用 Agent 会话的 cwd 解析项目路径，通过 `ctx.subprocess` 解析配置的 CLI 可执行文件，并将项目路径和输出路径作为独立 argv 元素传递，不经过 shell。

`video_lint` 运行 `hyperframes lint <project> --json`，返回退出事实以及有界 stdout 和 stderr，因此即使检查命令报告错误，检查诊断仍然是成功的工具值。`video_snapshot` 使用请求的 `--at` 列表和 `--no-end` 运行 HyperFrames 截图命令，然后用 Sharp 将编号 PNG 组合为三列的 `grid.png`。`video_render` 调用渲染命令写入唯一 MP4 路径，并确认文件非空。

每次操作都会在项目下创建唯一的 `snapshots/dsh-<uuid>/` 或 `renders/dsh-<uuid>/` 目录。设置重新配置会移除旧注册、触发激活信号取消；插件卸载会等待已开始的调用结束。

工具注册表拥有注册状态，每次操作都自行验证输出，因此不发布 invariant companion。

插件会把显式 `browserPath` 传给 HyperFrames 的浏览器管理器和 producer。Windows 渲染时，`HYPERFRAMES_BROWSER_PATH` 使用当前 Node 可执行文件完成 CLI 的 `--version` 预检，`PRODUCER_HEADLESS_SHELL_PATH` 保留配置的 Chrome 路径；截图调用则把配置路径传给两个变量。这样可以避免 Chrome 默认用户配置目录访问失败，同时保留子进程提供方的管理。[工具编写参考](../../../docs/cookbook/adding-a-tool.zh.md)负责 Agent Tools 校验和规范结果规则；[HyperFrames CLI 参考](https://hyperframes.app/docs/5-packages/cli)负责被包装命令的语义。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [HyperFrames CLI](https://hyperframes.app/docs/5-packages/cli) — 检查、截图和渲染选项。
- [HyperFrames 核心](https://hyperframes.app/docs/4-core) — 项目组合与确定性渲染规则。
- [工具编写](../../../docs/cookbook/adding-a-tool.zh.md) — schema、取消和结果展示。
- [子进程能力](../../subprocess/README.zh.md) — 执行世界的进程所有权。
- [设置](../../settings/settings/README.zh.md) — 持久化设置与实时重新配置。

-----

<a id="model-experience"></a>
## 模型体验

### 启用 HyperFrames 工具

#### 模型看到的内容

工具目录为检查和渲染公开一个项目路径，为截图公开项目路径以及一到九个非负时间点。检查返回 `ok`、退出事实和有界诊断；截图返回网格路径、单帧路径及三列尺寸；渲染返回已确认的 MP4 路径。

#### Token 影响

启用插件会增加三个工具 schema。完成结果包含路径和有界检查诊断；PNG 与 MP4 字节保留在文件系统中，不会进入模型上下文。

#### KV Cache 影响

工具结果会追加到会话历史。启用或关闭插件会改变可用 schema 集合，可能使请求前缀无法复用。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **本地执行世界** — CLI、浏览器、FFmpeg、项目文件和子进程提供方必须位于同一执行世界；插件不会把项目复制到其他主机。
- **网格尺寸** — 使用第一张渲染帧的尺寸，输出始终为三列；未使用的单元格保持黑色。
- **CLI 诊断** — 检查输出受 `maxOutputBytes` 限制；插件不会持久化完整诊断 spill 文件。
- **产物保留** — 生成目录使用唯一名称且不会自动删除，调用方可以检查或清理完成的产物。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
