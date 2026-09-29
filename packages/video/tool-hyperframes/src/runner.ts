/** Bounded HyperFrames CLI execution through the harness subprocess seam. */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import type { HyperframesOptions } from './types.ts'

/** Captured outcome and diagnostics from one HyperFrames CLI process. */
export interface HyperframesCommandResult {
  /** Process exit facts reported by the subprocess provider. */
  outcome: SubprocessOutcome
  /** Bounded standard output captured from the CLI. */
  stdout: string
  /** Bounded standard error captured from the CLI. */
  stderr: string
}

function browserEnvironment(browserPath: string | undefined, subcommand: string): Record<string, string> | undefined {
  if (browserPath === undefined) return undefined
  // HyperFrames render preflight runs the configured HYPERFRAMES_BROWSER_PATH
  // with only `--version`. Windows DSH denies that process access to Chrome's
  // default profile, while the producer later launches PRODUCER_HEADLESS_SHELL_PATH
  // with its own isolated headless arguments. Keep non-render commands on the
  // real path because they do not have this render-only preflight.
  const preflightPath = process.platform === 'win32' && subcommand === 'render'
    ? process.execPath
    : browserPath
  return {
    HYPERFRAMES_BROWSER_PATH: preflightPath,
    PRODUCER_HEADLESS_SHELL_PATH: browserPath,
  }
}

/**
 * Run one HyperFrames CLI subcommand with a plain argv vector.
 * @param ctx - context providing the execution-world subprocess service.
 * @param exec - tool execution carrying the caller's cancellation signal.
 * @param options - resolved command, output, timeout, and teardown settings.
 * @param cwd - HyperFrames project directory and child working directory.
 * @param subcommand - CLI subcommand such as `lint`, `snapshot`, or `render`.
 * @param args - subcommand arguments, kept as separate argv elements.
 * @param activation - signal owned by the live plugin activation.
 * @returns the process outcome and bounded stdout/stderr diagnostics.
 */
export async function runHyperframes(
  ctx: Context,
  exec: ToolExecution,
  options: HyperframesOptions,
  cwd: string,
  subcommand: string,
  args: readonly string[],
  activation: AbortSignal,
): Promise<HyperframesCommandResult> {
  const signal = AbortSignal.any([exec.signal, activation])
  signal.throwIfAborted()
  const executable = await ctx.subprocess.resolveExecutable(options.cliCommand, undefined, signal)
  const handle = ctx.subprocess.spawn({
    argv: [executable, 'hyperframes', subcommand, ...args],
    cwd,
    env: browserEnvironment(options.browserPath, subcommand),
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: options.maxOutputBytes },
      stderr: { maxBytes: options.maxOutputBytes },
    },
    graceMs: options.graceMs,
    signal,
  })
  let outcome: SubprocessOutcome
  try {
    outcome = await handle.done
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`HyperFrames ${subcommand} process failed to start or settle: ${reason}`, { cause: error })
  }
  const stdout = handle.collected.stdout?.readFrom(0).text
  const stderr = handle.collected.stderr?.readFrom(0).text
  if (stdout === undefined || stderr === undefined) {
    throw new Error(`HyperFrames ${subcommand} did not provide collected stdout and stderr`)
  }
  return { outcome, stdout, stderr }
}
