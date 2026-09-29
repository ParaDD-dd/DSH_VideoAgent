// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { en } from '../src/client/locales.ts'
import { VIDEO_PANEL_ID } from '../src/client/contract.ts'
import { VideoModeSwitch } from '../src/client/VideoModeSwitch.tsx'
import { VideoWorkspace } from '../src/client/VideoWorkspace.tsx'

let restoreFullscreenApi: (() => void) | undefined

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  restoreFullscreenApi?.()
  restoreFullscreenApi = undefined
})

function translate(key: keyof typeof en, params?: Record<string, unknown>): string {
  const value = en[key]
  return params === undefined
    ? value
    : value.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

function file(path: string, value: string): {
  absolutePath: string
  version: string
  offset: number
  data: string
  eof: boolean
} {
  return { absolutePath: `/projects/video/${path}`, version: '1', offset: 0, data: btoa(value), eof: true }
}

interface WorkspaceOptions {
  readonly sessionId?: string
  readonly title?: string
  readonly resourceStatus?: 'live' | 'loading' | 'failed'
  readonly resourceVersion?: string
  readonly readFile?: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<unknown>
  readonly createProject?: (name: string, parentPath: string) => Promise<void>
  readonly createConversation?: (workspaceId: WorkspaceId) => Promise<void>
  readonly projectTitle?: string
  readonly agentPreset?: string
  readonly sendRequest?: (sessionId: SessionId, text: string) => Promise<void>
}

function renderWorkspace(options: WorkspaceOptions = {}) {
  const sessionId = options.sessionId as SessionId | undefined
  const workspaceId = 'workspace-1' as WorkspaceId
  const summary = sessionId === undefined ? undefined : {
    id: sessionId,
    displayTitle: options.title ?? 'Untitled video',
    running: false,
    blank: false,
    updatedAt: 1,
    projectionValues: { agentPreset: options.agentPreset ?? 'video-production' },
  }
  const sessionState = {
    ids: summary === undefined ? [] : [sessionId],
    byId: summary === undefined ? {} : { [summary.id]: summary },
    current: sessionId,
    phase: 'ready',
    subagentsByParent: {},
  }
  const workspaceState = {
    phase: 'ready',
    items: summary === undefined ? [] : [{
      workspaceId,
      path: '/projects/video',
      title: options.projectTitle ?? 'Video project',
      sessionIds: [sessionId],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  }
  const readFile = options.readFile ?? (() => Promise.reject(new Error('unexpected file read')))
  const actions = {
    createProject: vi.fn(options.createProject ?? (() => Promise.resolve())),
    createConversation: vi.fn(options.createConversation ?? (() => Promise.resolve())),
    readFile: vi.fn(readFile),
    sendRequest: vi.fn(options.sendRequest ?? (() => Promise.resolve())),
    selectProject: vi.fn(),
    switchMode: vi.fn(),
  }
  const props = {
    useSessions: (select: (state: typeof sessionState) => unknown) => select(sessionState),
    useWorkspaces: (select: (state: typeof workspaceState) => unknown) => select(workspaceState),
    useResource: () => ({
      status: options.resourceStatus ?? 'loading',
      ...(options.resourceVersion === undefined ? {} : { value: { version: options.resourceVersion } }),
    }),
    renderSlot: (
      key: string,
      owner: {
        open?: boolean
        onPicked?: (path: string) => void
        onSelectWorkspace?: (workspaceId: WorkspaceId) => Promise<void>
      },
    ) =>
      key === 'video.project.directoryFlow'
        ? owner.open && <button onClick={() => { owner.onPicked?.('/projects') }}>Choose parent</button>
        : <>
          <p>Conversation messages</p>
          <button onClick={() => { void owner.onSelectWorkspace?.(workspaceId) }}>Choose workspace</button>
        </>,
    createProject: actions.createProject,
    createConversation: actions.createConversation,
    readFile: actions.readFile,
    sendRequest: actions.sendRequest,
    selectProject: actions.selectProject,
    switchMode: actions.switchMode,
    t: translate,
  } as unknown as Parameters<typeof VideoWorkspace>[0]
  const view = render(<VideoWorkspace {...props} />)
  return { ...actions, view }
}

describe('video workspace presentation', () => {
  it('shows the project list, timeline tracks, embedded Agent, and mode return action', () => {
    const { switchMode } = renderWorkspace()

    expect(screen.getByText(en['project.empty'])).toBeTruthy()
    expect(screen.getByText(en['timeline.subtitle'])).toBeTruthy()
    expect(screen.getByText(en['timeline.visual'])).toBeTruthy()
    expect(screen.getByText(en['timeline.audio'])).toBeTruthy()
    expect(screen.getByText('Conversation messages')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['mode.close'] }))
    expect(switchMode).toHaveBeenCalledWith(VIDEO_PANEL_ID, undefined)
  })

  it('creates a named project and selects projects from the Workspace history', async () => {
    const created = renderWorkspace()
    fireEvent.change(screen.getByRole('textbox', { name: en['project.name'] }), {
      target: { value: 'First cut' },
    })
    fireEvent.click(screen.getByRole('button', { name: en['project.create'] }))
    expect(created.createProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Choose parent' }))
    await waitFor(() => { expect(created.createProject).toHaveBeenCalledWith('First cut', '/projects') })
    expect(screen.getByRole('textbox', { name: en['project.name'] })).toHaveProperty('value', '')
    created.view.unmount()
    cleanup()

    const history = renderWorkspace({ sessionId: 'video-session', projectTitle: 'First cut' })
    fireEvent.click(screen.getByRole('button', { name: /First cut/ }))
    expect(history.selectProject).toHaveBeenCalledWith('video-session')
    fireEvent.click(screen.getByRole('button', { name: en['chat.newConversation'] }))
    await waitFor(() => { expect(history.createConversation).toHaveBeenCalledWith('workspace-1') })
    fireEvent.click(screen.getByRole('button', { name: 'Choose workspace' }))
    expect(history.selectProject).toHaveBeenLastCalledWith('video-session')
    expect(history.createConversation).toHaveBeenCalledTimes(1)

    history.view.unmount()
    cleanup()
    const ordinary = renderWorkspace({ sessionId: 'ordinary-session', agentPreset: 'regular' })
    fireEvent.click(screen.getByRole('button', { name: 'Choose workspace' }))
    await waitFor(() => { expect(ordinary.createConversation).toHaveBeenCalledWith('workspace-1') })
  })

  it('loads script and frame files into the preview and the three timeline tracks', async () => {
    const projectScript = {
      version: 1,
      title: 'City at dawn',
      script: 'Two views of a city.',
      canvas: { width: 1920, height: 1080 },
      shots: [
        {
          id: 'one', order: 1, narration: 'The lights fade.', visual: 'Night skyline', transition: 'cut',
          assets: [], durationSeconds: 2, audioPath: 'audio/voice-one.mp3', thumbnailPath: 'frames/night.jpg',
        },
        {
          id: 'two', order: 2, narration: 'The sun rises.', visual: 'Morning coast', transition: 'dissolve',
          assets: [], durationSeconds: 4, audioPath: null, thumbnailPath: 'frames/morning.webp',
        },
      ],
    }
    const reads = vi.fn(async (_sessionId: SessionId, path: string) => file(
      path,
      path === 'script.json' ? JSON.stringify(projectScript) : 'image bytes',
    ))
    renderWorkspace({
      sessionId: 'video-session',
      resourceStatus: 'live',
      resourceVersion: 'script-v1',
      readFile: reads,
    })

    const nightPreview = await screen.findByRole('img', { name: 'Night skyline' })
    expect(nightPreview.getAttribute('src')).toBe('data:image/jpeg;base64,aW1hZ2UgYnl0ZXM=')
    const audio = await screen.findByLabelText(en['preview.audioLabel'].replace('{order}', '1'))
    expect(audio.getAttribute('src')).toBe('data:audio/mpeg;base64,aW1hZ2UgYnl0ZXM=')
    expect(audio.hasAttribute('controls')).toBe(true)
    fireEvent.error(audio)
    expect(screen.getByRole('alert').textContent).toBe(en['preview.audioError'])
    fireEvent.click(screen.getByRole('button', { name: 'Shot 2 · 4s' }))
    const morningPreview = await screen.findByRole('img', { name: 'Morning coast' })
    expect(morningPreview.getAttribute('src')).toBe('data:image/webp;base64,aW1hZ2UgYnl0ZXM=')
    expect(screen.getByText('voice-one.mp3')).toBeTruthy()
    expect(screen.getByText(en['timeline.noAudio'])).toBeTruthy()
    expect(screen.queryByLabelText(en['preview.audioLabel'].replace('{order}', '1'))).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(reads).toHaveBeenCalledWith('video-session', 'script.json', expect.any(AbortSignal))
    expect(reads).toHaveBeenCalledWith('video-session', 'frames/night.jpg', expect.any(AbortSignal))
    expect(reads).toHaveBeenCalledWith('video-session', 'frames/morning.webp', expect.any(AbortSignal))
    expect(reads).toHaveBeenCalledWith('video-session', 'audio/voice-one.mp3', expect.any(AbortSignal))
  })

  it('keeps shot audio available with HyperFrames and previews selected shots independently', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    const previousFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    const previousRequestFullscreen = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen')
    const previousExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
    const requestFullscreen = vi.fn(async function (this: HTMLElement) {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this })
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
    restoreFullscreenApi = () => {
      if (previousFullscreenElement === undefined) Reflect.deleteProperty(document, 'fullscreenElement')
      else Object.defineProperty(document, 'fullscreenElement', previousFullscreenElement)
      if (previousRequestFullscreen === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
      else Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', previousRequestFullscreen)
      if (previousExitFullscreen === undefined) Reflect.deleteProperty(document, 'exitFullscreen')
      else Object.defineProperty(document, 'exitFullscreen', previousExitFullscreen)
    }
    class PlayerMock extends HTMLElement {
      controls = false
      muted = true
      readonly seeks: number[] = []
      readonly play = vi.fn()
      readonly pause = vi.fn()
      seek(time: number): void { this.seeks.push(time) }
    }
    if (customElements.get('hyperframes-player') === undefined) {
      customElements.define('hyperframes-player', PlayerMock)
    }
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: init?.method === 'POST',
      status: 200,
      json: async () => ({ sessionId: 'video-session', url: 'http://127.0.0.1:4567' }),
    } as Response))
    vi.stubGlobal('fetch', request)
    const projectScript = {
      version: 1, title: 'Timed shots', script: 'Two scenes.', canvas: { width: 1920, height: 1080 },
      shots: [
        { id: 'one', order: 1, narration: 'First', visual: 'First scene', transition: 'cut', assets: [], durationSeconds: 2, audioPath: 'audio/one.mp3', thumbnailPath: null },
        { id: 'two', order: 2, narration: 'Second', visual: 'Second scene', transition: 'cut', assets: [], durationSeconds: 3, audioPath: 'audio/two.mp3', thumbnailPath: null },
      ],
    }
    renderWorkspace({
      sessionId: 'video-session',
      resourceStatus: 'live',
      resourceVersion: 'script-v1',
      readFile: async (_sessionId, path) => file(path, path === 'script.json' ? JSON.stringify(projectScript) : 'audio bytes'),
    })
    fireEvent.click(await screen.findByRole('button', { name: en['preview.playerStart'] }))
    await waitFor(() => { expect(request).toHaveBeenCalledWith('/api/video-preview/video-session', { method: 'POST' }) })
    const host = await waitFor(() => {
      const element = document.querySelector('hyperframes-player')
      if (element === null) throw new Error('player was not mounted')
      return element as PlayerMock
    })
    expect(host.getAttribute('src')).toBe('http://127.0.0.1:4567/composition/index.html')
    expect(host.controls).toBe(true)
    expect(host.muted).toBe(false)
    fireEvent(host, new Event('ready'))
    await waitFor(() => { expect(host.seeks.at(-1)).toBe(0) })
    const fullscreenButton = await screen.findByRole('button', { name: en['preview.fullscreenStart'] })
    fireEvent.click(fullscreenButton)
    await waitFor(() => { expect(screen.getByRole('button', { name: en['preview.fullscreenExit'] })).toBeTruthy() })
    expect(document.fullscreenElement).toBe(fullscreenButton.parentElement)
    fireEvent.click(screen.getByRole('button', { name: en['preview.fullscreenExit'] }))
    await waitFor(() => { expect(screen.getByRole('button', { name: en['preview.fullscreenStart'] })).toBeTruthy() })
    expect(exitFullscreen).toHaveBeenCalledOnce()
    requestFullscreen.mockRejectedValueOnce(new Error('browser denied fullscreen'))
    fireEvent.click(screen.getByRole('button', { name: en['preview.fullscreenStart'] }))
    expect((await screen.findByRole('alert')).textContent).toBe(en['preview.fullscreenError'])
    expect(host.isConnected).toBe(true)
    const firstAudio = await screen.findByLabelText(en['preview.audioLabel'].replace('{order}', '1'))
    fireEvent.play(firstAudio)
    expect(host.pause).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Second sceneShot 2 · 3s/ }))
    await waitFor(() => { expect(host.seeks.at(-1)).toBe(2) })
    expect(await screen.findByLabelText(en['preview.audioLabel'].replace('{order}', '2'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['timeline.previewShot'].replace('{order}', '2') }))
    expect(host.play).toHaveBeenCalledOnce()
    expect(host.seeks.at(-1)).toBe(2)
    fireEvent(host, new CustomEvent('timeupdate', { detail: { currentTime: 5 } }))
    await waitFor(() => { expect(host.pause).toHaveBeenCalledTimes(2) })
    expect(host.seeks.at(-1)).toBe(5)
    fireEvent.click(screen.getByRole('button', { name: en['preview.showAllShots'] }))
    const allShots = screen.getByRole('region', { name: en['preview.allShotContent'] })
    expect(allShots.textContent).toContain('First scene')
    expect(allShots.textContent).toContain('Second scene')
    expect(allShots.textContent).toContain('First')
    expect(allShots.textContent).toContain('Second')
    expect(document.querySelector('hyperframes-player')).toBe(host)
    fireEvent.click(screen.getByRole('button', { name: en['preview.showSelectedShot'] }))
    expect(document.querySelector('hyperframes-player')).toBe(host)
  })

  it('reports an unreadable shot audio file without hiding the frame preview', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const projectScript = {
      version: 1, title: 'Audio check', script: 'One shot.', canvas: { width: 1920, height: 1080 },
      shots: [{
        id: 'one', order: 1, narration: 'Hello', visual: 'Frame', transition: 'cut', assets: [],
        durationSeconds: 2, audioPath: 'audio/missing.mp3', thumbnailPath: 'frames/one.png',
      }],
    }
    renderWorkspace({
      sessionId: 'video-session', resourceStatus: 'live', resourceVersion: 'script-v1',
      readFile: async (_sessionId, path) => {
        if (path === 'audio/missing.mp3') throw new Error('missing audio')
        return file(path, path === 'script.json' ? JSON.stringify(projectScript) : 'frame bytes')
      },
    })

    expect((await screen.findByRole('alert')).textContent).toBe(en['preview.audioError'])
    expect(screen.getByRole('img', { name: 'Frame' })).toBeTruthy()
  })

  it('uses the first shot voice as default and rerenders all or one shot by voice scope', async () => {
    const projectScript = {
      version: 1, title: 'Voices', script: 'Two shots.', canvas: { width: 1920, height: 1080 },
      shots: [
        { id: 'one', order: 1, narration: 'First', visual: 'Frame one', transition: 'cut', assets: [], durationSeconds: 2, audioPath: 'audio/one.mp3', thumbnailPath: null, voice: 'Dylan' },
        { id: 'two', order: 2, narration: 'Second', visual: 'Frame two', transition: 'cut', assets: [], durationSeconds: 3, audioPath: 'audio/two.mp3', thumbnailPath: null },
      ],
    }
    const workspace = renderWorkspace({
      sessionId: 'video-session', resourceStatus: 'live', resourceVersion: 'voice-v1',
      readFile: async (_sessionId, path) => file(path, path === 'script.json' ? JSON.stringify(projectScript) : 'audio'),
    })
    const globalVoice = await screen.findByRole('combobox', { name: en['voice.global'] })
    expect((globalVoice as HTMLSelectElement).value).toBe('Dylan')
    fireEvent.change(globalVoice, { target: { value: 'Cherry' } })
    expect(workspace.sendRequest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en['voice.applyGlobal'] }))
    await waitFor(() => { expect(workspace.sendRequest).toHaveBeenCalledOnce() })
    const globalMessage = (workspace.sendRequest as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string
    expect(globalMessage).toContain('all 2 shots')
    expect(globalMessage).toContain('Cherry')
    expect(globalMessage).toContain('voice override')

    fireEvent.click(screen.getByRole('button', { name: /Frame twoShot 2/ }))
    const shotVoice = await screen.findByRole('combobox', { name: en['voice.shot'].replace('{order}', '2') })
    expect((shotVoice as HTMLSelectElement).value).toBe('')
    fireEvent.change(shotVoice, { target: { value: 'Ethan' } })
    await waitFor(() => { expect(workspace.sendRequest).toHaveBeenCalledTimes(2) })
    const shotMessage = (workspace.sendRequest as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as string
    expect(shotMessage).toContain('regenerate only this shot')
    expect(shotMessage).toContain('id: two')
    fireEvent.change(shotVoice, { target: { value: '' } })
    await waitFor(() => { expect(workspace.sendRequest).toHaveBeenCalledTimes(3) })
    const inheritMessage = (workspace.sendRequest as ReturnType<typeof vi.fn>).mock.calls[2]?.[1] as string
    expect(inheritMessage).toContain('remove the voice override')
    expect(inheritMessage).toContain('regenerate only this shot')
  })

  it('previews an unapplied global voice without submitting a Conversation request', async () => {
    const projectScript = {
      version: 1, title: 'Voice preview', script: 'One shot.', canvas: { width: 1920, height: 1080 },
      shots: [{ id: 'one', order: 1, narration: 'Hello', visual: 'Frame', transition: 'cut', assets: [], durationSeconds: 2, audioPath: 'audio/one.mp3', thumbnailPath: null, voice: 'Dylan' }],
    }
    const workspace = renderWorkspace({
      sessionId: 'video-session', resourceStatus: 'live', resourceVersion: 'voice-preview-v1',
      readFile: async (_sessionId, path) => file(path, path === 'script.json' ? JSON.stringify(projectScript) : 'audio'),
    })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ url: 'https://audio.example/voice-preview.wav' }))
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const globalVoice = await screen.findByRole('combobox', { name: en['voice.global'] })
    fireEvent.change(globalVoice, { target: { value: 'Cherry' } })
    expect(workspace.sendRequest).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: en['voice.preview'] }))
    const audio = await waitFor(() => {
      const element = workspace.view.container.querySelector(`audio[aria-label="${en['voice.previewAudio']}"]`)
      expect(element).not.toBeNull()
      return element!
    })
    expect((audio as HTMLAudioElement).src).toBe('https://audio.example/voice-preview.wav')
    expect(fetch).toHaveBeenCalledWith('/api/qwen-tts/voice-preview', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ voice: 'Cherry' }),
    }))
    expect(workspace.sendRequest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en['voice.applyGlobal'] }))
    await waitFor(() => { expect(workspace.sendRequest).toHaveBeenCalledOnce() })
  })

  it('reports missing, invalid, and unreadable scripts without hiding the conversation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const missing = renderWorkspace({ sessionId: 'video-session', resourceStatus: 'failed' })
    expect(await screen.findByText(en['preview.noScript'])).toBeTruthy()
    missing.view.unmount()
    cleanup()

    const invalid = renderWorkspace({
      sessionId: 'video-session', resourceStatus: 'live', resourceVersion: 'bad',
      readFile: async () => file('script.json', 'not json'),
    })
    expect(await screen.findByText(en['preview.invalidScript'])).toBeTruthy()
    expect(screen.getByText('Conversation messages')).toBeTruthy()
    invalid.view.unmount()
    cleanup()

    renderWorkspace({
      sessionId: 'video-session', resourceStatus: 'live', resourceVersion: 'read-error',
      readFile: async () => { throw new Error('file unavailable') },
    })
    expect(await screen.findByText(en['preview.readError'])).toBeTruthy()
    expect(screen.getByText('Conversation messages')).toBeTruthy()
  })
})

describe('video mode switch', () => {
  it('reports the current DSH selection and the video panel on toggle', () => {
    const sessionState = { current: 'video-session' as SessionId }
    const renderSwitch = (panelId: string) => {
      const switchMode = vi.fn()
      const view = render(<VideoModeSwitch {...({
        usePanelInfo: (select: (info: { activePanelId: string }) => unknown) => select({ activePanelId: panelId }),
        useSessions: (select: (state: typeof sessionState) => unknown) => select(sessionState),
        switchMode,
        t: translate,
      } as unknown as Parameters<typeof VideoModeSwitch>[0])} />)
      return { view, switchMode }
    }
    const standard = renderSwitch('conversation')
    fireEvent.click(screen.getByRole('button', { name: en['mode.open'] }))
    expect(standard.switchMode).toHaveBeenCalledWith('conversation', 'video-session')
    standard.view.unmount()
    cleanup()

    const video = renderSwitch(VIDEO_PANEL_ID)
    fireEvent.click(screen.getByRole('button', { name: en['mode.close'] }))
    expect(video.switchMode).toHaveBeenCalledWith(VIDEO_PANEL_ID, 'video-session')
    video.view.unmount()
  })
})
