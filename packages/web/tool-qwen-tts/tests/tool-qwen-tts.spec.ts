/** Qwen request validation, live enablement, and cancellation through AgentTools. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { PassThrough } from 'node:stream'
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
    { source: 'process', values: { DASHSCOPE_API_KEY: key } },
  ]))
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(MemorySettings)
  const fiber = await ctx.plugin(plugin, { enabled: true, ...config })
  let calls = 0
  const call = (args: unknown = { text: 'Hello from Qwen.' }, signal = new AbortController().signal) =>
    ctx.tools.execute({ name: 'text_to_speech', callId: ToolCallId(`tts-${++calls}`), arguments: args, signal })
  return { ctx, fiber, call }
}

function response(extra: object = {}) {
  return Response.json({
    status_code: 200,
    output: { finish_reason: 'stop', audio: { url: 'https://audio.example/result.wav', expires_at: 1760000000 } },
    ...extra,
  })
}

describe('Qwen text-to-speech', () => {
  it('rejects unsafe endpoints and invalid environment names while loading configuration', async () => {
    await expect(boot({ baseURL: 'https://user:secret@dashscope.example' }))
      .rejects.toThrow('without credentials')
    const { ctx } = await boot({ enabled: false })
    expect(() => {
      plugin.apply(ctx, {
        enabled: false, apiKeyEnv: 'bad key', baseURL: 'https://dashscope.example',
        model: 'qwen3-tts-flash', defaultVoice: 'Cherry', timeoutMs: 120000,
      })
    }).toThrow('must name an environment variable')
  })

  it('sends the Qwen non-streaming request and returns its expiring audio URL', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    const { call } = await boot()
    const result = await call({ text: '你好，世界。', voice: 'Ethan', language: 'Chinese' })
    expect(result.isError).toBeFalsy()
    expect(result.value).toEqual({
      url: 'https://audio.example/result.wav', voice: 'Ethan', model: 'qwen3-tts-flash', expiresAt: 1760000000,
    })
    expect(fetch).toHaveBeenCalledWith('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', expect.objectContaining({
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3-tts-flash',
        input: { text: '你好，世界。', voice: 'Ethan', language_type: 'Chinese' },
      }),
    }))
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])
  })

  it('uses the configured default voice and custom endpoint/model', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      output: { audio: { url: 'https://audio.example/default.wav' } },
    }))
    const { call } = await boot({
      baseURL: 'https://dashscope.example/api/v1/', model: 'qwen-tts', defaultVoice: 'Serena',
    })
    const result = await call({ text: 'Hello.' })
    expect(result.value).toEqual({ url: 'https://audio.example/default.wav', voice: 'Serena', model: 'qwen-tts' })
    expect(fetch.mock.calls[0]).toEqual(['https://dashscope.example/api/v1/services/aigc/multimodal-generation/generation', expect.anything()])
  })

  it('adds and removes the tool on committed settings and unregisters on unload', async () => {
    const { ctx, fiber, call } = await boot({ enabled: false })
    expect(ctx.tools.schemas()).toEqual([])
    expect((await call()).isError).toBe(true)
    await ctx.settings.update('qwen-tts', { enabled: true })
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['text_to_speech'])
    await ctx.settings.update('qwen-tts', { enabled: false })
    expect(ctx.tools.schemas()).toEqual([])
    await ctx.settings.update('qwen-tts', { enabled: true })
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.settings.describe()).toEqual([])
  })

  it('registers a scoped tool without claiming the host settings namespace', async () => {
    const { ctx } = await boot({ registerSettings: false })
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['text_to_speech'])
    expect(ctx.settings.get('qwen-tts')).toBeUndefined()
    expect(ctx.settings.describe()).toEqual([])
  })

  it('serves a same-origin fixed-sample voice preview without registering an Agent call', async () => {
    const routes = new Map<string, WebRoute>()
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([
      { source: 'process', values: { DASHSCOPE_API_KEY: 'fixture-key' } },
    ]))
    ctx.provide('webServer', { register: (route: WebRoute) => {
      routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    } } as unknown as WebServer)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(MemorySettings)
    const fiber = await ctx.plugin(plugin, { enabled: false, registerVoicePreview: true })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    const request = new PassThrough() as PassThrough & { method: string; headers: Record<string, string> }
    request.method = 'POST'
    request.headers = { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-length': '17' }
    const responseHeaders: Record<string, string | number> = {}
    let statusCode = 0
    let responseBody = ''
    const outgoing = {
      headersSent: false,
      writeHead(status: number, headers: Record<string, string | number> = {}) {
        statusCode = status
        Object.assign(responseHeaders, headers)
        this.headersSent = true
      },
      end(body = '') { responseBody = body },
    }
    const pending = routes.get('/api/qwen-tts/voice-preview')!.handler(request as never, outgoing as never)
    request.end(JSON.stringify({ voice: 'Ethan' }))
    await pending
    expect(statusCode).toBe(200)
    expect(responseHeaders['cache-control']).toBe('no-store')
    expect(JSON.parse(responseBody)).toEqual({ url: 'https://audio.example/result.wav' })
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3-tts-flash', input: { text: '你好，欢迎试听当前选择的音色。', voice: 'Ethan', language_type: 'Chinese' } }),
    }))
    expect(ctx.tools.schemas()).toEqual([])
    await ctx.settings.update('qwen-tts', { registerVoicePreview: false })
    expect(routes.size).toBe(0)
    await ctx.settings.update('qwen-tts', { registerVoicePreview: true })
    expect(routes.has('/api/qwen-tts/voice-preview')).toBe(true)
    await fiber.dispose()
    expect(routes.size).toBe(0)
  })

  it('registers the preview route when the optional WebServer starts after the plugin', async () => {
    const routes = new Map<string, WebRoute>()
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([]))
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(MemorySettings)
    const fiber = await ctx.plugin(plugin, { enabled: false, registerVoicePreview: true })
    expect(routes.size).toBe(0)

    let routeRegistered!: () => void
    const registered = new Promise<void>((resolve) => { routeRegistered = resolve })
    ctx.provide('webServer', { register: (route: WebRoute) => {
      routes.set(route.path, route)
      routeRegistered()
      return () => { routes.delete(route.path) }
    } } as unknown as WebServer)
    await registered
    expect(routes.has('/api/qwen-tts/voice-preview')).toBe(true)

    await fiber.dispose()
    expect(routes.size).toBe(0)
  })

  it('rejects cross-origin and unsupported voice preview requests before contacting Qwen', async () => {
    const routes = new Map<string, WebRoute>()
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([]))
    ctx.provide('webServer', { register: (route: WebRoute) => {
      routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    } } as unknown as WebServer)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(plugin, { enabled: false, registerVoicePreview: true })
    const fetch = vi.spyOn(globalThis, 'fetch')
    const handler = routes.get('/api/qwen-tts/voice-preview')!.handler
    const invoke = async (origin: string, voice: string): Promise<number> => {
      const request = new PassThrough() as PassThrough & { method: string; headers: Record<string, string> }
      request.method = 'POST'
      request.headers = { origin, host: 'localhost:3000', 'content-length': '16' }
      let statusCode = 0
      const outgoing = {
        headersSent: false,
        writeHead(status: number) { statusCode = status; this.headersSent = true },
        end() {},
      }
      const pending = handler(request as never, outgoing as never)
      request.end(JSON.stringify({ voice }))
      await pending
      return statusCode
    }
    expect(await invoke('https://attacker.example', 'Ethan')).toBe(403)
    expect(await invoke('http://localhost:3000', 'custom-voice-id')).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    { text: '' }, { text: ' ' }, { text: 'a'.repeat(601) }, { text: 'a', voice: ' ' },
    { text: 'a', language: 'Klingon' },
  ])('rejects invalid arguments without an API call: %j', async (args) => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const { call } = await boot()
    expect((await call(args)).isError).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports a missing environment key without sending a request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const { call } = await boot({}, '')
    expect(JSON.stringify((await call()).content)).toContain('DASHSCOPE_API_KEY')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [401, response()], [500, response()], [200, { output: { audio: { url: 'javascript:alert(1)' } } }],
    [200, { output: { audio: {} } }],
  ])('contains provider failures without leaking response fields: %i', async (status, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status === 200 ? Response.json(body) : new Response('fixture-key', { status }))
    const { call } = await boot()
    const result = await call()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain('fixture-key')
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
    const result = call({ text: 'hello' }, controller.signal)
    await entered.promise
    if (mode === 'caller') controller.abort()
    if (mode === 'disable') await ctx.settings.update('qwen-tts', { enabled: false })
    if (mode === 'unload') await fiber.dispose()
    expect((await result).isError).toBe(true)
    expect(requestSignal?.aborted).toBe(true)
  })

  it('rejects invalid configuration before saving it', async () => {
    const { ctx } = await boot()
    for (const change of [{ baseURL: 'file:///tmp' }, { apiKeyEnv: 'bad key' }, { timeoutMs: 0 }, { defaultVoice: ' ' }]) {
      await expect(ctx.settings.update('qwen-tts', change)).rejects.toThrow()
    }
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['text_to_speech'])
  })
})
