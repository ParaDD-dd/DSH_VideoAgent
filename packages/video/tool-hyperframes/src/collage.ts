/** Assemble HyperFrames snapshot PNGs into a bounded three-column contact sheet. */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type sharp from 'sharp'
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require'

const requireSharp = createLazyRequire<typeof sharp>('sharp', import.meta.url)

/** One rendered timestamp and its individual PNG path. */
export interface SnapshotFrame {
  /** Timestamp requested from HyperFrames, in seconds. */
  time: number
  /** Absolute path of the rendered frame. */
  path: string
}

/** Contact-sheet result returned by the snapshot tool. */
export interface SnapshotGrid {
  /** Absolute path of the assembled PNG. */
  path: string
  /** Frames in the same row-major order as the input timestamps. */
  frames: SnapshotFrame[]
  /** Number of columns in the contact sheet. */
  columns: number
  /** Number of rows required for the requested frame count. */
  rows: number
}

const FRAME_NAME = /^frame-(\d+)-.*\.png$/i
type OrderedSnapshotFile = { index: number; path: string }

/**
 * Find HyperFrames' numbered frame files and create a three-column PNG grid.
 * @param outputDirectory - unique directory written by the HyperFrames snapshot command.
 * @param times - timestamps passed to the command in row-major order.
 * @returns the assembled grid and its source-frame mapping.
 */
export async function assembleSnapshotGrid(outputDirectory: string, times: readonly number[]): Promise<SnapshotGrid> {
  const sharp = requireSharp()
  const files = (await readdir(outputDirectory, { withFileTypes: true }))
    .filter(file => file.isFile())
    .flatMap((file) => {
      const match = FRAME_NAME.exec(file.name)
      return match === null ? [] : [{ index: Number(match[1]), path: join(outputDirectory, file.name) }]
    })
    .sort((left, right) => left.index - right.index)
  if (times.length < 1 || files.length !== times.length || files.some((file, index) => file.index !== index)) {
    throw new Error(`HyperFrames snapshot produced ${files.length} numbered frames for ${times.length} requested timestamps`)
  }
  const orderedFiles = files as [OrderedSnapshotFile, ...OrderedSnapshotFile[]]
  const first = await sharp(orderedFiles[0].path).metadata()
  const width = first.width
  const height = first.height
  const rows = Math.ceil(times.length / 3)
  const tileBuffers = await Promise.all(orderedFiles.map(file => sharp(file.path)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer()))
  const path = join(outputDirectory, 'grid.png')
  await sharp({
    create: {
      width: width * 3,
      height: height * rows,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(tileBuffers.map((input, index) => ({
      input,
      left: (index % 3) * width,
      top: Math.floor(index / 3) * height,
    })))
    .png()
    .toFile(path)
  return {
    path,
    frames: orderedFiles.map((file, index) => ({ time: times[index] as number, path: file.path })),
    columns: 3,
    rows,
  }
}
