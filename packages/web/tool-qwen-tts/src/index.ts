/**
 * Opt-in Qwen3-TTS text-to-speech with voice selection and live settings.
 * @module @deepseek-ai/dsh-tool-qwen-tts
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as json } from 'zod'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage } from 'node:http'

/** Loader-visible plugin name. */
export const name = 'tool-qwen-tts'
/** Tool registration requires the scoped runtime. */
export const inject = ['tools']

/** Deployment and live settings for Qwen text-to-speech. */
export interface Config {
  /** Register text_to_speech when true; defaults to false. */
  enabled?: boolean
  /** Register the host settings section; scoped presets set this to false. */
  registerSettings?: boolean
  /** Register the fixed-sample voice preview route when true; defaults to false and applies live. */
  registerVoicePreview?: boolean
  /** Launch environment variable containing the DashScope bearer key. */
  apiKeyEnv?: string
  /** DashScope API base, with `/api/v1`; defaults to the Beijing endpoint. */
  baseURL?: string
  /** Qwen speech model; defaults to `qwen3-tts-flash`. */
  model?: string
  /** Voice used when a tool call omits `voice`; defaults to `Cherry`. */
  defaultVoice?: string
  /** Total request deadline in milliseconds; defaults to 120000. */
  timeoutMs?: number
}

/** Supported language values accepted by Qwen-TTS. */
const LANGUAGE_TYPES = [
  'Auto', 'Chinese', 'English', 'German', 'Italian', 'Portuguese',
  'Spanish', 'Japanese', 'Korean', 'French', 'Russian',
] as const

/** Validated deployment configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  registerSettings: z.boolean().default(true),
  registerVoicePreview: z.boolean().default(false),
  apiKeyEnv: z.string().default('DASHSCOPE_API_KEY'),
  baseURL: z.string().default('https://dashscope.aliyuncs.com/api/v1'),
  model: z.string().default('qwen3-tts-flash'),
  defaultVoice: z.string().default('Cherry'),
  timeoutMs: z.number().min(1).step(1).default(120000),
})

const responseSchema = json.object({
  output: json.object({
    audio: json.object({
      url: json.url().refine(value => /^https?:\/\//.test(value)),
      expires_at: json.number().int().nonnegative().optional(),
    }),
  }),
})

const previewVoices = new Set([
  'Cherry', 'Nofish', 'Elias', 'Ethan', 'Ryan', 'Jennifer', 'Katerina', 'Dylan', 'Jada',
  'Li', 'Sunny', 'Eric', 'Marcus', 'Roy', 'Peter', 'Rocky', 'Kiki',
])
const previewText = '你好，欢迎试听当前选择的音色。'

function validateConfig(config: Required<Config>): void {
  const url = new URL(config.baseURL)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Qwen TTS baseURL must be an HTTP(S) URL without credentials, query, or fragment')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.apiKeyEnv)) {
    throw new Error('Qwen TTS apiKeyEnv must name an environment variable')
  }
  if (!config.model.trim()) throw new Error('Qwen TTS model must not be empty')
  if (!config.defaultVoice.trim()) throw new Error('Qwen TTS defaultVoice must not be empty')
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 2147483647) {
    throw new Error('Qwen TTS timeoutMs must be an integer between 1 and 2147483647')
  }
}

/**
 * Install the settings section and reversibly register text_to_speech.
 * Disabling or unloading aborts local requests; it does not revoke an audio
 * URL already issued by Qwen.
 * @param ctx - context supplying the tool runtime and optional settings provider.
 * @param config - resolved composition configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const entry = config as Required<Config>
  const registerSettings = config.registerSettings ?? true
  validateConfig(entry)
  let current = () => entry
  let unregister: (() => void) | undefined
  let lifetime = new AbortController()
  const previewLifetime = new AbortController()
  const pending = new Set<Promise<unknown>>()
  const previewRouteSyncs = new Set<(options: Required<Config>) => void>()

  const syncPreviewRoute = (options: Required<Config>): void => {
    for (const sync of previewRouteSyncs) sync(options)
  }

  ctx.inject(['webServer'], (webCtx) => {
    let unregister: (() => void) | undefined
    const sync = (options: Required<Config>): void => {
      if (!options.registerVoicePreview) {
        unregister?.()
        unregister = undefined
      } else if (unregister === undefined) {
        unregister = webCtx.webServer.register(createVoicePreviewRoute(ctx, current, pending, previewLifetime.signal))
      }
    }
    previewRouteSyncs.add(sync)
    sync(current())
    webCtx.effect(() => () => {
      previewRouteSyncs.delete(sync)
      unregister?.()
    }, 'qwen-tts: voice preview route')
  })

  const update = () => {
    const options = current()
    validateConfig(options)
    syncPreviewRoute(options)
    unregister?.()
    unregister = undefined
    lifetime.abort(new Error('Qwen TTS disabled or reconfigured'))
    lifetime = new AbortController()
    if (!options.enabled) return
    const activation = lifetime.signal
    unregister = ctx.tools.register(defineTool({
      name: 'text_to_speech',
      description: 'Convert text to speech with Qwen3-TTS. Returns a downloadable audio URL valid for 24 hours. Choose a Qwen voice when the default voice is not suitable.',
      timeoutMs: options.timeoutMs,
      parameters: {
        text: { type: 'string', required: true, description: 'Text to synthesize; Qwen3-TTS-Flash accepts up to 600 characters.' },
        voice: { type: 'string', description: `Qwen voice name or custom voice ID. Default: ${options.defaultVoice}.` },
        language: { type: 'string', enum: [...LANGUAGE_TYPES], description: 'Language of the text. Omit for Auto; matching a single-language text improves pronunciation.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            voice: { type: 'string', required: true },
            model: { type: 'string', required: true },
            expiresAt: { type: 'integer' },
          },
        },
        render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
      },
      execute(args, exec) {
        const run = async () => {
          if (!args.text.trim() || Array.from(args.text).length > 600) {
            throw new Error('Qwen TTS text must contain 1-600 characters')
          }
          const voice = args.voice === undefined ? options.defaultVoice : args.voice.trim()
          if (!voice) throw new Error('Qwen TTS voice must not be empty')
          const key = launchEnvironmentOf(ctx).get(options.apiKeyEnv)?.value.trim()
          if (!key) throw new Error(`Configure ${options.apiKeyEnv} in .env and restart before synthesizing speech`)
          const deadline = new AbortController()
          const timer = setTimeout(() => { deadline.abort(new Error('Qwen TTS request timed out')) }, options.timeoutMs)
          const signal = AbortSignal.any([exec.signal, activation, deadline.signal])
          const base = options.baseURL.replace(/\/+$/, '')
          try {
            signal.throwIfAborted()
            const response = await fetch(`${base}/services/aigc/multimodal-generation/generation`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: options.model,
                input: {
                  text: args.text,
                  voice,
                  ...(args.language === undefined ? {} : { language_type: args.language }),
                },
              }),
              redirect: 'error',
              signal,
            })
            if (!response.ok) {
              await response.body?.cancel()
              throw new Error(`Qwen TTS request failed (HTTP ${response.status})`)
            }
            const parsed = responseSchema.safeParse(await response.json())
            if (!parsed.success) throw new Error('Qwen TTS returned an invalid audio response')
            return {
              url: parsed.data.output.audio.url,
              voice,
              model: options.model,
              ...(parsed.data.output.audio.expires_at === undefined
                ? {} : { expiresAt: parsed.data.output.audio.expires_at }),
            }
          } catch (error) {
            const reason = deadline.signal.aborted ? 'Qwen TTS request timed out'
              : signal.aborted ? 'Speech synthesis stopped' : undefined
            if (reason !== undefined) throw new Error(reason)
            if (error instanceof Error && /^Qwen TTS /.test(error.message)) throw error
            throw new Error('Qwen TTS request failed')
          } finally {
            clearTimeout(timer)
          }
        }
        const result = run()
        pending.add(result)
        void result.then(() => pending.delete(result), () => pending.delete(result))
        return result
      },
    }))
  }

  update()
  ctx.effect(() => async () => {
    unregister?.()
    lifetime.abort(new Error('Qwen TTS unloaded'))
    previewLifetime.abort(new Error('Qwen TTS preview unloaded'))
    await Promise.allSettled(pending)
  })
  if (registerSettings) {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, 'qwen-tts', Config as z<Required<Config>>, entry, {
        setSource: (source) => { current = source },
        onChange: update,
        validate: validateConfig,
      })
    })
  }
}

function createVoicePreviewRoute(
  ctx: Context,
  current: () => Required<Config>,
  pending: Set<Promise<unknown>>,
  lifetime: AbortSignal,
): WebRoute {
  return {
    kind: 'exact',
    path: '/api/qwen-tts/voice-preview',
    handler: async (req, res) => {
      if (!sameOriginRequest(req)) {
        res.writeHead(403)
        res.end()
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      try {
        const body = await readPreviewRequest(req)
        if (!previewVoices.has(body.voice)) {
          res.writeHead(400)
          res.end()
          return
        }
        const options = current()
        const key = launchEnvironmentOf(ctx).get(options.apiKeyEnv)?.value.trim()
        if (!key) throw new Error('Qwen TTS API key is not configured')
        const operation = (async () => {
          const base = options.baseURL.replace(/\/+$/, '')
          const response = await fetch(`${base}/services/aigc/multimodal-generation/generation`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: options.model, input: { text: previewText, voice: body.voice, language_type: 'Chinese' } }),
            redirect: 'error',
            signal: AbortSignal.any([lifetime, AbortSignal.timeout(options.timeoutMs)]),
          })
          if (!response.ok) {
            await response.body?.cancel()
            throw new Error(`Qwen TTS request failed (HTTP ${response.status})`)
          }
          const parsed = responseSchema.safeParse(await response.json())
          if (!parsed.success) throw new Error('Qwen TTS returned an invalid audio response')
          return parsed.data.output.audio.url
        })()
        pending.add(operation)
        void operation.then(() => pending.delete(operation), () => pending.delete(operation))
        const url = await operation
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ url }))
      } catch {
        if (res.headersSent) return
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ error: 'Could not generate the voice preview' }))
      }
    },
  }
}

function sameOriginRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readPreviewRequest(req: IncomingMessage): Promise<{ readonly voice: string }> {
  const declaredLength = Number(req.headers['content-length'] ?? 0)
  if (!Number.isInteger(declaredLength) || declaredLength < 0 || declaredLength > 128) {
    throw new Error('Invalid voice preview request size')
  }
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk))
    length += bytes.byteLength
    if (length > 128) throw new Error('Invalid voice preview request size')
    chunks.push(bytes)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null || !('voice' in value) || typeof value.voice !== 'string') {
    throw new Error('Invalid voice preview request')
  }
  return { voice: value.voice }
}
