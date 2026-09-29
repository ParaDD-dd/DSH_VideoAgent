/** Live provider smoke; self-skips until the user configures EVOLINK_API_KEY. */

import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as plugin from '../src/index.ts'

let ctx: Context | undefined
afterEach(async () => { await ctx?.fiber.dispose() })

it.skipIf(!process.env.EVOLINK_API_KEY)('generates a downloadable image through EvoLink', async () => {
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(plugin, { enabled: true, timeoutMs: 90000 })
  const result = await ctx.tools.execute({
    name: 'image_generate', callId: ToolCallId('evolink-live'), arguments: { prompt: 'A small blue circle on a white background.', size: '1:1' },
    signal: new AbortController().signal,
  })
  expect(result.isError).toBeFalsy()
  const value = result.value as { urls: string[] }
  const image = await fetch(value.urls[0]!, { signal: AbortSignal.timeout(15000) })
  expect(image.ok).toBe(true)
  expect(image.headers.get('content-type')).toMatch(/^image\//)
  expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
})
