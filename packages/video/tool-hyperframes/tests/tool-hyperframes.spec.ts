/** HyperFrames tools over a deterministic subprocess fixture. */

import { tmpdir } from 'node:os'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import SubprocessRuntime from '@deepseek-ai/dsh-subprocess'
import type { SubprocessCollectedOutputs, SubprocessHandle, SubprocessOutcome, SubprocessOutputRead, SubprocessOutputReader, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import sharp from 'sharp'
import { assembleSnapshotGrid } from '../src/collage.ts'
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

class FakeReader implements SubprocessOutputReader {
  constructor(private readonly text: string) {}

  readFrom(_fromByte: number): SubprocessOutputRead {
    return { text: this.text, nextOffset: Buffer.byteLength(this.text), lossy: false }
  }
}

class FakeHandle implements SubprocessHandle {
  readonly stdin = undefined
  readonly stdout = undefined
  readonly stderr = undefined
  readonly control = undefined
  readonly collected: SubprocessCollectedOutputs
  readonly done: Promise<SubprocessOutcome>
  terminated = false

  constructor(
    spec: SubprocessSpawnSpec,
    action: () => Promise<void>,
    stdout: string,
    stderr = '',
    outcome: SubprocessOutcome = { exitCode: 0, signal: null },
    doneError?: unknown,
    missingStderr = false,
  ) {
    this.collected = { stdout: new FakeReader(stdout), ...(missingStderr ? {} : { stderr: new FakeReader(stderr) }) }
    spec.signal?.addEventListener('abort', () => { this.terminated = true }, { once: true })
    this.done = doneError === undefined
      ? action().then(() => outcome)
      : Promise.resolve().then(() => { throw doneError })
  }

  terminate(): void { this.terminated = true }

  waitForExit(_signal?: AbortSignal): Promise<boolean> { return Promise.resolve(true) }
}

class FakeSubprocess extends SubprocessRuntime {
  readonly spawns: SubprocessSpawnSpec[] = []
  outcome: SubprocessOutcome = { exitCode: 0, signal: null }
  stdout: string | undefined = undefined
  stderr = ''
  renderContent = Buffer.from('fixture-mp4')
  doneError: unknown
  missingStderr = false

  override async resolveExecutable(command: string): Promise<string> { return command }

  override async terminalEnvironment() { return { platform: 'posix' as const } }

  override spawnTerminal(_spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return Promise.reject(new Error('HyperFrames fixture does not allocate terminals'))
  }

  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.spawns.push(spec)
    const argv = [...spec.argv]
    const subcommand = argv[2]
    const outputIndex = argv.indexOf('--output')
    const output = outputIndex === -1 ? undefined : argv[outputIndex + 1]
    const action = async () => {
      if (subcommand === 'snapshot') {
        if (output === undefined) throw new Error('fixture snapshot output is missing')
        await mkdir(output, { recursive: true })
        const at = argv[argv.indexOf('--at') + 1]?.split(',').map(Number) ?? []
        await Promise.all(at.map((time, index) => sharp({
          create: { width: 4, height: 2, channels: 3, background: { r: index * 20, g: 40, b: 80 } },
        }).png().toFile(join(output, `frame-${String(index).padStart(2, '0')}-at-${time}s.png`))))
      } else if (subcommand === 'render') {
        if (output === undefined) throw new Error('fixture render output is missing')
        await writeFile(output, this.renderContent)
      }
    }
    const stdout = this.stdout ?? (subcommand === 'lint' ? '{"ok":true,"errors":[]}' : '')
    return new FakeHandle(spec, action, stdout, this.stderr, this.outcome, this.doneError, this.missingStderr)
  }
}

class FakeWebServer extends Service {
  readonly routes = new Map<string, WebRoute>()

  constructor(ctx: Context) {
    super(ctx, 'webServer')
  }

  register(route: WebRoute): () => void {
    this.routes.set(route.path, route)
    return () => { this.routes.delete(route.path) }
  }
}

const contexts: Context[] = []
const projectDirectories: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(projectDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function createProjectDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-hyperframes-'))
  projectDirectories.push(path)
  return path
}

async function boot(config: Partial<plugin.Config> = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FakeSubprocess)
  await ctx.plugin(MemorySettings)
  const fiber = await ctx.plugin(plugin, { enabled: true, ...config })
  return { ctx, fiber, subprocess: ctx.subprocess as FakeSubprocess }
}

async function applyWithoutSchema(config: Partial<plugin.Config>): Promise<void> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FakeSubprocess)
  plugin.apply(ctx, {
    enabled: true,
    cliCommand: 'npx',
    timeoutMs: 600000,
    maxOutputBytes: 524288,
    graceMs: 3000,
    ...config,
  })
}

function call(ctx: Context, name: string, arguments_: unknown) {
  return ctx.tools.execute({
    name,
    callId: ToolCallId(`hyperframes-${name}`),
    arguments: arguments_,
    signal: new AbortController().signal,
  })
}

describe('HyperFrames tools', () => {
  it('limits preview requests to video Sessions and unregisters its routes on unload', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(FakeSubprocess)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(FakeWebServer)
    const fiber = await ctx.plugin(plugin, { enabled: false })
    const webServer = ctx.get('webServer') as unknown as FakeWebServer
    expect([...webServer.routes.keys()]).toEqual(['/api/video-preview/player.js', '/api/video-preview'])
    const response = {
      statusCode: 0,
      body: '',
      writeHead(statusCode: number) { this.statusCode = statusCode },
      end(body = '') { this.body = body },
    }
    await webServer.routes.get('/api/video-preview')?.handler(
      { url: '/api/video-preview/missing-session', method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } } as IncomingMessage,
      response as unknown as ServerResponse,
    )
    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.body)).toEqual({ error: 'The selected video session has no project directory' })
    await fiber.dispose()
    expect(webServer.routes.size).toBe(0)
  })

  it('registers all three tools and forwards project paths as inert argv values', async () => {
    const { ctx, subprocess } = await boot()
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['video_lint', 'video_snapshot', 'video_render'])

    const project = await createProjectDirectory()
    const result = await call(ctx, 'video_lint', { project_path: project })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ ok: true, stdout: '{"ok":true,"errors":[]}' })
    expect(subprocess.spawns[0]?.argv).toEqual(['npx', 'hyperframes', 'lint', project, '--json'])
    expect(subprocess.spawns[0]?.cwd).toBe(project)
    expect(subprocess.spawns[0]?.env).toBeUndefined()
  })

  it('registers scoped tools without claiming the host settings namespace', async () => {
    const { ctx } = await boot({ registerSettings: false })
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['video_lint', 'video_snapshot', 'video_render'])
    expect(ctx.settings.get('hyperframes')).toBeUndefined()
    expect(ctx.settings.describe()).toEqual([])
  })

  it('forwards an explicit browser path to HyperFrames and its engine', async () => {
    const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const { ctx, subprocess } = await boot({ browserPath })
    const result = await call(ctx, 'video_lint', { project_path: await createProjectDirectory() })
    expect(result.isError).toBe(false)
    expect(subprocess.spawns[0]?.env).toEqual({
      HYPERFRAMES_BROWSER_PATH: browserPath,
      PRODUCER_HEADLESS_SHELL_PATH: browserPath,
    })
  })

  it('keeps the real browser path for the Windows render engine', async () => {
    const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const { ctx, subprocess } = await boot({ browserPath })
    const result = await call(ctx, 'video_render', { project_path: await createProjectDirectory() })
    expect(result.isError).toBe(false)
    expect(subprocess.spawns[0]?.env).toEqual({
      HYPERFRAMES_BROWSER_PATH: process.platform === 'win32' ? process.execPath : browserPath,
      PRODUCER_HEADLESS_SHELL_PATH: browserPath,
    })
  })

  it('keeps the configured browser path for snapshot commands', async () => {
    const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const { ctx, subprocess } = await boot({ browserPath })
    const result = await call(ctx, 'video_snapshot', {
      project_path: await createProjectDirectory(), times: [0],
    })
    expect(result.isError).toBe(false)
    expect(subprocess.spawns[0]?.env).toEqual({
      HYPERFRAMES_BROWSER_PATH: browserPath,
      PRODUCER_HEADLESS_SHELL_PATH: browserPath,
    })
  })

  it('retains the configured browser path when settings toggle the tools', async () => {
    const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const { ctx, subprocess } = await boot({ browserPath, enabled: false })
    await ctx.settings.update('hyperframes', { enabled: true })
    const result = await call(ctx, 'video_lint', { project_path: await createProjectDirectory() })
    expect(result.isError).toBe(false)
    expect(subprocess.spawns[0]?.env).toEqual({
      HYPERFRAMES_BROWSER_PATH: browserPath,
      PRODUCER_HEADLESS_SHELL_PATH: browserPath,
    })
  })

  it('renders requested times into a three-column snapshot grid', async () => {
    const { ctx, subprocess } = await boot()
    const project = await createProjectDirectory()
    const result = await call(ctx, 'video_snapshot', { project_path: project, times: [0, 1.5, 3, 4] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('snapshot fixture failed')
    const value = result.value as { path: string; columns: number; rows: number }
    expect(value).toMatchObject({ columns: 3, rows: 2 })
    const grid = await sharp(value.path).metadata()
    expect(grid.width).toBe(12)
    expect(grid.height).toBe(4)
    expect(subprocess.spawns[0]?.argv).toContain('--no-end')
  })

  it('returns a verified MP4 path', async () => {
    const { ctx } = await boot()
    const result = await call(ctx, 'video_render', { project_path: await createProjectDirectory() })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('render fixture failed')
    expect((result.value as { path: string }).path).toMatch(/video\.mp4$/)
  })

  it('rejects more than nine timestamps before spawning', async () => {
    const { ctx, subprocess } = await boot()
    const result = await call(ctx, 'video_snapshot', {
      project_path: await createProjectDirectory(), times: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    })
    expect(result.isError).toBe(true)
    expect(subprocess.spawns).toHaveLength(0)
  })

  it('rejects empty, negative, and non-contiguous snapshot requests', async () => {
    const { ctx, subprocess } = await boot()
    const project = await createProjectDirectory()
    for (const times of [[], [-1]]) {
      const result = await call(ctx, 'video_snapshot', { project_path: project, times })
      expect(result.isError).toBe(true)
    }
    expect(subprocess.spawns).toHaveLength(0)

    const missing = await createProjectDirectory()
    await writeFile(join(missing, 'notes.txt'), 'not a frame')
    await expect(assembleSnapshotGrid(missing, [0])).rejects.toThrow('produced 0 numbered frames')

    const nonContiguous = await createProjectDirectory()
    await writeFile(join(nonContiguous, 'frame-01-at-0s.png'), 'not inspected after index validation')
    await expect(assembleSnapshotGrid(nonContiguous, [0])).rejects.toThrow('produced 1 numbered frames')
  })

  it('resolves a relative project path from the process cwd', async () => {
    const { ctx, subprocess } = await boot()
    const result = await call(ctx, 'video_lint', { project_path: '.' })
    expect(result.isError).toBe(false)
    expect(subprocess.spawns[0]?.cwd).toBe(process.cwd())
  })

  it('rejects an empty project path', async () => {
    const { ctx } = await boot()
    const result = await call(ctx, 'video_lint', { project_path: '' })
    expect(result.isError).toBe(true)
  })

  it('returns lint diagnostics for a failed command and signal', async () => {
    const { ctx, subprocess } = await boot()
    subprocess.outcome = { exitCode: null, signal: 'SIGTERM' }
    subprocess.stdout = ''
    subprocess.stderr = ''
    const result = await call(ctx, 'video_lint', { project_path: process.cwd() })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected lint diagnostics')
    expect(result.value).toMatchObject({ ok: false, exitCode: -1, signal: 'SIGTERM' })
    expect(result.content[0]).toMatchObject({ type: 'text' })
  })

  it('reports snapshot command failures and render output failures', async () => {
    const { ctx, subprocess } = await boot()
    subprocess.outcome = { exitCode: 2, signal: null }
    subprocess.stdout = 'snapshot output'
    const snapshot = await call(ctx, 'video_snapshot', {
      project_path: await createProjectDirectory(), times: [0],
    })
    expect(snapshot.isError).toBe(true)
    expect(snapshot.content[0]).toMatchObject({ type: 'text' })

    subprocess.outcome = { exitCode: 0, signal: null }
    subprocess.stdout = undefined
    subprocess.stderr = ''
    subprocess.renderContent = Buffer.alloc(0)
    const render = await call(ctx, 'video_render', { project_path: await createProjectDirectory() })
    expect(render.isError).toBe(true)

    subprocess.outcome = { exitCode: null, signal: 'SIGTERM' }
    const cancelled = await call(ctx, 'video_render', { project_path: await createProjectDirectory() })
    expect(cancelled.isError).toBe(true)

    subprocess.outcome = { exitCode: null, signal: null }
    const unknownSignal = await call(ctx, 'video_snapshot', {
      project_path: await createProjectDirectory(), times: [0],
    })
    expect(unknownSignal.isError).toBe(true)
  })

  it('classifies subprocess settlement errors and missing output readers', async () => {
    const { ctx, subprocess } = await boot()
    subprocess.doneError = new Error('fixture settlement failed')
    const errorSettlement = await call(ctx, 'video_lint', { project_path: process.cwd() })
    expect(errorSettlement.isError).toBe(true)

    subprocess.doneError = 'fixture settlement failed'
    const settled = await call(ctx, 'video_lint', { project_path: process.cwd() })
    expect(settled.isError).toBe(true)

    subprocess.doneError = undefined
    subprocess.missingStderr = true
    const missing = await call(ctx, 'video_lint', { project_path: process.cwd() })
    expect(missing.isError).toBe(true)
  })

  it.each([
    ['cliCommand', { cliCommand: '   ' }],
    ['timeoutMs', { timeoutMs: 0 }],
    ['maxOutputBytes', { maxOutputBytes: 1023 }],
    ['graceMs', { graceMs: 0 }],
    ['browserPath', { browserPath: '   ' }],
    ['browserPath', { browserPath: 'chrome\0' }],
  ] as const)('rejects invalid %s configuration', async (_name, config) => {
    await expect(applyWithoutSchema(config)).rejects.toThrow('HyperFrames')
  })

  it('adds and removes the tools on live settings changes and unload', async () => {
    const { ctx, fiber } = await boot({ enabled: false })
    expect(ctx.tools.schemas()).toEqual([])
    await ctx.settings.update('hyperframes', { enabled: true })
    expect(ctx.tools.schemas().map(tool => tool.name)).toHaveLength(3)
    await ctx.settings.update('hyperframes', { enabled: false })
    expect(ctx.tools.schemas()).toEqual([])
    await ctx.settings.update('hyperframes', { enabled: true })
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
  })
})

describe('HyperFrames Loader composition', () => {
  it('loads the named plugin from cordis.yml and exposes its Agent Tools', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(FakeSubprocess)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-tool-hyperframes', plugin],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        const module = modules.get(specifier)
        if (module === undefined) throw new Error(`Unexpected fixture module: ${specifier}`)
        return module
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    expect('default' in plugin).toBe(false)
    expect(ctx.loader.unwrapExports(plugin)).toBe(plugin)
    await ctx.loader.create({
      name: 'cordis:include', config: { path: new URL('./fixtures/cordis.yml', import.meta.url).href },
    })
    await ctx.loader.await()
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['video_lint', 'video_snapshot', 'video_render'])
  })
})
