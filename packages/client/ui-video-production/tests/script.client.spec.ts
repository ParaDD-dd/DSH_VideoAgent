import { describe, expect, it } from 'vitest'
import { isWorkspaceRelativePath, parseVideoScript } from '../src/client/script.ts'

function shot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'shot-1',
    order: 1,
    narration: 'A clear opening.',
    visual: 'A quiet skyline.',
    transition: 'cut',
    assets: [],
    durationSeconds: null,
    audioPath: null,
    thumbnailPath: null,
    ...overrides,
  }
}

function script(shots: unknown[] = [shot()], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    title: 'A short film',
    script: 'A short script.',
    canvas: { width: 1920, height: 1080 },
    shots,
    ...overrides,
  }
}

describe('video script parsing', () => {
  it('sorts shots by order and makes an omitted thumbnail explicit', () => {
    const parsed = parseVideoScript(script([
      shot({ id: 'later', order: 2, durationSeconds: 3.5, thumbnailPath: 'frames/two.webp' }),
      shot({ id: 'first', order: 1, thumbnailPath: undefined }),
    ]))

    expect(parsed?.shots.map(({ id, thumbnailPath }) => [id, thumbnailPath])).toEqual([
      ['first', null], ['later', 'frames/two.webp'],
    ])
  })

  it('preserves the optional project voice and shot override', () => {
    const parsed = parseVideoScript(script([shot({ voice: 'Dylan' })], { voice: 'Cherry' }))
    expect(parsed?.voice).toBe('Cherry')
    expect(parsed?.shots[0]?.voice).toBe('Dylan')
    expect(parseVideoScript(script([], { voice: '' }))).toBeUndefined()
    expect(parseVideoScript(script([shot({ voice: '' })]))).toBeUndefined()
    expect(parseVideoScript(script([shot({ voice: '' })]))).toBeUndefined()
  })

  it('rejects malformed project metadata and canvases', () => {
    for (const value of [
      null,
      [],
      'script',
      script([], { version: 2 }),
      script([], { title: null }),
      script([], { script: 4 }),
      script([], { canvas: [] }),
      script([], { canvas: { width: '1920', height: 1080 } }),
      script([], { canvas: { width: 1920, height: 1080.2 } }),
      script([], { shots: null }),
    ]) {
      expect(parseVideoScript(value)).toBeUndefined()
    }
  })

  it('rejects malformed, duplicate, or incomplete shot records', () => {
    const missingVisual = shot()
    delete missingVisual.visual
    const missingTransition = shot()
    delete missingTransition.transition
    const cases = [
      [null],
      [shot({ id: 1 })],
      [shot({ id: '' })],
      [shot({ order: 0 })],
      [shot({ narration: null })],
      [shot({ assets: {} })],
      [shot({ durationSeconds: '3' })],
      [shot({ durationSeconds: 0 })],
      [shot({ durationSeconds: Number.NaN })],
      [shot({ audioPath: 5 })],
      [shot({ audioPath: undefined })],
      [shot({ audioPath: '../outside.mp3' })],
      [shot({ audioPath: 'C:/private.wav' })],
      [shot({ thumbnailPath: 5 })],
      [missingVisual],
      [missingTransition],
      [shot({ thumbnailPath: '../secret.png' })],
      [shot(), shot({ id: 'shot-1', order: 2 })],
      [shot(), shot({ id: 'shot-2', order: 1 })],
    ]

    for (const shots of cases) expect(parseVideoScript(script(shots))).toBeUndefined()
  })

  it('accepts only bounded project-relative thumbnail paths', () => {
    for (const path of ['frames/shot.png', 'assets/image_01.webp']) {
      expect(isWorkspaceRelativePath(path)).toBe(true)
    }
    for (const path of [
      '',
      'a'.repeat(1025),
      '/root/file.png',
      'frame\\shot.png',
      'C:/file.png',
      `frames/${String.fromCharCode(0)}shot.png`,
      'frames//shot.png',
      './shot.png',
      'frames/../shot.png',
    ]) {
      expect(isWorkspaceRelativePath(path)).toBe(false)
    }
  })
})
