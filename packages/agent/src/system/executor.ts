import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

// Patterns that could cause irreversible system damage — blocked unconditionally
const BLOCKED_PATTERNS = [
  // Recursive delete of root or critical paths
  /rm\s+(-[rRf]{1,3}\s+)+\/(\s|$)/,
  /rm\s+(-[rRf]{1,3}\s+)+~\/(\s|$)/,
  // Low-level disk format/wipe
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i,
  />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i,
  // Disk partition table destruction
  /\bfdisk\b.*\/dev\//,
  /\bparted\b.*\/dev\/.*(rm|mklabel)/,
  // Windows destructive format
  /\bformat\s+[a-z]:\s*\/[qyp]/i,
  // Immediate power-off/shutdown (without delay)
  /\bshutdown\s+(-h\s+now|\/s\s*\/t\s*0)/i,
  /\b(halt|poweroff)\b/,
  // Fork bomb patterns
  /:\(\)\s*\{.*\|.*&\s*\}/,
  // Overwrite critical Linux files
  />\s*\/(etc\/(passwd|shadow|hosts|sudoers)|boot\/)/
]

export async function executeCommand(command: string): Promise<CommandResult> {
  const trimmed = command.trim()

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        stdout: '',
        stderr: `Command blocked by security policy`,
        exitCode: 1,
        duration: 0
      }
    }
  }

  const start = Date.now()

  try {
    const { stdout, stderr } = await execAsync(trimmed, {
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
