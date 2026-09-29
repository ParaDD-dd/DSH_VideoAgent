/**
 * Opt-in Agent Tools that wrap the HyperFrames CLI for linting, snapshots, and
 * MP4 rendering, with live enablement through the settings service.
 * @module @deepseek-ai/dsh-tool-hyperframes
 */

import { mkdir, readFile, stat } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { assembleSnapshotGrid } from './collage.ts'
import { resolveCompositionDirectory } from './composition.ts'
import { runHyperframes, type HyperframesCommandResult } from './runner.ts'
import type { HyperframesOptions } from './types.ts'

/** Loader-visible plugin name. */
export const name = 'tool-hyperframes'

/** This plugin requires the tool registry and subprocess execution seam. */
export const inject = ['tools', 'subprocess']

/** Deployment and live settings for the HyperFrames command wrapper. */
export interface Config {
  /** Register the three HyperFrames tools when true; defaults to false. */
  enabled?: boolean
  /** Register the host settings section; scoped presets set this to false. */
  registerSettings?: boolean
  /** Executable name or absolute path used to invoke the package runner. */
  cliCommand?: string
  /** Absolute executable path used by HyperFrames to launch its browser. */
  browserPath?: string
  /** Maximum duration of one tool call and child process, in milliseconds. */
  timeoutMs?: number
  /** Maximum retained stdout and stderr bytes per child process. */
  maxOutputBytes?: number
  /** Child-process termination grace period in milliseconds. */
  graceMs?: number
  /** Maximum time to wait for the local player server to accept requests. */
  previewStartupTimeoutMs?: number
}

/** Schemastery configuration with safe defaults for local HyperFrames work. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  registerSettings: z.boolean().default(true),
  cliCommand: z.string().default('npx'),
  browserPath: z.string(),
  timeoutMs: z.number().min(1).step(1).default(600000),
  maxOutputBytes: z.number().min(1024).step(1).default(524288),
  graceMs: z.number().min(1).step(1).default(3000),
  previewStartupTimeoutMs: z.number().min(1).step(1).default(20000),
})

type ResolvedConfig = Omit<Required<Config>, 'browserPath'> & Pick<Config, 'browserPath'>

/** Maximum number of source frames accepted by the contact-sheet operation. */
const MAX_SNAPSHOT_TIMES = 9

/** Largest diagnostic buffer accepted by one child-process stream. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** Largest timer delay accepted by Node's timer APIs. */
const MAX_TIMER_DELAY_MS = 2_147_483_647
const PLAYER_SCRIPT_PATH = fileURLToPath(import.meta.resolve('hyperframes/dist/hyperframes-player.global.js'))

function validateConfig(config: ResolvedConfig): void {
  if (!config.cliCommand.trim() || config.cliCommand.includes('\0')) {
    throw new Error('HyperFrames cliCommand must be a non-empty executable name or path')
  }
  if (config.browserPath !== undefined && (!config.browserPath.trim() || config.browserPath.includes('\0'))) {
    throw new Error('HyperFrames browserPath must be a non-empty browser executable path')
  }
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`HyperFrames timeoutMs must be an integer between 1 and ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isInteger(config.maxOutputBytes) || config.maxOutputBytes < 1024 || config.maxOutputBytes > MAX_OUTPUT_BYTES) {
    throw new Error(`HyperFrames maxOutputBytes must be an integer between 1024 and ${MAX_OUTPUT_BYTES}`)
  }
  if (!Number.isInteger(config.graceMs) || config.graceMs < 1 || config.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`HyperFrames graceMs must be an integer between 1 and ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isInteger(config.previewStartupTimeoutMs)
    || config.previewStartupTimeoutMs < 1
    || config.previewStartupTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`HyperFrames previewStartupTimeoutMs must be an integer between 1 and ${MAX_TIMER_DELAY_MS}`)
  }
}

function projectPathFor(exec: ToolExecution, projectPath: string): string {
  if (!projectPath.trim()) throw new Error('HyperFrames project_path must not be empty')
  const base = exec.agent?.session.header.cwd ?? process.cwd()
  return isAbsolute(projectPath) ? resolve(projectPath) : resolve(base, projectPath)
}

function outputDirectory(projectPath: string, kind: 'snapshots' | 'renders'): Promise<string> {
  const path = join(projectPath, kind, `dsh-${randomUUID()}`)
  return mkdir(path, { recursive: true }).then(() => path)
}

function commandFailed(kind: string, result: HyperframesCommandResult): Error {
  const exit = result.outcome.exitCode === null
    ? `signal ${result.outcome.signal ?? 'unknown'}`
    : `exit code ${result.outcome.exitCode}`
  const diagnostics = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n')
  return new Error(`HyperFrames ${kind} failed with ${exit}${diagnostics ? `:\n${diagnostics}` : ''}`)
}

function track<T>(pending: Set<Promise<unknown>>, work: Promise<T>): Promise<T> {
  pending.add(work)
  void work.then(() => pending.delete(work), () => pending.delete(work))
  return work
}

function validateTimes(times: readonly number[]): void {
  if (times.length < 1 || times.length > MAX_SNAPSHOT_TIMES) {
    throw new Error(`HyperFrames snapshot times must contain 1-${MAX_SNAPSHOT_TIMES} values`)
  }
  if (times.some(time => !Number.isFinite(time) || time < 0)) {
    throw new Error('HyperFrames snapshot times must be finite non-negative seconds')
  }
}

function lintTool(options: HyperframesOptions, activation: AbortSignal, ctx: Context, pending: Set<Promise<unknown>>) {
  return defineTool({
    name: 'video_lint',
    description: 'Run HyperFrames static project lint and contract checks. Pass the directory containing the HyperFrames project.',
    timeoutMs: options.timeoutMs,
    parameters: {
      project_path: { type: 'string', required: true, description: 'Path to the HyperFrames project directory.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          exitCode: { type: 'integer', required: true },
          signal: { type: 'string', required: true },
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `HyperFrames lint ${value.ok ? 'passed' : 'failed'} (exit code ${value.exitCode})\n${value.stdout || value.stderr || '(no diagnostic output)'}`,
      }],
    },
    execute(args, exec) {
      const run = (async () => {
        const projectPath = projectPathFor(exec, args.project_path)
        const result = await runHyperframes(ctx, exec, options, projectPath, 'lint', [projectPath, '--json'], activation)
        return {
          ok: result.outcome.exitCode === 0 && result.outcome.signal === null,
          exitCode: result.outcome.exitCode ?? -1,
          signal: result.outcome.signal ?? '',
          stdout: result.stdout,
          stderr: result.stderr,
        }
      })()
      return track(pending, run)
    },
  })
}

function snapshotTool(options: HyperframesOptions, activation: AbortSignal, ctx: Context, pending: Set<Promise<unknown>>) {
  return defineTool({
    name: 'video_snapshot',
    description: 'Render 1-9 HyperFrames timestamps and assemble the PNG frames into a three-column contact sheet. Pass the project directory and timestamps in seconds.',
    timeoutMs: options.timeoutMs,
    parameters: {
      project_path: { type: 'string', required: true, description: 'Path to the HyperFrames project directory.' },
      times: { type: 'array', required: true, items: { type: 'number' }, description: 'One to nine non-negative timestamps in seconds.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          frames: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                time: { type: 'number', required: true },
                path: { type: 'string', required: true },
              },
            },
          },
          columns: { type: 'integer', required: true },
          rows: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(args, exec) {
      const run = (async () => {
        validateTimes(args.times)
        const projectPath = projectPathFor(exec, args.project_path)
        const directory = await outputDirectory(projectPath, 'snapshots')
        const result = await runHyperframes(ctx, exec, options, projectPath, 'snapshot', [
          projectPath,
          '--at', args.times.join(','),
          '--output', directory,
          '--no-end',
        ], activation)
        if (result.outcome.exitCode !== 0 || result.outcome.signal !== null) throw commandFailed('snapshot', result)
        return assembleSnapshotGrid(directory, args.times)
      })()
      return track(pending, run)
    },
  })
}

function renderTool(options: HyperframesOptions, activation: AbortSignal, ctx: Context, pending: Set<Promise<unknown>>) {
  return defineTool({
    name: 'video_render',
    description: 'Render a HyperFrames project to an MP4 file and return its path. Pass the directory containing the project.',
    timeoutMs: options.timeoutMs,
    parameters: {
      project_path: { type: 'string', required: true, description: 'Path to the HyperFrames project directory.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.path }],
    },
    execute(args, exec) {
      const run = (async () => {
        const projectPath = projectPathFor(exec, args.project_path)
        const directory = await outputDirectory(projectPath, 'renders')
        const path = join(directory, 'video.mp4')
        const result = await runHyperframes(ctx, exec, options, projectPath, 'render', [projectPath, '--output', path], activation)
        if (result.outcome.exitCode !== 0 || result.outcome.signal !== null) throw commandFailed('render', result)
        const output = await stat(path)
        if (!output.isFile() || output.size < 1) throw new Error(`HyperFrames render did not create a non-empty MP4 at ${path}`)
        return { path }
      })()
      return track(pending, run)
    },
  })
}

/**
 * Install settings and live registration for the three HyperFrames tools.
 * Disabling or unloading aborts child processes and waits for started calls.
 * @param ctx - context providing tools, subprocess, and optional settings.
 * @param config - resolved composition configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const entry = config as ResolvedConfig
  const registerSettings = config.registerSettings ?? true
  validateConfig(entry)
  let current = () => entry
  let unregister: (() => void) | undefined
  let lifetime = new AbortController()
  const pending = new Set<Promise<unknown>>()
  let preview: { readonly sessionId: SessionId; readonly url: string; readonly process: SubprocessHandle } | undefined
  let previewStarting: Promise<{ readonly sessionId: SessionId; readonly url: string }> | undefined

  const stopPreview = async (): Promise<void> => {
    const current = preview
    preview = undefined
    if (current === undefined) return
    current.process.terminate()
    await current.process.waitForExit()
  }

  const startPreview = async (sessionId: SessionId): Promise<{ readonly sessionId: SessionId; readonly url: string }> => {
    if (preview?.sessionId === sessionId) return preview
    await stopPreview()
    const sessions = ctx.get('sessions')
    const session = sessions?.get(sessionId)
    const header = session?.header ?? (await ctx.get('sessionPersistence')?.stat(sessionId))?.header
    const projectPath = header?.cwd
    if (projectPath === undefined) throw new Error('The selected video session has no project directory')
    if (header?.agentPreset !== 'video-production') throw new Error('The selected session is not a video-production session')
    const compositionPath = await resolveCompositionDirectory(projectPath)
    const port = await availablePort()
    const options = current()
    const executable = await ctx.subprocess.resolveExecutable(options.cliCommand)
    const process = ctx.subprocess.spawn({
      argv: [executable, 'hyperframes', 'play', compositionPath, `--port=${port}`, '--no-open'],
      cwd: compositionPath,
      env: options.browserPath === undefined ? undefined : {
        HYPERFRAMES_BROWSER_PATH: options.browserPath,
        PRODUCER_HEADLESS_SHELL_PATH: options.browserPath,
      },
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: options.maxOutputBytes },
        stderr: { maxBytes: options.maxOutputBytes },
      },
      graceMs: options.graceMs,
    })
    const url = `http://127.0.0.1:${port}`
    preview = { sessionId, url, process }
    void process.done.then(() => {
      if (preview?.process === process) preview = undefined
    }, (error: unknown) => {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      if (preview?.process === process) preview = undefined
    })
    try {
      await waitForPreview(url, process, options.previewStartupTimeoutMs)
    } catch (error) {
      await stopPreview()
      throw error
    }
    return { sessionId, url }
  }

  const ensurePreview = async (sessionId: SessionId): Promise<{ readonly sessionId: SessionId; readonly url: string }> => {
    if (previewStarting !== undefined) await previewStarting
    if (preview?.sessionId === sessionId) return preview
    const starting = track(pending, startPreview(sessionId))
    previewStarting = starting
    try {
      return await starting
    } finally {
      if (previewStarting === starting) previewStarting = undefined
    }
  }

  const update = () => {
    const options = current()
    validateConfig(options)
    unregister?.()
    unregister = undefined
    lifetime.abort(new Error('HyperFrames tools disabled or reconfigured'))
    lifetime = new AbortController()
    if (!options.enabled) return
    const activation = lifetime.signal
    const removers = [
      ctx.tools.register(lintTool(options, activation, ctx, pending)),
      ctx.tools.register(snapshotTool(options, activation, ctx, pending)),
      ctx.tools.register(renderTool(options, activation, ctx, pending)),
    ]
    unregister = () => { for (const remove of removers.reverse()) remove() }
  }

  update()
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/api/video-preview/player.js',
      handler: async (_req, res) => {
        const source = await readFile(PLAYER_SCRIPT_PATH)
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'content-length': source.byteLength,
          'cache-control': 'public, max-age=86400',
          'x-content-type-options': 'nosniff',
        })
        res.end(source)
      },
    }), 'video preview player asset')
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/api/video-preview',
      handler: async (req, res) => {
        if (!sameOriginRequest(req)) {
          res.writeHead(403)
          res.end()
          return
        }
        const sessionText = new URL(req.url ?? '/', 'http://localhost').pathname.slice('/api/video-preview/'.length)
        const sessionId = brandString<SessionId>(decodeURIComponent(sessionText))
        try {
          if (req.method === 'DELETE') {
            await previewStarting?.catch(() => undefined)
            if (preview?.sessionId === sessionId) await stopPreview()
            res.writeHead(204)
            res.end()
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405)
            res.end()
            return
          }
          const result = await ensurePreview(sessionId)
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(result))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(409, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: message }))
        }
      },
    }), 'video preview route')
  }
  ctx.effect(() => async () => {
    unregister?.()
    lifetime.abort(new Error('HyperFrames tools unloaded'))
    await previewStarting?.catch(() => undefined)
    await stopPreview()
    await Promise.allSettled(pending)
  })
  if (registerSettings) {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, 'hyperframes', Config as z<ResolvedConfig>, entry, {
        setSource: (source) => { current = source },
        onChange: update,
        validate: validateConfig,
      })
    })
  }
}

async function availablePort(): Promise<number> {
  const server = createNetServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Could not allocate a local HyperFrames preview port')
  const port = address.port
  await new Promise<void>((resolve, reject) => server.close((error) => {
    if (error === undefined) resolve()
    else reject(error)
  }))
  return port
}

async function waitForPreview(url: string, process: SubprocessHandle, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await Promise.race([
      process.done.then(() => 'exited' as const, () => 'exited' as const),
      wait(200),
    ])
    if (state === 'exited') throw new Error('HyperFrames preview exited before its server became ready')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) })
      if (response.ok) return
    } catch { /* The local server has not bound its port yet. */ }
  }
  throw new Error(`HyperFrames preview did not become ready within ${timeoutMs} ms`)
}

/** Refuse cross-site browser requests to the local process-control route. */
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

function wait(delayMs: number): Promise<'waiting'> {
  return new Promise(resolve => setTimeout(() => { resolve('waiting') }, delayMs))
}
