import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../middleware/auth'
import { getDb } from '../db/database'
import fs from 'fs'
import path from 'path'
import { AGENT_VERSION } from './downloads'

const REPO_ROOT    = path.resolve(process.cwd(), '../..')
const RELEASES_DIR = path.join(REPO_ROOT, 'releases')

// ── Publish-status store ──────────────────────────────────────────────────
type PublishStatus = 'idle' | 'running' | 'done' | 'error'
interface PublishState {
  status: PublishStatus
  log:    string[]
  url?:   string
  startedAt?:  string
  finishedAt?: string
}
const publishStates = new Map<string, PublishState>()

// ── Release definitions (what can be pushed to GitHub) ────────────────────
interface GhReleaseDef {
  id:        string
  label:     string
  assetName: string
  filePath:  string
}
const GH_RELEASES: GhReleaseDef[] = [
  {
    id:        'win-gui',
    label:     'Windows GUI Agent (Electron)',
    assetName: `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`,
    filePath:  path.join(RELEASES_DIR, 'agent-windows', `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`),
  },
  {
    id:        'script-pkg',
    label:     'Node.js Script Package (ZIP)',
    assetName: `agent-script-v${AGENT_VERSION}.zip`,
    filePath:  path.join(RELEASES_DIR, 'agent-script', `agent-script-v${AGENT_VERSION}.zip`),
  },
  {
    id:        'script-js',
    label:     'Node.js Script (single file)',
    assetName: `agent-v${AGENT_VERSION}.js`,
    filePath:  path.join(RELEASES_DIR, 'agent-script', `agent-v${AGENT_VERSION}.js`),
  },
  {
    id:        'win-exe',
    label:     'Windows CLI Binary',
    assetName: `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`,
    filePath:  path.join(RELEASES_DIR, 'agent-headless', `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`),
  },
  {
    id:        'linux-bin',
    label:     'Linux Binary',
    assetName: `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`,
    filePath:  path.join(RELEASES_DIR, 'agent-headless', `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`),
  },
]

// ── DB helpers ────────────────────────────────────────────────────────────
interface GithubConfig { token: string; owner: string; repo: string }

async function getConfig(): Promise<GithubConfig | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: ['github_config'] })
  const row = result.rows[0] as unknown as { value: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.value) as GithubConfig } catch { return null }
}

async function saveConfig(cfg: GithubConfig): Promise<void> {
  const db = getDb()
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: ['github_config', JSON.stringify(cfg), new Date().toISOString()]
  })
}

// ── GitHub REST API helper ────────────────────────────────────────────────
async function ghApi<T = unknown>(
  method: string,
  url: string,
  token: string,
  body?: unknown,
  fileBuffer?: Buffer,
  contentType?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization':       `Bearer ${token}`,
    'Accept':              'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':          'AiRemote/1.0',
  }

  let fetchBody: Buffer | string | undefined
  if (fileBuffer) {
    headers['Content-Type']   = contentType ?? 'application/octet-stream'
    headers['Content-Length'] = String(fileBuffer.length)
    fetchBody = fileBuffer
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    fetchBody = JSON.stringify(body)
  }

  const res = await fetch(url, { method, headers, body: fetchBody })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let errMsg = `GitHub API ${res.status}`
    try {
      const j = JSON.parse(text) as { message?: string }
      if (j.message) errMsg += `: ${j.message}`
    } catch { errMsg += `: ${text.slice(0, 200)}` }
    throw new Error(errMsg)
  }
  if (res.status === 204) return {} as T
  return res.json() as T
}

// ── Core publish logic (runs in background) ───────────────────────────────
async function doPublish(publishId: string, releaseId: string, cfg: GithubConfig): Promise<void> {
  const state = publishStates.get(publishId)!
  const log   = (msg: string) => { state.log.push(msg); console.log(`[GitHub] ${msg}`) }

  const targets = releaseId === 'all'
    ? GH_RELEASES
    : GH_RELEASES.filter(r => r.id === releaseId)

  const available = targets.filter(r => fs.existsSync(r.filePath))
  if (available.length === 0) {
    state.status = 'error'
    log('لا توجد ملفات متاحة للنشر — قم ببناء الإصدار أولاً')
    state.finishedAt = new Date().toISOString()
    return
  }

  try {
    // 1. Get or create the GitHub release
    log(`جاري التحقق من الإصدار v${AGENT_VERSION} على GitHub...`)

    type GhRelease = { id: number; upload_url: string; html_url: string; assets: { id: number; name: string }[] }
    let release: GhRelease

    try {
      release = await ghApi<GhRelease>(
        'GET',
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/tags/v${AGENT_VERSION}`,
        cfg.token
      )
      log(`الإصدار موجود بالفعل (id=${release.id})`)

      // Refresh assets list
      release = await ghApi<GhRelease>(
        'GET',
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/${release.id}`,
        cfg.token
      )
    } catch {
      log('الإصدار غير موجود — جاري إنشاؤه...')
      release = await ghApi<GhRelease>(
        'POST',
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases`,
        cfg.token,
        {
          tag_name:   `v${AGENT_VERSION}`,
          name:       `AiRemote v${AGENT_VERSION}`,
          body:       `## AiRemote Agent v${AGENT_VERSION}\n\n### Downloads\n\n| File | Platform |\n|---|---|\n| AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip | Windows (GUI) |\n| agent-script-v${AGENT_VERSION}.zip | All platforms (Node.js) |\n| AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe | Windows (CLI) |\n| AiRemote-Agent-v${AGENT_VERSION}-linux-x64 | Linux (x64) |`,
          draft:      false,
          prerelease: false,
        }
      )
      log(`تم إنشاء الإصدار (id=${release.id})`)
    }

    state.url = release.html_url

    // 2. Upload each asset
    const uploadBase = release.upload_url.replace('{?name,label}', '')

    for (const def of available) {
      log(`📦 جاري رفع ${def.assetName}...`)

      // Delete existing asset with same name (re-upload)
      const existing = release.assets?.find(a => a.name === def.assetName)
      if (existing) {
        log(`  حذف النسخة القديمة من ${def.assetName}...`)
        await ghApi(
          'DELETE',
          `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/assets/${existing.id}`,
          cfg.token
        )
      }

      const buf   = fs.readFileSync(def.filePath)
      const sizeMB = (buf.length / 1024 / 1024).toFixed(1)
      log(`  الحجم: ${sizeMB} MB — جاري الرفع...`)

      const ct = def.assetName.endsWith('.zip') ? 'application/zip'
        : def.assetName.endsWith('.exe')        ? 'application/vnd.microsoft.portable-executable'
        : 'application/octet-stream'

      await ghApi(
        'POST',
        `${uploadBase}?name=${encodeURIComponent(def.assetName)}`,
        cfg.token,
        undefined,
        buf,
        ct
      )
      log(`  ✅ تم رفع ${def.assetName}`)
    }

    state.status      = 'done'
    state.finishedAt  = new Date().toISOString()
    log(`🎉 اكتمل النشر: ${release.html_url}`)

  } catch (err) {
    state.status     = 'error'
    state.finishedAt = new Date().toISOString()
    log(`❌ خطأ: ${(err as Error).message}`)
  }
}

// ── Routes ────────────────────────────────────────────────────────────────
export async function githubRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdmin)

  // GET /api/github/config — current config (token masked)
  fastify.get('/config', async () => {
    const cfg = await getConfig()
    if (!cfg) return { configured: false }
    return { configured: true, owner: cfg.owner, repo: cfg.repo, tokenSet: true }
  })

  // POST /api/github/config — save config
  fastify.post<{ Body: { token: string; owner: string; repo: string } }>('/config', async (req, reply) => {
    const { token, owner, repo } = req.body
    if (!owner?.trim() || !repo?.trim()) return reply.code(400).send({ error: 'owner و repo مطلوبان' })

    const existing = await getConfig()
    const finalToken = token?.trim() && token !== '__keep__' ? token.trim() : existing?.token ?? ''
    if (!finalToken) return reply.code(400).send({ error: 'Token مطلوب' })

    await saveConfig({ token: finalToken, owner: owner.trim(), repo: repo.trim() })
    return { ok: true }
  })

  // POST /api/github/test — verify token + repo access
  fastify.post('/test', async (_, reply) => {
    const cfg = await getConfig()
    if (!cfg) return reply.code(400).send({ error: 'GitHub غير مُهيَّأ — أضف الإعدادات أولاً' })
    try {
      const user = await ghApi<{ login: string }>('GET', 'https://api.github.com/user', cfg.token)
      const repoInfo = await ghApi<{ full_name: string; private: boolean }>(
        'GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, cfg.token
      )
      return { ok: true, user: user.login, repo: repoInfo.full_name, private: repoInfo.private }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // GET /api/github/releases — list available release files
  fastify.get('/releases', async () => {
    return GH_RELEASES.map(r => {
      const exists = fs.existsSync(r.filePath)
      return {
        id:       r.id,
        label:    r.label,
        assetName:r.assetName,
        exists,
        sizeMB:   exists ? (fs.statSync(r.filePath).size / 1024 / 1024).toFixed(1) : null,
      }
    })
  })

  // POST /api/github/publish/:releaseId — start publish (releaseId or 'all')
  fastify.post<{ Params: { releaseId: string } }>('/publish/:releaseId', async (req, reply) => {
    const cfg = await getConfig()
    if (!cfg) return reply.code(400).send({ error: 'يرجى إعداد بيانات GitHub أولاً' })

    const { releaseId } = req.params
    const validIds = [...GH_RELEASES.map(r => r.id), 'all']
    if (!validIds.includes(releaseId)) return reply.code(400).send({ error: 'releaseId غير صالح' })

    const publishId = `${releaseId}-${Date.now()}`
    publishStates.set(publishId, { status: 'running', log: [], startedAt: new Date().toISOString() })

    doPublish(publishId, releaseId, cfg).catch(() => {})
    return { publishId }
  })

  // GET /api/github/publish/:publishId/status — poll status
  fastify.get<{ Params: { publishId: string } }>('/publish/:publishId/status', async (req, reply) => {
    const state = publishStates.get(req.params.publishId)
    if (!state) return reply.code(404).send({ error: 'لم يُعثر على عملية النشر' })
    return state
  })
}
