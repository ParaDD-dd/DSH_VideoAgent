/** A real Loader composition preserves the named plugin shape and tool result. */

import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import * as plugin from '../src/index.ts'

let ctx: Context | undefined
afterEach(async () => {
  await ctx?.fiber.dispose()
  vi.restoreAllMocks()
})

it('loads text_to_speech from cordis.yml and returns the completed audio URL', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
    output: { audio: { url: 'https://audio.example/loader.wav', expires_at: 1760000000 } },
  }))
  ctx = new Context()
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([
    { source: 'process', values: { DASHSCOPE_API_KEY: 'loader-fixture-key' } },
  ]))
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-qwen-tts', plugin],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`Unexpected fixture module: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  expect('default' in plugin).toBe(false)
  expect(ctx.loader.unwrapExports(plugin)).toBe(plugin)
  await ctx.loader.create({
    name: 'cordis:include', config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href },
  })
  await ctx.loader.await()
  expect(ctx.tools.schemas().map(tool => tool.name)).toContain('text_to_speech')
  const result = await ctx.tools.execute({
    name: 'text_to_speech', callId: ToolCallId('loader-tts'), arguments: { text: 'Hello.' },
    signal: new AbortController().signal,
  })
  expect(result.isError).toBeFalsy()
  expect(result.content).toEqual([{
    type: 'text', text: '{"url":"https://audio.example/loader.wav","voice":"Cherry","model":"qwen3-tts-flash","expiresAt":1760000000}',
  }])
  expect(fetch).toHaveBeenCalledTimes(1)
})
