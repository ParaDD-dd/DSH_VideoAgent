/** Live provider smoke; self-skips until the user configures DASHSCOPE_API_KEY. */

import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as plugin from '../src/index.ts'

let ctx: Context | undefined
afterEach(async () => { await ctx?.fiber.dispose() })

it.skipIf(!process.env.DASHSCOPE_API_KEY)('generates speech through Qwen-TTS', async () => {
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(plugin, { enabled: true, timeoutMs: 90000 })
  const result = await ctx.tools.execute({
    name: 'text_to_speech',
    callId: ToolCallId('qwen-tts-live'),
    arguments: { text: '今天天气很好。', voice: 'Cherry', language: 'Chinese' },
    signal: new AbortController().signal,
  })
  expect(result.isError).toBeFalsy()
  expect((result.value as { url: string }).url).toMatch(/^https:\/\//)
})
