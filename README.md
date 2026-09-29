# DSH VideoAgent

English | [中文](README.zh.md)

DSH VideoAgent extends [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with a project-based video creation mode. The `video` profile brings a dedicated workspace, a video-production agent, media tools, previews, and a timeline into the DSH Web UI.

## Video creation mode

- Create a video project with its own workspace and conversation history.
- Draft and review `script.json` with the agent before generating media.
- Generate images with EvoLink and speech with Qwen3-TTS, then review previews and the timeline.
- Check HyperFrames compositions and export a video only after explicit approval.

The [video profile](packages/bundle/video-app/README.md) describes the workspace and tool composition. Other DSH profiles remain available for general agent tasks.

<a id="run"></a>

## Run

<a id="run-from-source"></a>

### Run from source

Install Node.js and pnpm, then run this repository's video profile:

```sh
git clone https://github.com/ParaDD-dd/DSH_VideoAgent.git
cd DSH_VideoAgent
pnpm install
pnpm run build
pnpm dsh --profile video
```

The Web UI opens at `http://127.0.0.1:3080` for a local launch. `pnpm run build` prepares the repository artifacts; the `dsh` command uses them without rebuilding. Review the [safety notice](SAFETY.md) before running the project.

### Configure API keys

Open **Settings → Models** in the Web UI, enter your DeepSeek API key in the DeepSeek card, and save it. The key is stored in the local `$DSH_HOME/.credentials.yaml` file; see the [model configuration guide](docs/user/guide/providers.md) for other providers.

To use image generation and speech synthesis, create a `.env` file in the directory from which you launch `dsh`:

```dotenv
EVOLINK_API_KEY=your_evolink_api_key
DASHSCOPE_API_KEY=your_dashscope_api_key
```

Restart the application after editing `.env`. The video-production agent receives its own image, speech, and HyperFrames tools; the switches under **Settings → Plugins → Plugin configuration** control the host tool entries. Git ignores `.env` and local credential files. Keep real keys out of committed configuration and README examples. See the [EvoLink](packages/web/tool-image-evolink/README.md) and [Qwen3-TTS](packages/web/tool-qwen-tts/README.md) guides for provider details.

### Standard DSH Web UI

Run `pnpm dsh web` to start the standard DSH Web UI without the video workspace. See the [Web UI guide](docs/user/guide/index.md).

## About DeepSeek Harness

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com). It uses an everything-is-a-plugin architecture powered by [Cordis](https://github.com/cordiverse/cordis). The upstream project is in developer preview and may introduce compatibility-breaking changes. See the [upstream documentation](https://deepseek-harness.github.io/deepseek-harness/).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md). For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
