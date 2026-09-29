import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Resolve the HyperFrames project for a video Workspace.
 * @param workspacePath - Workspace directory containing the video script.
 * @returns The Workspace itself or its unique direct-child HyperFrames project.
 */
export async function resolveCompositionDirectory(workspacePath: string): Promise<string> {
  if (await isFile(join(workspacePath, 'index.html'))) return workspacePath

  const entries = await readdir(workspacePath, { withFileTypes: true })
  const candidates = await Promise.all(entries
    .filter(entry => entry.isDirectory())
    .map(async (entry) => {
      const directory = join(workspacePath, entry.name)
      const [hasIndex, hasProjectMetadata] = await Promise.all([
        isFile(join(directory, 'index.html')),
        isFile(join(directory, 'hyperframes.json')),
      ])
      return hasIndex && hasProjectMetadata ? directory : undefined
    }))
  const compositions = candidates.filter((candidate): candidate is string => candidate !== undefined)
  const onlyComposition = compositions[0]
  if (compositions.length === 1 && onlyComposition !== undefined) return onlyComposition
  if (compositions.length > 1) {
    throw new Error(`The video Workspace contains multiple nested HyperFrames projects: ${compositions.join(', ')}`)
  }
  throw new Error('The video Workspace contains no index.html or direct-child HyperFrames project with index.html and hyperframes.json')
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false
    throw error
  }
}
