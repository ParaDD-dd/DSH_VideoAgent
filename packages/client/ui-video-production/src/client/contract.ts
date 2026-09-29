/** Narrow callbacks the video UI receives from its apply closure. */

import type { WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Directory chooser for the parent of a new video project. */
    'video.project.directoryFlow': { kind: 'single'; scope: 'root'; owner: DirectoryFlowOwnerProps }
  }
}

/** Main-slot identity owned by the video workspace. */
export const VIDEO_PANEL_ID = 'video-production' as MainPanelId

/** Service callbacks used by the panel and top-level mode switch. */
export interface VideoProductionInjected {
  /** Enter or leave the video panel and restore the previous DSH selection. */
  readonly switchMode: (panelId: MainPanelId | null, sessionId: SessionId | undefined) => void
  /** Select a project Session without leaving the video panel. */
  readonly selectProject: (sessionId: SessionId) => void
  /** Create a project directory under the explicitly selected parent and start its preset Session. */
  readonly createProject: (name: string, parentPath: string) => Promise<void>
  /** Start a blank preset Session in the selected project's Workspace. */
  readonly createConversation: (workspaceId: WorkspaceId) => Promise<void>
  /** Read bounded bytes from a path relative to the selected Session workspace. */
  readonly readFile: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<WorkspaceFileBytes>
  /** Submit a logged instruction to the video Agent in the addressed Session. */
  readonly sendRequest: (sessionId: SessionId, text: string) => Promise<void>
}
