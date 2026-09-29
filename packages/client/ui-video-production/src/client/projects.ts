import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {} from '@deepseek-ai/dsh-agent-presets/types'

/** One Workspace with its video-preset Session history. */
export interface VideoProject {
  readonly workspaceId: WorkspaceId
  readonly path: string
  readonly title: string
  readonly sessionId: SessionId
  readonly updatedAt: number
  readonly conversations: readonly VideoConversation[]
}

/** One video-preset Session in a project's conversation history. */
export interface VideoConversation {
  readonly sessionId: SessionId
  readonly title: string
  readonly updatedAt: number
}

/**
 * Project history is the Workspace/session roster, not a second file index.
 * @param workspaces - available Workspaces.
 * @param sessions - Session summaries indexed by id.
 * @returns projects with video-preset conversations, newest first.
 */
export function videoProjects(
  workspaces: readonly WorkspaceView[],
  sessions: Readonly<Record<SessionId, SessionSummary>>,
): VideoProject[] {
  return workspaces.flatMap((workspace) => {
    const conversations = workspace.sessionIds
      .map(id => sessions[id])
      .filter((session): session is SessionSummary =>
        session?.projectionValues?.agentPreset === 'video-production',
      )
      .map(session => ({
        sessionId: session.id,
        title: session.displayTitle,
        updatedAt: session.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const newest = conversations[0]
    return newest === undefined ? [] : [{
      workspaceId: workspace.workspaceId,
      path: workspace.path,
      title: workspace.title,
      sessionId: newest.sessionId,
      updatedAt: newest.updatedAt,
      conversations,
    }]
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}
