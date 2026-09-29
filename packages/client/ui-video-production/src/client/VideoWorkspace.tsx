/** Three-column video workspace over the existing Session and Conversation models. */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { VIDEO_PANEL_ID } from './contract.ts'
import type { VideoProductionInjected } from './contract.ts'
import { isWorkspaceRelativePath, parseVideoScript } from './script.ts'
import type { VideoScript, VideoShot } from './script.ts'
import { videoProjects } from './projects.ts'
import css from './VideoWorkspace.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Video production workspace and project timeline copy. */
    videoProduction: import('./locales.ts').VideoProductionKey
  }
}

type Props =
  & PropsRuntime<'main'>
  & PropsRenderSlots<'conversation.embed' | 'video.project.directoryFlow'>
  & InjectFace<VideoProductionInjected>
  & PropsLocale<'videoProduction'>

interface ScriptState {
  readonly sessionId: SessionId
  readonly status: 'loading' | 'waiting' | 'ready' | 'read-error' | 'invalid'
  readonly script?: VideoScript
}

interface AudioState {
  readonly sessionId: SessionId
  readonly path: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly url?: string
}

type DynamicPreviewState =
  | { readonly sessionId: SessionId; readonly status: 'starting' | 'error' }
  | { readonly sessionId: SessionId; readonly status: 'ready'; readonly url: string }

interface ShotPlayback {
  readonly start: number
  readonly end: number
  readonly autoplay: boolean
}

const EMPTY_SHOTS: readonly VideoShot[] = []
const QWEN_VOICES = [
  'Cherry', 'Nofish', 'Elias', 'Ethan', 'Ryan', 'Jennifer', 'Katerina', 'Dylan', 'Jada',
  'Li', 'Sunny', 'Eric', 'Marcus', 'Roy', 'Peter', 'Rocky', 'Kiki',
] as const

/** Render the project browser, selected-frame preview, timeline, and DSH Agent. */
export function VideoWorkspace({
  useSessions,
  useWorkspaces,
  useResource,
  renderSlot,
  createProject,
  createConversation,
  readFile,
  sendRequest,
  selectProject,
  switchMode,
  t,
}: Props) {
  const sessionState = useSessions(state => state)
  const workspaceState = useWorkspaces(state => state)
  const currentSessionId = sessionState.current
  const currentSession = currentSessionId === undefined ? undefined : sessionState.byId[currentSessionId]
  const projects = useMemo(
    () => videoProjects(workspaceState.items, sessionState.byId),
    [workspaceState.items, sessionState.byId],
  )
  const resourceAddress = currentSessionId === undefined
    ? ''
    : `dsh-resource://file/session/${currentSessionId}/script.json`
  const scriptResource = useResource<'file'>(resourceAddress)
  const resourceVersion = scriptResource.value?.version
  const [scriptState, setScriptState] = useState<ScriptState | undefined>()
  const [selectedShotId, setSelectedShotId] = useState<string | undefined>()
  const [showAllShots, setShowAllShots] = useState(false)
  const [thumbnails, setThumbnails] = useState<Readonly<Record<string, string>>>({})
  const [audioState, setAudioState] = useState<AudioState | undefined>()
  const [previewState, setPreviewState] = useState<DynamicPreviewState>()
  const [shotPlayback, setShotPlayback] = useState<ShotPlayback | undefined>()
  const shotPlaybackRef = useRef<ShotPlayback | undefined>()
  const previewHost = useRef<HTMLDivElement>(null)
  const previewFrame = useRef<HTMLDivElement>(null)
  const previewPlayer = useRef<(HTMLElement & { seek: (time: number) => void; play: () => void; pause: () => void }) | null>(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const audioPreview = useRef<HTMLAudioElement>(null)
  const [projectName, setProjectName] = useState('')
  const [pendingProjectName, setPendingProjectName] = useState<string | undefined>()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [conversationError, setConversationError] = useState(false)
  const [voiceRequest, setVoiceRequest] = useState(false)
  const [voiceError, setVoiceError] = useState(false)
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false)
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string>()
  const [voicePreviewError, setVoicePreviewError] = useState(false)
  const voicePreviewController = useRef<AbortController | undefined>(undefined)
  const [requestedGlobalVoice, setRequestedGlobalVoice] = useState<string>()
  const [requestedShotVoices, setRequestedShotVoices] = useState<Readonly<Record<string, string>>>({})

  useEffect(() => {
    setSelectedShotId(undefined)
    setShowAllShots(false)
    setThumbnails({})
    if (currentSessionId === undefined) {
      setScriptState(undefined)
      return
    }
    if (scriptResource.status !== 'live' || resourceVersion === undefined) {
      setScriptState({
        sessionId: currentSessionId,
        status: scriptResource.status === 'failed' ? 'waiting' : 'loading',
      })
      return
    }
    const controller = new AbortController()
    setScriptState({ sessionId: currentSessionId, status: 'loading' })
    void readFile(currentSessionId, 'script.json', controller.signal).then((file) => {
      if (file.offset !== 0 || !file.eof) throw new Error('script.json was not returned as a complete file')
      let value: unknown
      try {
        value = JSON.parse(decodeUtf8(file.data)) as unknown
      } catch (reason: unknown) {
        throw new InvalidScriptError(String(reason))
      }
      const script = parseVideoScript(value)
      if (script === undefined) throw new InvalidScriptError('script.json has an unsupported video project format')
      if (!controller.signal.aborted) setScriptState({ sessionId: currentSessionId, status: 'ready', script })
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      console.warn('video production script read failed:', reason)
      setScriptState({
        sessionId: currentSessionId,
        status: reason instanceof InvalidScriptError ? 'invalid' : 'read-error',
      })
    })
    return () => { controller.abort() }
  }, [currentSessionId, readFile, resourceVersion, scriptResource.status])

  const script = scriptState !== undefined
    && scriptState.sessionId === currentSessionId && scriptState.status === 'ready'
    ? scriptState.script
    : undefined
  const shots = script?.shots ?? EMPTY_SHOTS
  const selectedShot = shots.find(shot => shot.id === selectedShotId) ?? shots[0]
  const globalVoice = requestedGlobalVoice ?? script?.voice ?? shots[0]?.voice ?? 'Cherry'
  const [candidateGlobalVoice, setCandidateGlobalVoice] = useState<string>()
  const selectedGlobalVoice = candidateGlobalVoice ?? globalVoice
  const selectedVoice = selectedShot === undefined
    ? globalVoice
    : requestedShotVoices[selectedShot.id] === undefined
      ? selectedShot.voice ?? globalVoice
      : requestedShotVoices[selectedShot.id] || globalVoice
  const shotTimings = useMemo(() => {
    const timings = new Map<string, { readonly start: number; readonly end: number }>()
    let start = 0
    for (const shot of shots) {
      if (shot.durationSeconds === null) break
      const end = start + shot.durationSeconds
      timings.set(shot.id, { start, end })
      start = end
    }
    return timings
  }, [shots])
  const selectedShotTime = selectedShot === undefined ? 0 : shotTimings.get(selectedShot.id)?.start ?? 0

  useEffect(() => {
    setRequestedGlobalVoice(undefined)
    setCandidateGlobalVoice(undefined)
    setRequestedShotVoices({})
    setVoiceError(false)
    setVoicePreviewUrl(undefined)
    setVoicePreviewError(false)
    voicePreviewController.current?.abort()
    voicePreviewController.current = undefined
    setVoicePreviewLoading(false)
  }, [currentSessionId])

  useEffect(() => () => {
    voicePreviewController.current?.abort()
    voicePreviewController.current = undefined
  }, [])

  const previewGlobalVoice = async (): Promise<void> => {
    voicePreviewController.current?.abort()
    const controller = new AbortController()
    voicePreviewController.current = controller
    setVoicePreviewLoading(true)
    setVoicePreviewError(false)
    setVoicePreviewUrl(undefined)
    try {
      const response = await fetch('/api/qwen-tts/voice-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voice: selectedGlobalVoice }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Voice preview failed (HTTP ${response.status})`)
      const result: unknown = await response.json()
      if (typeof result !== 'object' || result === null || !('url' in result) || typeof result.url !== 'string') {
        throw new Error('Voice preview returned an invalid audio URL')
      }
      const url = new URL(result.url)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Voice preview returned an unsupported audio URL')
      if (!controller.signal.aborted) {
        audioPreview.current?.pause()
        previewPlayer.current?.pause()
        setVoicePreviewUrl(url.href)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('video production voice preview failed:', error)
        setVoicePreviewError(true)
      }
    } finally {
      if (voicePreviewController.current === controller) {
        voicePreviewController.current = undefined
        setVoicePreviewLoading(false)
      }
    }
  }

  useEffect(() => {
    const syncFullscreen = (): void => {
      setFullscreen(document.fullscreenElement === previewFrame.current)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => { document.removeEventListener('fullscreenchange', syncFullscreen) }
  }, [])

  useEffect(() => {
    setPreviewState(undefined)
    setPlayerReady(false)
    setShotPlayback(undefined)
    shotPlaybackRef.current = undefined
    if (currentSessionId === undefined) return
    const sessionId = currentSessionId
    return () => {
      void fetch(`/api/video-preview/${encodeURIComponent(sessionId)}`, { method: 'DELETE', keepalive: true }).catch(() => undefined)
    }
  }, [currentSessionId])

  useEffect(() => {
    const preview = previewState?.status === 'ready' && previewState.sessionId === currentSessionId
      ? { sessionId: previewState.sessionId, url: previewState.url }
      : undefined
    const host = previewHost.current
    if (preview === undefined || host === null) return
    let player: (HTMLElement & {
      seek: (time: number) => void
      play: () => void
      pause: () => void
      controls: boolean
      muted: boolean
    }) | undefined
    let disposed = false
    const onReady = (): void => {
      setPlayerReady(true)
      player?.seek(selectedShotTime)
    }
    void loadHyperframesPlayer().then(() => {
      if (disposed) return
      player = document.createElement('hyperframes-player') as HTMLElement & { seek: (time: number) => void; play: () => void; pause: () => void; controls: boolean; muted: boolean }
      player.className = css.dynamicPlayer ?? ''
      player.controls = true
      player.muted = false
      player.setAttribute('controls', '')
      player.setAttribute('src', `${preview.url}/composition/index.html`)
      player.addEventListener('ready', onReady)
      previewPlayer.current = player
      host.replaceChildren(player)
    }).catch((reason: unknown) => {
      console.warn('HyperFrames player script failed to load:', reason)
      setPreviewState({ sessionId: preview.sessionId, status: 'error' })
    })
    return () => {
      disposed = true
      if (player !== undefined) {
        player.removeEventListener('ready', onReady)
        player.remove()
      }
      if (previewPlayer.current === player) previewPlayer.current = null
      setPlayerReady(false)
    }
  }, [currentSessionId, previewState?.sessionId, previewState?.status, previewState?.status === 'ready' ? previewState.url : undefined])

  useEffect(() => {
    if (playerReady && shotPlaybackRef.current === undefined) previewPlayer.current?.seek(selectedShotTime)
  }, [playerReady, selectedShotTime])

  useEffect(() => {
    if (!playerReady || shotPlayback === undefined || shotPlayback.autoplay) return
    previewPlayer.current?.seek(shotPlayback.start)
  }, [playerReady, shotPlayback])

  useEffect(() => {
    const player = previewPlayer.current
    if (!playerReady || player === null || shotPlayback === undefined) return
    const onTimeUpdate = (event: Event): void => {
      const playback = shotPlaybackRef.current
      if (playback === undefined) return
      const currentTime = (event as CustomEvent<{ readonly currentTime: number }>).detail.currentTime
      if (currentTime < playback.end) return
      shotPlaybackRef.current = undefined
      player.pause()
      player.seek(playback.end)
      setShotPlayback(undefined)
    }
    player.addEventListener('timeupdate', onTimeUpdate)
    return () => { player.removeEventListener('timeupdate', onTimeUpdate) }
  }, [playerReady, shotPlayback])

  const previewShot = (shot: VideoShot): void => {
    const timing = shotTimings.get(shot.id)
    if (timing === undefined) return
    setSelectedShotId(shot.id)
    if (playerReady && previewPlayer.current !== null) {
      const playback = { ...timing, autoplay: true }
      shotPlaybackRef.current = playback
      setShotPlayback(playback)
      audioPreview.current?.pause()
      previewPlayer.current.seek(timing.start)
      previewPlayer.current.play()
      return
    }
    const playback = { ...timing, autoplay: false }
    shotPlaybackRef.current = playback
    setShotPlayback(playback)
    if (currentSessionId !== undefined && previewState?.status !== 'ready') void startDynamicPreview()
  }

  const selectShot = (id: string): void => {
    shotPlaybackRef.current = undefined
    setShotPlayback(undefined)
    setSelectedShotId(id)
  }

  const toggleAllShots = (): void => {
    if (!showAllShots) previewPlayer.current?.pause()
    setShowAllShots(value => !value)
  }

  const startDynamicPreview = async (): Promise<void> => {
    if (currentSessionId === undefined || previewState?.status === 'starting') return
    const sessionId = currentSessionId
    setPreviewState({ sessionId, status: 'starting' })
    try {
      const response = await fetch(`/api/video-preview/${encodeURIComponent(sessionId)}`, { method: 'POST' })
      if (!response.ok) throw new Error(`preview endpoint returned ${response.status}`)
      const result = await response.json() as { sessionId?: unknown; url?: unknown }
      if (result.sessionId !== sessionId || typeof result.url !== 'string') throw new Error('preview response was invalid')
      const url = new URL(result.url)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('preview URL was not local')
      setPreviewState({ sessionId, status: 'ready', url: url.origin })
    } catch (reason: unknown) {
      console.warn('video production dynamic preview failed:', reason)
      setPreviewState({ sessionId, status: 'error' })
    }
  }

  const stopDynamicPreview = async (): Promise<void> => {
    if (currentSessionId === undefined || previewState?.sessionId !== currentSessionId || previewState.status !== 'ready') return
    const sessionId = currentSessionId
    try {
      await fetch(`/api/video-preview/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      setPreviewState(undefined)
    } catch (reason: unknown) {
      console.warn('video production dynamic preview stop failed:', reason)
      setPreviewState({ sessionId, status: 'error' })
    }
  }

  const toggleFullscreen = async (): Promise<void> => {
    const frame = previewFrame.current
    if (frame === null) return
    setFullscreenError(false)
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen()
      else await frame.requestFullscreen()
    } catch (reason: unknown) {
      console.warn('video production fullscreen toggle failed:', reason)
      setFullscreenError(true)
    }
  }

  useEffect(() => {
    const path = selectedShot?.audioPath
    if (currentSessionId === undefined || path === undefined || path === null) {
      setAudioState(undefined)
      return
    }
    const controller = new AbortController()
    setAudioState({ sessionId: currentSessionId, path, status: 'loading' })
    void readFile(currentSessionId, path, controller.signal).then((file) => {
      if (file.offset !== 0 || !file.eof) throw new Error('audio was not returned as a complete file')
      if (!controller.signal.aborted) {
        setAudioState({ sessionId: currentSessionId, path, status: 'ready', url: audioDataUrl(path, file) })
      }
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      console.warn('video production audio read failed:', reason)
      setAudioState({ sessionId: currentSessionId, path, status: 'error' })
    })
    return () => { controller.abort() }
  }, [currentSessionId, readFile, selectedShot?.audioPath])

  const selectedAudio = audioState !== undefined && audioState.sessionId === currentSessionId
    && audioState.path === selectedShot?.audioPath ? audioState : undefined

  useEffect(() => {
    if (currentSessionId === undefined || shots.length === 0) {
      setThumbnails({})
      return
    }
    const controller = new AbortController()
    const reads = shots.flatMap((shot) => {
      const path = shot.thumbnailPath
      return path === null || !isWorkspaceRelativePath(path)
        ? []
        : [readFile(currentSessionId, path, controller.signal).then(file => [shot.id, imageDataUrl(path, file)] as const)]
    })
    void Promise.all(reads).then((values) => {
      if (!controller.signal.aborted) setThumbnails(Object.fromEntries(values))
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      console.warn('video production thumbnail read failed:', reason)
      setThumbnails({})
    })
    return () => { controller.abort() }
  }, [currentSessionId, readFile, shots])

  const submitProject = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const name = projectName.trim()
    if (name === '' || creating || pendingProjectName !== undefined) return
    setPendingProjectName(name)
    setCreateError(false)
  }

  const createInDirectory = async (parentPath: string): Promise<void> => {
    const name = pendingProjectName
    if (name === undefined || creating) return
    setCreating(true)
    setCreateError(false)
    try {
      await createProject(name, parentPath)
      setProjectName('')
      setPendingProjectName(undefined)
    } catch (reason: unknown) {
      console.warn('video production project creation failed:', reason)
      setCreateError(true)
    } finally {
      setCreating(false)
    }
  }

  const shotWeights = timelineWeights(shots)
  const selectedProject = projects.find(project =>
    project.conversations.some(conversation => conversation.sessionId === currentSessionId))

  const startConversation = async (): Promise<void> => {
    if (selectedProject === undefined || creatingConversation) return
    setCreatingConversation(true)
    setConversationError(false)
    try {
      await createConversation(selectedProject.workspaceId)
    } catch (reason: unknown) {
      console.warn('video production conversation creation failed:', reason)
      setConversationError(true)
    } finally {
      setCreatingConversation(false)
    }
  }

  const requestVoice = async (voice: string, shot?: VideoShot, inherit = false): Promise<void> => {
    if (currentSessionId === undefined || voiceRequest) return
    setVoiceRequest(true)
    setVoiceError(false)
    if (shot === undefined) {
      voicePreviewController.current?.abort()
      voicePreviewController.current = undefined
      setVoicePreviewLoading(false)
      setRequestedGlobalVoice(voice)
      setCandidateGlobalVoice(undefined)
      setRequestedShotVoices(Object.fromEntries(shots.map(item => [item.id, ''])))
      setVoicePreviewUrl(undefined)
      setVoicePreviewError(false)
    }
    else setRequestedShotVoices(current => ({ ...current, [shot.id]: inherit ? '' : voice }))
    const message = shot === undefined
      ? t('voice.globalRequest', { voice, count: shots.length })
      : inherit
        ? t('voice.inheritRequest', { voice, order: shot.order, id: shot.id })
        : t('voice.shotRequest', { voice, order: shot.order, id: shot.id })
    try {
      await sendRequest(currentSessionId, message)
    } catch (reason: unknown) {
      console.warn('video production voice request failed:', reason)
      setVoiceError(true)
      if (shot === undefined) {
        setRequestedGlobalVoice(undefined)
        setRequestedShotVoices({})
      }
      else setRequestedShotVoices(current => Object.fromEntries(
        Object.entries(current).filter(([id]) => id !== shot.id),
      ))
    } finally {
      setVoiceRequest(false)
    }
  }

  const selectConversationWorkspace = async (workspaceId: WorkspaceId): Promise<void> => {
    const project = projects.find(candidate => candidate.workspaceId === workspaceId)
    if (project !== undefined) {
      selectProject(project.sessionId)
      return
    }
    await createConversation(workspaceId)
  }

  return (
    <div className={css.workspace}>
      <aside className={css.projects} aria-label={t('project.heading')}>
        <header className={css.projectHeader}>
          <div className={css.brandMark} aria-hidden="true">{t('workspace.brand')}</div>
          <h1>{t('workspace.title')}</h1>
          <Button variant="ghost" size="sm" onClick={() => { switchMode(VIDEO_PANEL_ID, currentSessionId) }}>
            {t('mode.close')}
          </Button>
        </header>
        <div className={css.projectSectionTitle}>{t('project.heading')}</div>
        <form className={css.createForm} onSubmit={submitProject}>
          <Input
            aria-label={t('project.name')}
            placeholder={t('project.namePlaceholder')}
            value={projectName}
            disabled={creating}
            onChange={(event) => { setProjectName(event.currentTarget.value); setCreateError(false) }}
          />
          <Button variant="primary" size="sm" type="submit" disabled={creating || projectName.trim() === ''}>
            {creating ? t('project.creating') : t('project.create')}
          </Button>
        </form>
        {pendingProjectName !== undefined && <p className={css.projectHint}>{t('project.chooseParent')}</p>}
        {createError && <p className={css.error} role="alert">{t('project.createError')}</p>}
        <div className={css.projectList}>
          {projects.length === 0
            ? <p className={css.emptyProjects}>{t('project.empty')}</p>
            : projects.map(project => <div key={project.workspaceId}>
              <button
                type="button"
                className={css.projectRow}
                data-active={project === selectedProject || undefined}
                onClick={() => { selectProject(project.sessionId) }}
              >
                <span className={css.projectGlyph} aria-hidden="true">▶</span>
                <span className={css.projectName}>{project.title}</span>
              </button>
              {project === selectedProject && <div className={css.conversationList}>
                {project.conversations.map(conversation => <button
                  key={conversation.sessionId}
                  type="button"
                  className={css.conversationRow}
                  aria-current={conversation.sessionId === currentSessionId ? 'page' : undefined}
                  onClick={() => { selectProject(conversation.sessionId) }}
                >{conversation.title}</button>)}
              </div>}
            </div>)}
        </div>
        {renderSlot('video.project.directoryFlow', {
          open: pendingProjectName !== undefined,
          busy: creating,
          onPicked: (path) => { void createInDirectory(path) },
          onCancel: () => { setPendingProjectName(undefined) },
          onError: (message) => {
            console.warn('video production directory picker failed:', message)
            setCreateError(true)
            setPendingProjectName(undefined)
          },
        })}
      </aside>

      <main className={css.center}>
        <header className={css.centerHeader}>
          <div>
            <span className={css.eyebrow}>{t('preview.heading')}</span>
            <h2>{script?.title ?? selectedProject?.title ?? currentSession?.displayTitle ?? t('preview.heading')}</h2>
          </div>
          <div className={css.canvasInfo}>
            {script !== undefined && <>
              <label className={css.voiceControl}>
                <span>{t('voice.global')}</span>
                <select aria-label={t('voice.global')} value={selectedGlobalVoice} disabled={voiceRequest || shots.length === 0}
                  onChange={(event) => { setCandidateGlobalVoice(event.currentTarget.value) }}>
                  {QWEN_VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}
                </select>
              </label>
              <button type="button" className={css.storyboardToggle}
                onClick={() => { void requestVoice(selectedGlobalVoice) }}
                disabled={voiceRequest || shots.length === 0 || selectedGlobalVoice === globalVoice}>
                {t('voice.applyGlobal')}
              </button>
              <button type="button" className={css.storyboardToggle} onClick={() => { void previewGlobalVoice() }}
                disabled={voicePreviewLoading || voiceRequest || shots.length === 0}>
                {voicePreviewLoading ? t('voice.previewLoading') : t('voice.preview')}
              </button>
              {voicePreviewUrl !== undefined && <audio
                className={css.voicePreviewAudio}
                controls
                autoPlay
                preload="none"
                aria-label={t('voice.previewAudio')}
                src={voicePreviewUrl}
                onPlay={() => {
                  audioPreview.current?.pause()
                  previewPlayer.current?.pause()
                }}
                onError={() => { setVoicePreviewError(true) }}
              />}
              {voicePreviewError && <span className={css.voicePreviewError} role="alert">{t('voice.previewError')}</span>}
            </>}
            {script === undefined ? '—' : `${script.canvas.width} × ${script.canvas.height}`}
            {script !== undefined && shots.length > 0 && <button
              type="button"
              className={css.storyboardToggle}
              aria-pressed={showAllShots}
              onClick={toggleAllShots}
            >{showAllShots ? t('preview.showSelectedShot') : t('preview.showAllShots')}</button>}
          </div>
        </header>
        <section className={css.previewStage} aria-label={t('preview.heading')}>
          <div className={css.previewFrame} ref={previewFrame}>
            <div className={`${css.previewContent} ${showAllShots ? css.previewContentHidden : ''}`} aria-hidden={showAllShots || undefined}>
              {selectedShot === undefined
                ? <p className={css.previewMessage}>{previewMessage(t, currentSessionId, scriptState)}</p>
                : <>
                  {previewState !== undefined && previewState.sessionId === currentSessionId && previewState.status === 'ready'
                    ? <div className={css.dynamicPreview} ref={previewHost} />
                    : <>
                      {thumbnails[selectedShot.id] === undefined
                        ? <div className={css.previewPlaceholder}>
                          <span className={css.previewNumber}>{String(selectedShot.order).padStart(2, '0')}</span>
                          <p>{displayText(selectedShot.visual) || t('preview.noThumbnail')}</p>
                        </div>
                        : <img className={css.previewImage} src={thumbnails[selectedShot.id]} alt={displayText(selectedShot.visual)} />}
                      <div className={css.previewCaption}>
                        <span>{t('timeline.shot', { order: selectedShot.order })}</span>
                        <span>{formatDuration(selectedShot.durationSeconds, t)}</span>
                      </div>
                    </>}
                </>}
            </div>
            {showAllShots && script !== undefined && <div className={css.storyboardPreview} role="region" aria-label={t('preview.allShotContent')}>
              {shots.map(shot => <article key={shot.id} className={css.storyboardShot}>
                <div className={css.storyboardThumbnail}>
                  {thumbnails[shot.id] === undefined
                    ? <span>{displayText(shot.visual) || t('preview.noShotText')}</span>
                    : <img src={thumbnails[shot.id]} alt="" />}
                </div>
                <div className={css.storyboardCopy}>
                  <header className={css.storyboardShotHeader}>
                    <h3>{t('timeline.shot', { order: shot.order })}</h3>
                    <span>{formatDuration(shot.durationSeconds, t)}</span>
                  </header>
                  <div className={css.storyboardField}>
                    <span>{t('timeline.subtitle')}</span>
                    <p>{shot.narration || t('preview.noShotText')}</p>
                  </div>
                  <div className={css.storyboardField}>
                    <span>{t('timeline.visual')}</span>
                    <p>{displayText(shot.visual) || t('preview.noShotText')}</p>
                  </div>
                </div>
              </article>)}
            </div>}
            {previewState !== undefined && previewState.sessionId === currentSessionId && previewState.status === 'ready' && <Button
              variant="ghost"
              size="sm"
              className={css.fullscreenButton}
              aria-label={fullscreen ? t('preview.fullscreenExit') : t('preview.fullscreenStart')}
              aria-pressed={fullscreen}
              onClick={() => { void toggleFullscreen() }}
            >{fullscreen ? t('preview.fullscreenExit') : t('preview.fullscreenStart')}</Button>}
          </div>
          {script !== undefined && currentSessionId !== undefined && previewState?.status !== 'ready' && <Button
            variant="ghost"
            size="sm"
            disabled={previewState?.status === 'starting'}
            onClick={() => { void startDynamicPreview() }}
          >{previewState?.status === 'starting' ? t('preview.playerStarting') : t('preview.playerStart')}</Button>}
          {previewState !== undefined && previewState.sessionId === currentSessionId && previewState.status === 'ready' && <Button
            variant="ghost"
            size="sm"
            onClick={() => { void stopDynamicPreview() }}
          >{t('preview.playerStop')}</Button>}
          {previewState !== undefined && previewState.sessionId === currentSessionId && previewState.status === 'error' && <p className={css.error} role="alert">{t('preview.playerError')}</p>}
          {fullscreenError && <p className={css.fullscreenError} role="alert">{t('preview.fullscreenError')}</p>}
          {selectedShot?.audioPath !== null && selectedShot?.audioPath !== undefined && <div className={css.audioPreview}>
            <span>{t('preview.audioLabel', { order: selectedShot.order })}</span>
            {selectedAudio?.status === 'ready'
              ? <audio
                key={`${currentSessionId}:${selectedShot.id}`}
                ref={audioPreview}
                controls
                preload="metadata"
                src={selectedAudio.url}
                aria-label={t('preview.audioLabel', { order: selectedShot.order })}
                onPlay={() => { previewPlayer.current?.pause() }}
                onError={() => {
                  setAudioState(current => current !== undefined
                    && current.sessionId === currentSessionId
                    && current.path === selectedShot.audioPath
                    ? { ...current, status: 'error' }
                    : current)
                }}
              />
              : <span role={selectedAudio?.status === 'error' ? 'alert' : undefined}>
                {selectedAudio?.status === 'error' ? t('preview.audioError') : t('preview.audioLoading')}
              </span>}
          </div>}
          {selectedShot !== undefined && <label className={css.shotVoiceControl}>
            <span>{t('voice.shot', { order: selectedShot.order })}</span>
            <select aria-label={t('voice.shot', { order: selectedShot.order })} value={requestedShotVoices[selectedShot.id] ?? selectedShot.voice ?? ''} disabled={voiceRequest}
              onChange={(event) => {
                const voice = event.currentTarget.value
                void requestVoice(voice || globalVoice, selectedShot, voice === '')
              }}>
              <option value="">{t('voice.inherit', { voice: globalVoice })}</option>
              {QWEN_VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}
            </select>
            <Button variant="ghost" size="sm" disabled={voiceRequest} onClick={() => { void requestVoice(selectedVoice, selectedShot) }}>
              {t('voice.regenerate', { voice: selectedVoice })}
            </Button>
          </label>}
          {voiceError && <p className={css.error} role="alert">{t('voice.error')}</p>}
        </section>
        <section className={css.timeline} aria-label={t('timeline.heading')}>
          <header className={css.timelineHeader}>
            <h2>{t('timeline.heading')}</h2>
            <span>{shots.length}</span>
          </header>
          <Track label={t('timeline.subtitle')} className={css.subtitleTrack} shots={shots} weights={shotWeights} onSelect={selectShot} shotLabel={shot => shotLabel(shot, t)}>
            {shot => <span className={css.clipText}>{shot.narration}</span>}
          </Track>
          <Track
            label={t('timeline.visual')}
            className={css.visualTrack}
            shots={shots}
            weights={shotWeights}
            onSelect={selectShot}
            onPreview={previewShot}
            previewLabel={shot => t('timeline.previewShot', { order: shot.order })}
            previewDisabled={shot => !shotTimings.has(shot.id)}
            shotLabel={shot => shotLabel(shot, t)}
          >
            {shot => thumbnails[shot.id] === undefined
              ? <span className={css.visualText}>{displayText(shot.visual)}</span>
              : <img className={css.clipImage} src={thumbnails[shot.id]} alt="" />}
          </Track>
          <Track label={t('timeline.audio')} className={css.audioTrack} shots={shots} weights={shotWeights} onSelect={selectShot} shotLabel={shot => shotLabel(shot, t)}>
            {shot => <AudioClip shot={shot} label={t('timeline.noAudio')} duration={formatDuration(shot.durationSeconds, t)} />}
          </Track>
        </section>
      </main>

      <aside className={css.agent} aria-label={t('chat.heading')}>
        <header className={css.agentHeader}>
          <span className={css.agentDot} />{t('chat.heading')}
          <Button variant="ghost" size="sm" className={css.newConversation} disabled={selectedProject === undefined || creatingConversation} onClick={() => { void startConversation() }}>
            {t('chat.newConversation')}
          </Button>
        </header>
        {conversationError && <p className={css.error} role="alert">{t('chat.createError')}</p>}
        <div className={css.chatContent}>
          {renderSlot('conversation.embed', { onSelectWorkspace: selectConversationWorkspace })}
        </div>
      </aside>
    </div>
  )
}

interface TrackProps {
  readonly label: string
  readonly className: string | undefined
  readonly shots: readonly VideoShot[]
  readonly weights: readonly number[]
  readonly onSelect: (id: string) => void
  readonly onPreview?: (shot: VideoShot) => void
  readonly previewLabel?: (shot: VideoShot) => string
  readonly previewDisabled?: (shot: VideoShot) => boolean
  readonly shotLabel: (shot: VideoShot) => string
  readonly children: (shot: VideoShot) => ReactNode
}

function Track({ label, className, shots, weights, onSelect, onPreview, previewLabel, previewDisabled, shotLabel, children }: TrackProps) {
  return (
    <div className={`${css.track} ${className ?? ''}`}>
      <div className={css.trackLabel}>{label}</div>
      <div className={css.clipRail}>
        {shots.length === 0
          ? <div className={css.emptyClipRail} />
          : <div className={css.clipGrid} style={{
            gridTemplateColumns: weights.map(weight => `minmax(140px, ${weight}fr)`).join(' '),
          }}>
            {shots.map(shot => (
              <div key={shot.id} className={css.clipCell}>
                <button type="button" className={css.clip} onClick={() => { onSelect(shot.id) }}>
                  <span className={css.clipContent}>{children(shot)}</span>
                  <span className={css.clipMeta}>{shotLabel(shot)}</span>
                </button>
                {onPreview !== undefined && previewLabel !== undefined && <button
                  type="button"
                  className={css.shotPreview}
                  aria-label={previewLabel(shot)}
                  title={previewLabel(shot)}
                  disabled={previewDisabled?.(shot) ?? false}
                  onClick={() => { onPreview(shot) }}
                >▶</button>}
              </div>
            ))}
          </div>}
      </div>
    </div>
  )
}

function AudioClip({ shot, label, duration }: { shot: VideoShot; label: string; duration: string }) {
  return (
    <span className={css.audioClip}>
      <span className={css.waveform} aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ height: `${waveHeight(shot.id, index)}%` }} />)}
      </span>
      <span className={css.audioName}>{shot.audioPath === null ? label : basename(shot.audioPath)}</span>
      <span className={css.duration}>{duration}</span>
    </span>
  )
}

function previewMessage(
  t: PropsLocale<'videoProduction'>['t'],
  sessionId: SessionId | undefined,
  state: ScriptState | undefined,
): string {
  if (sessionId === undefined) return t('preview.noProject')
  if (state?.sessionId !== sessionId || state.status === 'loading') return t('preview.loading')
  if (state.status === 'waiting') return t('preview.noScript')
  if (state.status === 'read-error') return t('preview.readError')
  if (state.status === 'invalid') return t('preview.invalidScript')
  return t('preview.noShots')
}

function decodeUtf8(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function imageDataUrl(path: string, file: WorkspaceFileBytes): string {
  const extension = path.split('.').at(-1)?.toLowerCase()
  const mime = extension === 'webp' ? 'image/webp'
    : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
      : 'image/png'
  return `data:${mime};base64,${file.data}`
}

function audioDataUrl(path: string, file: WorkspaceFileBytes): string {
  const extension = path.split('.').at(-1)?.toLowerCase()
  const mime = extension === 'mp3' ? 'audio/mpeg'
    : extension === 'wav' ? 'audio/wav'
      : extension === 'm4a' ? 'audio/mp4'
        : extension === 'ogg' ? 'audio/ogg'
          : extension === 'aac' ? 'audio/aac'
            : extension === 'flac' ? 'audio/flac'
              : 'application/octet-stream'
  return `data:${mime};base64,${file.data}`
}

function displayText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  return JSON.stringify(value)
}

function timelineWeights(shots: readonly VideoShot[]): number[] {
  if (shots.length === 0) return []
  const durations = shots.map(shot => shot.durationSeconds)
  if (durations.some(duration => duration === null || duration <= 0)) return shots.map(() => 1)
  return durations.map(duration => duration as number)
}

function formatDuration(duration: number | null, t: PropsLocale<'videoProduction'>['t']): string {
  if (duration === null) return t('timeline.noDuration')
  return `${duration.toFixed(duration % 1 === 0 ? 0 : 1)}s`
}

function basename(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path
}

function waveHeight(id: string, index: number): number {
  let seed = index + 1
  for (const character of id) seed = (seed * 31 + character.charCodeAt(0)) >>> 0
  return 24 + seed % 68
}

function shotLabel(shot: VideoShot, t: PropsLocale<'videoProduction'>['t']): string {
  return `${t('timeline.shot', { order: shot.order })} · ${formatDuration(shot.durationSeconds, t)}`
}

let playerScript: Promise<void> | undefined

function loadHyperframesPlayer(): Promise<void> {
  if (customElements.get('hyperframes-player') !== undefined) return Promise.resolve()
  if (playerScript !== undefined) return playerScript
  playerScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/api/video-preview/player.js'
    script.async = true
    script.dataset.hyperframesPlayer = 'true'
    script.onload = () => {
      if (customElements.get('hyperframes-player') === undefined) {
        reject(new Error('HyperFrames player custom element was not registered'))
      } else resolve()
    }
    script.onerror = () => { reject(new Error('HyperFrames player script request failed')) }
    document.head.append(script)
  }).catch((reason: unknown) => {
    playerScript = undefined
    throw reason
  })
  return playerScript
}

class InvalidScriptError extends Error {}
