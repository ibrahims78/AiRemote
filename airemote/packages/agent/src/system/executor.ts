import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/\s*$/,
  /format\s+[a-z]:/i,
  /mkfs\s+/,
  /dd\s+if=.*of=\/dev\/(sd|hd|nvme)/,
  />\s*\/dev\/(sd|hd|nvme)/,
  /shutdown\s+-h\s+now/,
  /halt\b/,
  /poweroff\b/
]

export async function executeCommand(command: string): Promise<CommandResult> {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return {
        stdout: '',
        stderr: `Command blocked by security policy: matches dangerous pattern`,
        exitCode: 1,
        duration: 0
      }
    }
  }

  const start = Date.now()

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    })

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      duration: Date.now() - start
    }
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; code?: number; message: string }
    return {
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
      exitCode: typeof error.code === 'number' ? error.code : 1,
      duration: Date.now() - start
    }
  }
}
