# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/ParaDD-dd/DSH_VideoAgent.git
cd DSH_VideoAgent
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Configure API keys for video production

Open **Settings → Models** in the Web UI, enter your DeepSeek API key in the DeepSeek card, and save it. The key is stored in the local `$DSH_HOME/.credentials.yaml` file; see the [model configuration guide](docs/user/guide/providers.md) for other providers.

For image generation and speech synthesis, create a `.env` file in the directory from which you launch `dsh`:

```dotenv
EVOLINK_API_KEY=your_evolink_api_key
DASHSCOPE_API_KEY=your_dashscope_api_key
```

Start the video workspace with `pnpm dsh --profile video` from a source checkout. Restart it after editing `.env`, then enable **Image generation (EvoLink)** and **Speech synthesis (Qwen3-TTS)** under **Settings → Plugins → Plugin configuration**. These provider keys are read from the launch environment. `.env` and local credential files are ignored by Git; keep your real keys out of committed configuration and README examples. See the [video profile](packages/bundle/video-app/README.md) and the [EvoLink](packages/web/tool-image-evolink/README.md) and [Qwen3-TTS](packages/web/tool-qwen-tts/README.md) package guides for details.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

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
