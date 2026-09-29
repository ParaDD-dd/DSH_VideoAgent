import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {} from '@deepseek-ai/dsh-agent-presets/types'
import { videoProjects } from '../src/client/projects.ts'

function session(id: string, updatedAt: number, preset?: string): SessionSummary {
  return {
    id: id as SessionId,
    displayTitle: id,
    running: false,
    blank: false,
    updatedAt,
    ...(preset === undefined ? {} : { projectionValues: { agentPreset: preset } }),
  }
}

function workspace(id: string, path: string, sessionIds: readonly string[]): WorkspaceView {
  return {
    workspaceId: id as WorkspaceId,
    path,
    title: id,
    sessionIds: sessionIds as SessionId[],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('video project history', () => {
  it('lists only video workspaces and selects each workspace’s newest video Session', () => {
    const sessions = {
      old: session('old', 1, 'video-production'),
      newest: session('newest', 3, 'video-production'),
      regular: session('regular', 20, 'standard'),
      other: session('other', 2, 'video-production'),
    }
    const workspaces = [
      workspace('regular-workspace', '/ordinary', ['regular']),
      workspace('first-video', '/first', ['old', 'newest', 'regular']),
      workspace('second-video', '/second', ['other']),
      workspace('empty', '/empty', ['missing']),
    ]

    expect(videoProjects(workspaces, sessions)).toEqual([
      {
        workspaceId: 'first-video', path: '/first', title: 'first-video',
        sessionId: 'newest', updatedAt: 3,
        conversations: [
          { sessionId: 'newest', title: 'newest', updatedAt: 3 },
          { sessionId: 'old', title: 'old', updatedAt: 1 },
        ],
      },
      {
        workspaceId: 'second-video', path: '/second', title: 'second-video',
        sessionId: 'other', updatedAt: 2,
        conversations: [{ sessionId: 'other', title: 'other', updatedAt: 2 }],
      },
    ])
  })

  it('returns no projects when no Session has the video preset', () => {
    const regular = session('regular', 1, 'standard')
    expect(videoProjects(
      [workspace('one', '/one', ['regular'])],
      { [regular.id]: regular },
    )).toEqual([])
  })
})
