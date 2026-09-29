import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveCompositionDirectory } from '../src/composition.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-video-composition-'))
  directories.push(directory)
  return directory
}

async function composition(directory: string): Promise<void> {
  await writeFile(join(directory, 'index.html'), '<!doctype html><html></html>')
  await writeFile(join(directory, 'hyperframes.json'), '{}')
}

describe('resolveCompositionDirectory', () => {
  it('uses an index.html at the Workspace root', async () => {
    const project = await workspace()
    await writeFile(join(project, 'index.html'), '<!doctype html><html></html>')

    await expect(resolveCompositionDirectory(project)).resolves.toBe(project)
  })

  it('uses the unique direct-child HyperFrames project', async () => {
    const project = await workspace()
    const compositionPath = join(project, 'dynamic-programming')
    await mkdir(compositionPath)
    await composition(compositionPath)

    await expect(resolveCompositionDirectory(project)).resolves.toBe(compositionPath)
  })

  it('rejects a Workspace without a root or direct-child composition', async () => {
    await expect(resolveCompositionDirectory(await workspace())).rejects.toThrow(
      'contains no index.html or direct-child HyperFrames project',
    )
  })

  it('rejects multiple direct-child HyperFrames projects', async () => {
    const project = await workspace()
    const names = ['first', 'second']
    for (const name of names) {
      const directory = join(project, name)
      await mkdir(directory)
      await composition(directory)
    }

    await expect(resolveCompositionDirectory(project)).rejects.toThrow(
      'contains multiple nested HyperFrames projects',
    )
  })
})
