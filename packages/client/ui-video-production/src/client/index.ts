/** Browser half: switch between DSH and the dedicated video-production workspace. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-agent-presets/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { en, zh } from './locales.ts'
import { VIDEO_PANEL_ID, type VideoProductionInjected } from './contract.ts'
import { VideoModeSwitch } from './VideoModeSwitch.tsx'
import { VideoWorkspace } from './VideoWorkspace.tsx'

/** Video workspace labels, shared with the top-level mode switch. */
const NS = 'videoProduction'

/** Client services required by the video project list and file preview. */
export const inject = [
  'slots', 'layout', 'sessions', 'workspaces', 'uiWorkspace', 'remote', 'remote.workspaceFiles', 'locale',
]

interface PreviousSelection {
  readonly panelId: MainPanelId | null
  readonly sessionId: SessionId | undefined
}

/** Register the video main panel and frame-wide mode switch. */
export function apply(ctx: ClientContext): void {
  let previousSelection: PreviousSelection | undefined

  const switchMode: VideoProductionInjected['switchMode'] = (panelId, sessionId) => {
    if (panelId !== VIDEO_PANEL_ID) {
      previousSelection = { panelId, sessionId }
      ctx.sessions.clear()
      ctx.layout.selectPanel(VIDEO_PANEL_ID)
      return
    }

    const restore = previousSelection
    previousSelection = undefined
    ctx.layout.selectPanel(restore?.panelId ?? null)
    if (restore?.sessionId === undefined) ctx.sessions.clear()
    else ctx.sessions.open(restore.sessionId)
  }

  const injected: VideoProductionInjected = {
    switchMode,
    selectProject: (sessionId) => { ctx.sessions.open(sessionId) },
    createProject: async (name, parentPath) => {
      const path = await ctx.uiWorkspace.createDirectory(parentPath, name)
      const workspace = await ctx.workspaces.create({ path })
      const sessionId = await ctx.sessions.create({
        workspaceId: workspace.workspaceId,
        agentPreset: 'video-production',
      })
      ctx.sessions.open(sessionId)
    },
    createConversation: async (workspaceId) => {
      const sessionId = await ctx.sessions.create({ workspaceId, agentPreset: 'video-production' })
      ctx.sessions.open(sessionId)
    },
    readFile: async (sessionId, path, signal): Promise<WorkspaceFileBytes> => {
      const result = await ctx.remote.workspaceFiles.readAll(sessionId, path, signal)
      if (!result.ok) throw new Error(`workspace file read failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
    sendRequest: async (sessionId, text) => {
      const scope = ctx.sessions.scope(sessionId)
      const conversation = scope?.get('conversation')
      if (conversation === undefined) throw new Error('video production Conversation is unavailable for this Session')
      await conversation.send(text)
    },
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-video-production: dictionaries')
  ctx.effect(() => ctx.slots.inject('main', function* () {
    yield ctx.slots.register({
      name: 'main',
      key: VIDEO_PANEL_ID,
      locale: NS,
      children: {
        'conversation.embed': { kind: 'single', scope: 'session-maybe' },
        'video.project.directoryFlow': { kind: 'single', scope: 'root' },
      },
      inject: () => injected,
    }, VideoWorkspace)
    yield ctx.slots.register({
      name: 'shell.overlay',
      id: 'video-production-mode',
      order: 80,
      locale: NS,
      inject: () => injected,
    }, VideoModeSwitch)
  }), 'ui-video-production: workspace and mode switch')
  ctx.effect(() => ctx.slots.inject('video.project.directoryFlow', () => ctx.slots.register({
    name: 'video.project.directoryFlow',
    mirrorOf: 'conversation.hero.workspace.directoryFlow',
  })), 'ui-video-production: project directory chooser')
}
