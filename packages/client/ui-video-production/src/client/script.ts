/** Parsed, renderer-ready fields from the durable video project script. */
export interface VideoShot {
  readonly id: string
  readonly order: number
  readonly narration: string
  readonly visual: unknown
  readonly transition: unknown
  readonly assets: readonly unknown[]
  readonly durationSeconds: number | null
  readonly audioPath: string | null
  readonly thumbnailPath: string | null
  /** Shot-specific Qwen speaker; null or omitted inherits the project voice. */
  readonly voice?: string | null
}

/** Stable script data consumed by the preview and timeline. */
export interface VideoScript {
  readonly version: 1
  readonly title: string
  readonly script: string
  readonly canvas: { readonly width: number; readonly height: number }
  /** Default Qwen speaker for shots without a voice override. */
  readonly voice?: string
  readonly shots: readonly VideoShot[]
}

/**
 * Parse one durable script file without trusting its filesystem contents.
 * @param value - parsed file content.
 * @returns validated script, or undefined when the content is invalid.
 */
export function parseVideoScript(value: unknown): VideoScript | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.title !== 'string'
    || typeof value.script !== 'string'
    || !isRecord(value.canvas)
    || !isPositiveInteger(value.canvas.width)
    || !isPositiveInteger(value.canvas.height)
    || (value.voice !== undefined && (typeof value.voice !== 'string' || value.voice.trim() === ''))
    || !Array.isArray(value.shots)) return undefined

  const shots: VideoShot[] = []
  const ids = new Set<string>()
  const orders = new Set<number>()
  for (const rawShot of value.shots) {
    if (!isRecord(rawShot)
      || typeof rawShot.id !== 'string'
      || rawShot.id === ''
      || !isPositiveInteger(rawShot.order)
      || ids.has(rawShot.id)
      || orders.has(rawShot.order)
      || typeof rawShot.narration !== 'string'
      || !Array.isArray(rawShot.assets)
      || !isNullablePositiveNumber(rawShot.durationSeconds)
      || !isNullableString(rawShot.audioPath)
      || !isOptionalNullableString(rawShot.thumbnailPath)
      || !isOptionalNullableString(rawShot.voice)
      || (typeof rawShot.voice === 'string' && rawShot.voice.trim() === '')
      || (typeof rawShot.voice === 'string' && rawShot.voice.trim() === '')
      || !('visual' in rawShot)
      || !('transition' in rawShot)) return undefined
    if (rawShot.thumbnailPath !== null && rawShot.thumbnailPath !== undefined
      && !isWorkspaceRelativePath(rawShot.thumbnailPath)) return undefined
    if (rawShot.audioPath !== null && !isWorkspaceRelativePath(rawShot.audioPath)) return undefined
    shots.push({
      id: rawShot.id,
      order: rawShot.order,
      narration: rawShot.narration,
      visual: rawShot.visual,
      transition: rawShot.transition,
      assets: rawShot.assets,
      durationSeconds: rawShot.durationSeconds,
      audioPath: rawShot.audioPath,
      thumbnailPath: rawShot.thumbnailPath ?? null,
      ...(rawShot.voice === undefined ? {} : { voice: rawShot.voice }),
    })
    ids.add(rawShot.id)
    orders.add(rawShot.order)
  }

  return {
    version: value.version,
    title: value.title,
    script: value.script,
    canvas: { width: value.canvas.width, height: value.canvas.height },
    ...(value.voice === undefined ? {} : { voice: value.voice }),
    shots: [...shots].sort((a, b) => a.order - b.order),
  }
}

/**
 * A path from script.json must stay relative to the project workspace.
 * @param path - path stored in the script.
 * @returns whether the path stays within the workspace.
 */
export function isWorkspaceRelativePath(path: string): boolean {
  return path.length > 0
    && path.length <= 1024
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.includes(':')
    && !path.includes(String.fromCharCode(0))
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNullablePositiveNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || isNullableString(value)
}
