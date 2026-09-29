# DSH VideoAgent

[English](README.md) | 中文

DSH VideoAgent 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加以项目为中心的视频创作模式。`video` profile 在 DSH Web UI 中提供专用工作区、视频制作 Agent、媒体工具、预览与时间轴。

## 视频创作模式

- 创建拥有独立工作区和对话历史的视频项目。
- 与 Agent 编写并审阅 `script.json`，确认脚本后再生成素材。
- 使用 EvoLink 生成图像、Qwen3-TTS 合成语音，并查看预览和时间轴。
- 检查 HyperFrames 作品，仅在明确批准后导出视频。

[视频 profile](packages/bundle/video-app/README.zh.md) 介绍工作区和工具组合。其他 DSH profile 仍可用于通用 Agent 任务。

<a id="run"></a>

## 运行

<a id="run-from-source"></a>

### 从源码运行

安装 Node.js 和 pnpm，然后启动本仓库的视频 profile：

```sh
git clone https://github.com/ParaDD-dd/DSH_VideoAgent.git
cd DSH_VideoAgent
pnpm install
pnpm run build
pnpm dsh --profile video
```

本机启动时，Web UI 会在 `http://127.0.0.1:3080` 打开。`pnpm run build` 准备仓库产物，`dsh` 命令直接使用这些产物而不会重新构建。运行项目前请阅读[安全说明](SAFETY.zh.md)。

### 配置 API Key

在 Web UI 中打开**设置 → 模型**，在 DeepSeek 卡片中填写 API Key 并保存。密钥保存在本地的 `$DSH_HOME/.credentials.yaml` 文件中；其他模型提供方的配置方法见[模型配置指南](docs/user/guide/providers.zh.md)。

如需图像生成和语音合成，在启动 `dsh` 的目录中创建 `.env` 文件：

```dotenv
EVOLINK_API_KEY=your_evolink_api_key
DASHSCOPE_API_KEY=your_dashscope_api_key
```

修改 `.env` 后重启应用。视频制作 Agent 会获得自己的图像、语音和 HyperFrames 工具；**设置 → 插件 → 插件配置**中的开关控制宿主工具项。Git 会忽略 `.env` 和本地凭据文件。不要把真实密钥写入提交的配置或 README 示例。提供方详情见 [EvoLink](packages/web/tool-image-evolink/README.zh.md) 与 [Qwen3-TTS](packages/web/tool-qwen-tts/README.zh.md) 说明。

### 标准 DSH Web UI

运行 `pnpm dsh web` 可启动不带视频工作区的标准 DSH Web UI。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

## 关于 DeepSeek Harness

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 Agent 框架。它由 [Cordis](https://github.com/cordiverse/cordis) 驱动，采用一切皆插件的架构。上游项目仍处于开发者预览阶段，可能出现破坏兼容性的变更。详见[上游文档](https://deepseek-harness.github.io/deepseek-harness/)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。面向 Agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
