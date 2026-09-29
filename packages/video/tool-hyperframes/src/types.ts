/** Internal resolved options shared by the HyperFrames command adapters. */

/** Fully resolved process settings used for one HyperFrames invocation. */
export interface HyperframesOptions {
  /** Executable name or absolute path passed to the subprocess provider. */
  cliCommand: string
  /** Browser executable path forwarded to HyperFrames' browser manager. */
  browserPath?: string
  /** Tool and child-process deadline in milliseconds. */
  timeoutMs: number
  /** Maximum retained bytes for each captured child stream. */
  maxOutputBytes: number
  /** Child-process termination grace period in milliseconds. */
  graceMs: number
}
