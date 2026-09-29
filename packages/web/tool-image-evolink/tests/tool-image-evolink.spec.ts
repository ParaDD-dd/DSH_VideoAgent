/** Image task polling, live enablement, and foreground cleanup through the real tool runtime. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import * as plugin from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}
  get writable() { return true }
  protected load() { return Promise.resolve(this.doc) }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>) {
    this.doc = { ...this.doc, [ns]: section }
    return Promise.resolve()
  }
}

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.restoreAllMocks()
})

async function boot(config: Partial<plugin.Config> = {}, key = 'fixture-key') {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([
    { source: 'process', values: { EVOLINK_API_KEY: key } },
  ]))
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(MemorySettings)
  const fiber = await ctx.plugin(plugin, { enabled: true, pollIntervalMs: 1, ...config })
  let calls = 0
  const call = (args: unknown = { prompt: 'a cat' }, signal = new AbortController().signal) =>
    ctx.tools.execute({ name: 'image_generate', callId: ToolCallId(`image-${++calls}`), arguments: args, signal })
  return { ctx, fiber, call }
}

function response(status = 'completed', extra: object = {}) {
  return Response.json({ id: 'task-fixture', status, results: ['https://images.example/cat.png'], ...extra })
}

describe('EvoLink image generation', () => {
  it('rejects a credential-bearing endpoint while loading configuration', async () => {
    await expect(boot({ baseURL: 'https://user:secret@api.evolink.test' }))
      .rejects.toThrow('without credentials')
  })

  it('rejects an invalid environment variable name while loading configuration', async () => {
    const { ctx } = await boot({ enabled: false })
    expect(() => {
      plugin.apply(ctx, {
        enabled: false, apiKeyEnv: 'bad key', baseURL: 'https://api.evolink.test',
        pollIntervalMs: 5000, timeoutMs: 300000,
      })
    }).toThrow('must name an environment variable')
  })

  it('creates once, waits five seconds before polling, and returns canonical URLs', async () => {
    const started: number[] = []
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      started.push(performance.now())
      return Promise.resolve(response(started.length === 1 ? 'pending' : 'completed'))
    })
    const { call } = await boot({ pollIntervalMs: 5000 })
    const result = await call({ prompt: 'a cat', size: '16:9', seed: 12, nsfw_check: true })
    expect(result.isError).toBeFalsy()
    expect(result.value).toEqual({ taskId: 'task-fixture', urls: ['https://images.example/cat.png'] })
    expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(4990)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]).toEqual(['https://api.evolink.ai/v1/images/generations', expect.objectContaining({
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'z-image-turbo', prompt: 'a cat', size: '16:9', seed: 12, nsfw_check: true }),
    })])
    expect(fetch.mock.calls[1]).toEqual(['https://api.evolink.ai/v1/tasks/task-fixture', expect.objectContaining({ method: 'GET' })])
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])
  // The five-second production polling interval is itself the subject.
  }, 15000)

  it('keeps polling processing tasks without creating another task', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response('pending'))
      .mockResolvedValueOnce(response('processing'))
      .mockResolvedValueOnce(response())
    const { call } = await boot()
    expect((await call({ prompt: 'cat', size: '1024x768' })).isError).toBeFalsy()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('adds and removes the tool on committed settings and unregisters on unload', async () => {
    const { ctx, fiber, call } = await boot({ enabled: false })
    expect(ctx.tools.schemas()).toEqual([])
    expect((await call()).isError).toBe(true)
    await ctx.settings.update('image-evolink', { enabled: true })
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['image_generate'])
    await ctx.settings.update('image-evolink', { enabled: false })
    expect(ctx.tools.schemas()).toEqual([])
    await ctx.settings.update('image-evolink', { enabled: true })
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.settings.describe()).toEqual([])
  })

  it('registers a scoped tool without claiming the host settings namespace', async () => {
    const { ctx } = await boot({ registerSettings: false })
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['image_generate'])
    expect(ctx.settings.get('image-evolink')).toBeUndefined()
    expect(ctx.settings.describe()).toEqual([])
  })

  it.each([
    { prompt: '' }, { prompt: ' ' }, { prompt: 'a'.repeat(2001) },
    { prompt: 'a', size: '0x1000' }, { prompt: 'a', size: '1537x376' },
    { prompt: 'a', size: '4:5' }, { prompt: 'a', seed: 0 },
    { prompt: 'a', seed: 2147483648 }, { prompt: 'a', seed: 1.1 },
  ])('rejects invalid arguments without an API call: %j', async (args) => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const { call } = await boot()
    expect((await call(args)).isError).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports a missing environment key without sending a request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const { call } = await boot({}, '')
    expect(JSON.stringify((await call()).content)).toContain('EVOLINK_API_KEY')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['failed', {}], ['cancelled', {}], ['completed', { results: [] }],
    ['completed', { results: ['javascript:alert(1)'] }], ['unknown', {}],
  ])('reports task %s as an error without leaking response fields', async (status, extra) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(status, { ...extra, error: { message: 'fixture-key' } }))
    const { call } = await boot()
    const result = await call()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain('fixture-key')
  })

  it('refuses mismatched task IDs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response('pending'))
      .mockResolvedValueOnce(response('completed', { id: 'other-task' }))
    const { call } = await boot()
    expect((await call()).isError).toBe(true)
  })

  it.each([401, 429, 500])('does not retry creation after HTTP %i', async (status) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('fixture-key', { status }))
    const { call } = await boot()
    const result = await call()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain(`HTTP ${status}`)
    expect(JSON.stringify(result)).not.toContain('fixture-key')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['caller', 'disable', 'unload', 'timeout'])('settles in-flight requests on %s', async (mode) => {
    const entered = Promise.withResolvers<undefined>()
    let requestSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      requestSignal = init!.signal as AbortSignal
      entered.resolve(undefined)
      return new Promise((_resolve, reject) => {
        requestSignal!.addEventListener('abort', () => { reject(new Error('Fixture fetch aborted')) }, { once: true })
      })
    })
    const { call, ctx, fiber } = await boot({ timeoutMs: mode === 'timeout' ? 50 : 300000 })
    const controller = new AbortController()
    const result = call({ prompt: 'cat' }, controller.signal)
    await entered.promise
    if (mode === 'caller') controller.abort()
    if (mode === 'disable') await ctx.settings.update('image-evolink', { enabled: false })
    if (mode === 'unload') await fiber.dispose()
    expect((await result).isError).toBe(true)
    expect(requestSignal?.aborted).toBe(true)
  })

  it('aborts a polling wait without sending the next query', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('pending'))
    const { call, ctx } = await boot({ pollIntervalMs: 5000 })
    const running = call()
    await vi.waitFor(() => { expect(fetch).toHaveBeenCalledTimes(1) })
    await ctx.settings.update('image-evolink', { enabled: false })
    expect((await running).isError).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid configuration before saving it', async () => {
    const { ctx } = await boot()
    for (const invalid of [
      { enabled: false, apiKeyEnv: 'EVOLINK_API_KEY', baseURL: 'https://api.evolink.test', pollIntervalMs: 0, timeoutMs: 300000 },
      { enabled: false, apiKeyEnv: 'EVOLINK_API_KEY', baseURL: 'https://api.evolink.test', pollIntervalMs: 5000, timeoutMs: 0 },
    ]) {
      expect(() => { plugin.apply(ctx, invalid) }).toThrow('must be an integer')
    }
    for (const change of [{ baseURL: 'file:///tmp' }, { apiKeyEnv: 'bad key' }, { timeoutMs: 0 }, { pollIntervalMs: 1.5 }]) {
      await expect(ctx.settings.update('image-evolink', change)).rejects.toThrow()
    }
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['image_generate'])
  })
})
