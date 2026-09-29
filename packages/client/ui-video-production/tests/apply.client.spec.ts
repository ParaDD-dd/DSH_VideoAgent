import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { apply } from '../src/client/index.ts'
import type { VideoProductionInjected } from '../src/client/contract.ts'

describe('video workspace actions', () => {
  it('enters without reusing the DSH Session, creates a project and conversation, then restores DSH', async () => {
    const original = 'regular-session' as SessionId
    const projectSession = 'project-session' as SessionId
    const nextSession = 'next-session' as SessionId
    const workspaceId = 'video-workspace' as WorkspaceId
    const clear = vi.fn()
    const open = vi.fn()
    const selectPanel = vi.fn()
    const createDirectory = vi.fn(async () => 'C:\\videos\\First cut')
    const createWorkspace = vi.fn(async () => ({ workspaceId }))
    const createSession = vi.fn()
      .mockResolvedValueOnce(projectSession)
      .mockResolvedValueOnce(nextSession)
    let injected: VideoProductionInjected | undefined
    const ctx = {
      sessions: { clear, open, create: createSession },
      layout: { selectPanel },
      uiWorkspace: { createDirectory },
      workspaces: { create: createWorkspace },
      locale: { register: () => () => {} },
      slots: {
        inject: (_name: string, contribution: () => (() => void) | Iterable<() => void>) => {
          const effects = contribution()
          if (typeof effects !== 'function') for (const effect of effects) void effect
          return () => {}
        },
        register: (options: { key?: string; inject?: () => VideoProductionInjected }) => {
          if (options.key === 'video-production') injected = options.inject?.()
          return () => {}
        },
      },
      effect: (contribution: () => () => void) => { contribution() },
    } as unknown as Parameters<typeof apply>[0]
    apply(ctx)
    expect(injected).toBeDefined()

    injected!.switchMode(null, original)
    expect(clear).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalledWith(original)
    expect(selectPanel).toHaveBeenCalledWith('video-production')

    await injected!.createProject('First cut', 'C:\\videos')
    expect(createDirectory).toHaveBeenCalledWith('C:\\videos', 'First cut')
    expect(createWorkspace).toHaveBeenCalledWith({ path: 'C:\\videos\\First cut' })
    expect(createSession).toHaveBeenCalledWith({ workspaceId, agentPreset: 'video-production' })
    expect(open).toHaveBeenCalledWith(projectSession)

    await injected!.createConversation(workspaceId)
    expect(createSession).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenCalledWith(nextSession)

    injected!.switchMode('video-production' as never, nextSession)
    expect(selectPanel).toHaveBeenLastCalledWith(null)
    expect(open).toHaveBeenLastCalledWith(original)
  })
})
