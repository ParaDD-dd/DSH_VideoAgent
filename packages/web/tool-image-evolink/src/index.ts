/**
 * Opt-in EvoLink image generation, with foreground polling and live settings.
 * @module @deepseek-ai/dsh-tool-image-evolink
 */

import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as json } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-settings'

/** Loader-visible plugin name. */
export const name = 'tool-image-evolink'
/** Tool registration requires the scoped runtime. */
export const inject = ['tools']

/** Deployment and live settings for EvoLink image generation. */
export interface Config {
  /** Register image_generate when true; defaults to false. */
  enabled?: boolean
  /** Register the host settings section; scoped presets set this to false. */
  registerSettings?: boolean
  /** Launch environment variable containing the bearer key. */
  apiKeyEnv?: string
  /** API origin, without /v1; defaults to https://api.evolink.ai. */
  baseURL?: string
  /** Delay between task queries in milliseconds; defaults to 5000. */
  pollIntervalMs?: number
  /** Total creation and polling deadline in milliseconds; defaults to 300000. */
  timeoutMs?: number
}

/** Validated configuration; credentials never enter the settings document. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  registerSettings: z.boolean().default(true),
  apiKeyEnv: z.string().default('EVOLINK_API_KEY'),
  baseURL: z.string().default('https://api.evolink.ai'),
  pollIntervalMs: z.number().min(1).step(1).default(5000),
  timeoutMs: z.number().min(1).step(1).default(300000),
})

type TaskId = Branded<'EvoLinkTaskId'>
const taskSchema = json.object({
  id: json.string().regex(/^[A-Za-z0-9_-]+$/).transform(value => brandString<TaskId>(value)),
  status: json.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  results: json.array(json.url().refine(value => /^https?:\/\//.test(value))).optional(),
})
const ratios = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '1:2', '2:1']

function validateConfig(config: Required<Config>): void {
  const url = new URL(config.baseURL)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('EvoLink baseURL must be an HTTP(S) URL without credentials, query, or fragment')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.apiKeyEnv)) {
    throw new Error('EvoLink apiKeyEnv must name an environment variable')
  }
  for (const key of ['pollIntervalMs', 'timeoutMs'] as const) {
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 2147483647) {
      throw new Error(`EvoLink ${key} must be an integer between 1 and 2147483647`)
    }
  }
}

/**
 * Install the settings section and reversibly register image_generate.
 * Disabling aborts local requests and waits; it cannot cancel an upstream task.
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
  const pending = new Set<Promise<unknown>>()

  const update = () => {
    const options = current()
    validateConfig(options)
    unregister?.()
    unregister = undefined
    lifetime.abort(new Error('EvoLink image generation disabled or reconfigured'))
    lifetime = new AbortController()
    if (!options.enabled) return
    const activation = lifetime.signal
    unregister = ctx.tools.register(defineTool({
      name: 'image_generate',
      description: 'Generate an image from a text prompt using Z-Image Turbo. Waits for generation and returns image URLs valid for 24 hours. Save the images before the links expire.',
      timeoutMs: options.timeoutMs,
      parameters: {
        prompt: { type: 'string', required: true, description: 'Image description, 1–2000 characters.' },
        size: { type: 'string', description: 'Aspect ratio (1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 1:2, 2:1) or WIDTHxHEIGHT, each 376–1536 pixels. Default: 1:1.' },
        seed: { type: 'integer', description: 'Optional random seed, 1–2147483647.' },
        nsfw_check: { type: 'boolean', description: 'Enable additional content moderation. Default: false.' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            taskId: { type: 'string', required: true },
            urls: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
      },
      execute(args, exec) {
        const run = async () => {
          if (!args.prompt.trim() || Array.from(args.prompt).length > 2000) {
            throw new Error('Image prompt must contain 1–2000 characters')
          }
          const size = args.size ?? '1:1'
          if (!ratios.includes(size)) {
            const dimensions = /^(\d+)x(\d+)$/.exec(size)
            if (!dimensions || dimensions.slice(1).some(value => Number(value) < 376 || Number(value) > 1536)) {
              throw new Error('Image size must be a supported aspect ratio or WIDTHxHEIGHT (376–1536 pixels)')
            }
          }
          if (args.seed !== undefined && (args.seed < 1 || args.seed > 2147483647)) {
            throw new Error('Image seed must be between 1 and 2147483647')
          }
          const key = launchEnvironmentOf(ctx).get(options.apiKeyEnv)?.value.trim()
          if (!key) throw new Error(`Configure ${options.apiKeyEnv} in .env and restart before generating images`)
          const deadline = new AbortController()
          const timer = setTimeout(() => { deadline.abort(new Error('EvoLink image generation timed out')) }, options.timeoutMs)
          const signal = AbortSignal.any([exec.signal, activation, deadline.signal])
          const base = options.baseURL.replace(/\/+$/, '')
          const request = async (path: string, body?: object) => {
            signal.throwIfAborted()
            const response = await fetch(`${base}${path}`, {
              method: body === undefined ? 'GET' : 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              redirect: 'error',
              signal,
            })
            if (!response.ok) {
              await response.body?.cancel()
              throw new Error(`EvoLink request failed (HTTP ${response.status})`)
            }
            const result = taskSchema.safeParse(await response.json())
            if (!result.success) throw new Error('EvoLink returned an invalid image task response')
            return result.data
          }
          let taskId: TaskId | undefined
          try {
            let task = await request('/v1/images/generations', {
              model: 'z-image-turbo', prompt: args.prompt, size,
              ...(args.seed === undefined ? {} : { seed: args.seed }),
              nsfw_check: args.nsfw_check ?? false,
            })
            taskId = task.id
            while (true) {
              signal.throwIfAborted()
              switch (task.status) {
                case 'completed':
                  if (!task.results?.length) throw new Error('EvoLink completed without image URLs')
                  return { taskId, urls: task.results }
                case 'failed':
                case 'cancelled':
                  throw new Error(`EvoLink image task ${task.status}`)
                case 'pending':
                case 'processing':
                  await delay(options.pollIntervalMs, undefined, { signal })
                  task = await request(`/v1/tasks/${taskId}`)
                  if (task.id !== taskId) throw new Error('EvoLink returned a different task ID')
                  break
                /* v8 ignore next -- taskSchema constrains status to every handled literal. */
                default:
                  assertNever(task.status)
              }
            }
          } catch (error) {
            // Provider bodies and network errors may echo request credentials.
            const reason = deadline.signal.aborted ? 'EvoLink image generation timed out'
              : signal.aborted ? 'Image generation stopped' : 'Image generation failed'
            const detail = error instanceof Error && /^(EvoLink|Image generation)/.test(error.message)
              ? error.message : reason
            throw new Error(`${detail}${taskId === undefined ? '' : ` (task ${taskId}; upstream work may continue)`}`)
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
    lifetime.abort(new Error('EvoLink image generation unloaded'))
    await Promise.allSettled(pending)
  })
  if (registerSettings) {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, 'image-evolink', Config as z<Required<Config>>, entry, {
        setSource: (source) => { current = source },
        onChange: update,
        validate: validateConfig,
      })
    })
  }
}
