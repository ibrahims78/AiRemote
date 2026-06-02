import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

// ── Blocked patterns ─────────────────────────────────────────────────────────
// Patterns that could cause irreversible system damage — blocked unconditionally.
// Defence-in-depth: the server already rate-limits and requires auth, but we
// add a last line of defence on the agent so even a compromised session cannot
// cause catastrophic damage.
const BLOCKED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  // Recursive delete of root or home
  { re: /rm\s+-[rRf]{1,3}\s+\/(\s|$)/,         reason: 'rm -rf / blocked' },
  { re: /rm\s+-[rRf]{1,3}\s+~\/(\s|$)/,         reason: 'rm -rf ~/ blocked' },
  { re: /rm\s+-[rRf]{1,3}\s+\.\s*$/,            reason: 'rm -rf . blocked' },

  // Low-level disk format / wipe
  { re: /\bmkfs\b/,                              reason: 'mkfs blocked' },
  { re: /\bdd\b.*\bof=\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i, reason: 'dd to disk blocked' },
  { re: />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme[0-9])/i,           reason: 'redirect to disk blocked' },

  // Partition table destruction
  { re: /\bfdisk\b.*\/dev\//,                    reason: 'fdisk blocked' },
  { re: /\bparted\b.*\/dev\/.*(rm|mklabel)/,     reason: 'parted destructive op blocked' },
  { re: /\bshred\b.*\/dev\//,                    reason: 'shred on device blocked' },

  // Windows destructive format
  { re: /\bformat\s+[a-z]:\s*\/[qyp]/i,          reason: 'Windows format blocked' },

  // Immediate shutdown / halt
  { re: /\bshutdown\s+(-h\s+now|\/s\s*\/t\s*0)/i, reason: 'immediate shutdown blocked' },
  { re: /\b(halt|poweroff)\b/,                   reason: 'halt/poweroff blocked' },

  // Fork bomb
  { re: /:\(\)\s*\{.*\|.*&\s*\}/,               reason: 'fork bomb blocked' },

  // Overwrite critical Linux files
  { re: />\s*\/(etc\/(passwd|shadow|hosts|sudoers|crontab)|boot\/)/,
                                                  reason: 'overwrite of critical file blocked' },

  // Remote code execution via pipe (curl/wget | sh/bash)
  { re: /\b(curl|wget)\b.+\|\s*(ba)?sh\b/i,     reason: 'curl/wget pipe to shell blocked' },
  { re: /\b(curl|wget)\b.+\|\s*bash\b/i,         reason: 'curl pipe to bash blocked' },

  // Windows registry destruction
  { re: /\breg\s+(delete|add)\s+HKLM\\(SYSTEM|SOFTWARE|SECURITY|SAM)/i,
                                                  reason: 'Windows registry destruction blocked' },

  // Wipe Windows system files
  { re: /\bdel\s+\/[sfq]+\s+%WINDIR%/i,          reason: 'Windows system dir wipe blocked' },
  { re: /\brd\s+\/s\s+\/q\s+%WINDIR%/i,          reason: 'Windows system dir remove blocked' },

  // chmod 777 on root or system dirs
  { re: /chmod\s+-R\s+[0-7]*7+\s+\/(\s|$)/,     reason: 'chmod 777 on / blocked' },
  { re: /chmod\s+-R\s+[0-7]*7+\s+\/etc\b/,       reason: 'chmod on /etc blocked' },
]

export async function executeCommand(command: string): Promise<CommandResult> {
  const trimmed = command.trim()

  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(trimmed)) {
      console.warn(`[executor] BLOCKED: ${reason} — "${trimmed.slice(0, 80)}"`)
      return {
        stdout: '',
        stderr: `Command blocked by security policy: ${reason}`,
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
