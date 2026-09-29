---
description: "配置 EvoLink Z-Image Turbo 图片生成、环境变量密钥、即时启停及任务轮询。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-evolink

[English](README.md) | 中文

## 概述

Agent 可以通过 EvoLink Z-Image Turbo 将文字生成图片，并获取图片链接。图片生成默认关闭，可在设置 → 插件 → 插件配置中启用。每次调用创建一个任务并等待结果，默认每五秒查询一次。API Key 保留在启动环境中。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

运行 `dsh --profile video` 加载 Host 插件行，然后在启动目录的 `.env` 中设置 `EVOLINK_API_KEY` 并重启应用。在设置 → 插件 → 插件配置 → 图片生成（EvoLink）中保存“启用图片生成”开关。`dsh-video-app` bundle 提供该插件；Loader 条目会显示在只读的插件列表标签页中。保存开关会立即添加或移除 `image_generate`，并通过已有设置提供方保存选择。

```dotenv
EVOLINK_API_KEY=your_evolink_api_key
```

自定义组合可在 `dsh-tools` 旁挂载该插件：

```yaml
- name: '@deepseek-ai/dsh-tool-image-evolink'
  config:
    enabled: true
    apiKeyEnv: EVOLINK_API_KEY
    pollIntervalMs: 5000
```

[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-image-evolink)列出全部字段。`timeoutMs` 限制创建和轮询的总时长，默认值为 300000 毫秒。调用时从启动环境读取密钥，密钥不会成为设置字段或工具参数。缺少密钥时，调用在访问网络之前失败。

Agent preset 可以设置 `registerSettings: false`，让工具只注册到自己的作用域而不占用 Host 的 `image-evolink` 设置命名空间。随附的 `video-production` preset 使用这种方式，使图片工具可以和 Host 设置卡片共存。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件通过具有作用域的工具运行时注册，并使用已有的 `tool/call` 和 `tool/result` 事件。其规范结果为 `{ taskId, urls }`，程序化工具调用方可直接使用。原生输出将相同 JSON 放在文本块中；客户端使用通用工具卡片。没有额外的提示词段落或会话事件类型。

执行器先提交模型为 `z-image-turbo` 的 `POST /v1/images/generations` 请求，再间隔发送 `GET /v1/tasks/{task_id}` 请求，直到完成、失败、取消或超时。请求拒绝重定向，并验证任务 ID、状态和结果 URL。创建请求不会自动重试，因为响应丢失时上游任务仍可能已计费。配置变更和卸载会中止本地操作；卸载会等待操作结束。

**运行时不变量：** 不发布伴随检查。工具注册由已有注册表负责，该插件没有需要核对的独立维护状态。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [EvoLink API](https://evolink.ai/z-image-turbo)——提供方参数及任务流程。
- [工具编写](../../../docs/cookbook/adding-a-tool.zh.md)——模式、执行和结果呈现。
- [设置](../../settings/settings/README.zh.md)——持久化与即时配置。

-----

<a id="model-experience"></a>
## 模型体验

### 启用图片生成

#### 模型可见内容

[图片工具模式](../../../docs/tool-catalog.zh.md#image_generate)描述提示词、尺寸、随机种子和内容审核选项。成功结果包含任务 ID 和图片 URL；失败返回工具错误。关闭时工具不出现在列表中。

#### Token 影响

启用后增加一个工具模式。每次完成的调用会追加包含任务 ID 和 URL 的 JSON 结果；图片字节不会进入模型上下文。

#### KV Cache 影响

结果追加到会话历史。启用或关闭会改变工具模式集合，可能使请求前缀无法复用。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **临时远程图片**——EvoLink 文档规定 URL 有效期为 24 小时。该插件不下载或保存图片，不编辑参考图片，也不提供专用图片预览卡片。
- **上游取消**——本地停止不能取消已提交的任务或撤销计费。创建后的错误保留任务 ID；不提供自动恢复。
- **真实验证**——没有 `EVOLINK_API_KEY` 时提供方冒烟测试自动跳过；无密钥测试通过受控响应验证轮询。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
