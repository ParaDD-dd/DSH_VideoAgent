# Agent Note: HyperFrames 项目工具

Status: implemented

[English](2026-09-22-hyperframes-tools.md) | 中文

## 问题

Agent 需要一种标准方式检查、预览和渲染 HyperFrames 项目，同时不能把 HyperFrames 运行时逻辑复制进 harness。

## 决策

新增可选的 `@deepseek-ai/dsh-tool-hyperframes` function plugin。它通过 `ctx.tools` 注册 `video_lint`、`video_snapshot` 和 `video_render`，通过 `ctx.subprocess` 调用 HyperFrames CLI，并公开 `hyperframes` 设置命名空间；`enabled` 字段会实时注册或移除三个工具。

截图操作把请求的时间点传给 HyperFrames，写入项目下的唯一目录，并使用已有 Sharp 依赖系列把编号 PNG 组合成最多九张、每行三张的网格。

`dsh-video-app` bundle 以 `enabled: false` 挂载插件；其他随附 profile 不含其 Host 配置行。Host 提供该命名空间时，Web 客户端才显示带 locale 的设置卡片；只读插件列表仍通过正常 Loader 条目获得该插件。

子进程包装器把显式浏览器可执行文件传给 HyperFrames。Lint 与截图调用在两个浏览器路径环境变量中保留配置路径。Windows 渲染调用则让 `HYPERFRAMES_BROWSER_PATH` 指向当前 Node 可执行文件，仅用于 HyperFrames 的版本预检，同时让 `PRODUCER_HEADLESS_SHELL_PATH` 指向 producer 实际使用的配置 Chrome。这样可以避免预检访问 Chrome 默认用户配置目录，同时不绕过 `ctx.subprocess`。`dsh-video-app` bundle 选择本部署提供的 Chrome 路径，并接受 `HYPERFRAMES_BROWSER_PATH` 覆盖。

## 备选方案

- 内嵌 HyperFrames 内部实现会让 harness 依赖第二套渲染逻辑，并绕过 CLI 对项目版本的解析。
- 注册一个通用视频工具会让三个生命周期和输出约定对模型不明确。
- 写入共享固定目录会使并发 Agent 调用互相覆盖文件。

## 后果

宿主必须在子进程执行世界中提供 Node.js、FFmpeg、受支持的浏览器和 HyperFrames CLI。Chrome 安装在其他位置的 Windows 部署必须覆盖 `browserPath` 或 `HYPERFRAMES_BROWSER_PATH`。工具结果返回文件系统路径而不是媒体字节；生成目录会保留，方便后续检查和清理。
