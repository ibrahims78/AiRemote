import type { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { requireAuth, requireAdmin } from '../middleware/auth'

export const AGENT_VERSION = '1.4.0'

// Root of the repo (two levels up from packages/server)
const REPO_ROOT    = path.resolve(process.cwd(), '../..')
const RELEASES_DIR = path.join(REPO_ROOT, 'releases')

// ── Build-status store (in-memory, survives for the lifetime of the process) ──
type BuildStatus = 'idle' | 'building' | 'done' | 'error'
interface BuildState {
  status: BuildStatus
  log:    string[]
  startedAt?: string
  finishedAt?: string
}
const buildStates = new Map<string, BuildState>()

// ── Release definitions ────────────────────────────────────────────────────
interface ReleaseDef {
  id:         string
  label_ar:   string
  label_en:   string
  desc_ar:    string
  desc_en:    string
  filename:   string
  dir:        string          // relative to RELEASES_DIR
  platform:   'windows' | 'linux' | 'any'
  badge_ar?:  string          // optional badge text (e.g. "GUI")
  badge_en?:  string
  size_hint:  string
  buildCmd?:  { cwd: string; cmd: string; args: string[] }  // optional — enables the Build button
}

const RELEASE_DEFS: ReleaseDef[] = [
  {
    id:        'win-gui',
    label_ar:  'Windows Agent (GUI)',
    label_en:  'Windows Agent (GUI)',
    badge_ar:  'واجهة رسومية',
    badge_en:  'Desktop App',
    desc_ar:   'تطبيق سطح مكتب Windows — فُك الضغط وشغّل AiRemote Agent.exe — لا يحتاج Node.js',
    desc_en:   'Windows desktop app — extract ZIP and run AiRemote Agent.exe — no Node.js needed',
    filename:  `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`,
    dir:       'agent-windows',
    platform:  'windows',
    size_hint: '~103 MB',
    buildCmd: {
      cwd:  REPO_ROOT,
      cmd:  'python3',
      args: [
        '-c',
        [
          'import zipfile,os,sys',
          `src="releases/agent-windows/win-unpacked"`,
          `dst="releases/agent-windows/AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip"`,
          'with zipfile.ZipFile(dst,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as zf:',
          '  [zf.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),src))',
          '   for r,d,files in os.walk(src) for f in files]',
          'print("Done:",os.path.getsize(dst),"bytes")',
        ].join(';'),
      ],
    },
  },
  {
    id:        'win-exe',
    label_ar:  'Windows Agent (CLI)',
    label_en:  'Windows Agent (CLI)',
    badge_ar:  'سطر أوامر',
    badge_en:  'Headless',
    desc_ar:   'ملف تنفيذي مستقل لـ Windows — يعمل في CMD بدون Node.js',
    desc_en:   'Standalone Windows binary — runs in CMD without Node.js',
    filename:  `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`,
    dir:       'agent-headless',
    platform:  'windows',
    size_hint: '~36 MB',
    buildCmd: {
      cwd:  REPO_ROOT,
      cmd:  'node',
      args: [
        '-e',
        `require('child_process').execFileSync(
          'packages/agent/node_modules/.bin/pkg',
          ['releases/agent-script/agent-v${AGENT_VERSION}.js',
           '--targets', 'node18-win-x64',
           '--output', 'releases/agent-headless/AiRemote-Agent-v${AGENT_VERSION}-win-x64',
           '--compress', 'GZip'],
          {stdio:'inherit'}
        )`,
      ],
    },
  },
  {
    id:        'linux-bin',
    label_ar:  'Linux Agent (Binary)',
    label_en:  'Linux Agent (Binary)',
    badge_ar:  'Linux',
    badge_en:  'Linux',
    desc_ar:   'ملف تنفيذي مستقل لـ Linux 64-bit — لا يحتاج Node.js',
    desc_en:   'Standalone Linux 64-bit binary — no Node.js required',
    filename:  `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`,
    dir:       'agent-headless',
    platform:  'linux',
    size_hint: '~45 MB',
    buildCmd: {
      cwd:  REPO_ROOT,
      cmd:  'node',
      args: [
        '-e',
        `require('child_process').execFileSync(
          'packages/agent/node_modules/.bin/pkg',
          ['releases/agent-script/agent-v${AGENT_VERSION}.js',
           '--targets', 'node18-linux-x64',
           '--output', 'releases/agent-headless/AiRemote-Agent-v${AGENT_VERSION}-linux-x64',
           '--compress', 'GZip'],
          {stdio:'inherit'}
        )`,
      ],
    },
  },
  {
    id:        'script-js',
    label_ar:  'Node.js Script',
    label_en:  'Node.js Script',
    badge_ar:  'Node.js',
    badge_en:  'Node.js',
    desc_ar:   'حزمة JavaScript — تتطلب Node.js 18+',
    desc_en:   'JavaScript bundle — requires Node.js 18+',
    filename:  `agent-v${AGENT_VERSION}.js`,
    dir:       'agent-script',
    platform:  'any',
    size_hint: '~168 KB',
  },
  {
    id:        'script-pkg',
    label_ar:  'Script Package (ZIP)',
    label_en:  'Script Package (ZIP)',
    badge_ar:  'ZIP',
    badge_en:  'ZIP',
    desc_ar:   'السكريبت + start.bat + start.sh لجميع الأنظمة',
    desc_en:   'Script + start.bat + start.sh for all platforms',
    filename:  `agent-script-v${AGENT_VERSION}.zip`,
    dir:       'agent-script',
    platform:  'any',
    size_hint: '~168 KB',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────
function releaseFilePath(def: ReleaseDef) {
  return path.join(RELEASES_DIR, def.dir, def.filename)
}

function toPublicRelease(def: ReleaseDef) {
  const filePath = releaseFilePath(def)
  const exists   = fs.existsSync(filePath)
  let size = 0
  if (exists) { try { size = fs.statSync(filePath).size } catch {} }
  const build = buildStates.get(def.id)
  return {
    id:           def.id,
    label_ar:     def.label_ar,
    label_en:     def.label_en,
    desc_ar:      def.desc_ar,
    desc_en:      def.desc_en,
    badge_ar:     def.badge_ar ?? null,
    badge_en:     def.badge_en ?? null,
    filename:     def.filename,
    platform:     def.platform,
    size_hint:    def.size_hint,
    size_bytes:   size,
    available:    exists,
    buildable:    !!def.buildCmd,
    build_status: build?.status ?? 'idle',
    version:      AGENT_VERSION,
    download_url: `/api/downloads/file/${def.id}`,
    build_url:    def.buildCmd ? `/api/downloads/build/${def.id}` : null,
    status_url:   def.buildCmd ? `/api/downloads/build/${def.id}/status` : null,
  }
}

// ── Spawn a build job ──────────────────────────────────────────────────────
function startBuild(def: ReleaseDef): boolean {
  const current = buildStates.get(def.id)
  if (current?.status === 'building') return false   // already running

  const state: BuildState = { status: 'building', log: [], startedAt: new Date().toISOString() }
  buildStates.set(def.id, state)

  const { cwd, cmd, args } = def.buildCmd!
  const child = spawn(cmd, args, { cwd, stdio: 'pipe', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } })

  const onData = (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(l => l.trim())
    state.log.push(...lines)
    if (state.log.length > 500) state.log.splice(0, state.log.length - 500)
  }

  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)

  child.on('close', (code) => {
    state.finishedAt = new Date().toISOString()
    if (code === 0 && fs.existsSync(releaseFilePath(def))) {
      state.status = 'done'
      state.log.push(`✅ Build succeeded — ${def.filename}`)
    } else {
      state.status = 'error'
      state.log.push(`❌ Build failed (exit ${code})`)
    }
    buildStates.set(def.id, state)
  })

  child.on('error', (err) => {
    state.status = 'error'
    state.finishedAt = new Date().toISOString()
    state.log.push(`❌ ${err.message}`)
    buildStates.set(def.id, state)
  })

  return true
}

// ── Route plugin ──────────────────────────────────────────────────────────
export async function downloadRoutes(app: FastifyInstance) {

  // GET /api/downloads/list
  app.get('/list', { preHandler: [requireAuth] }, async (_req, reply) => {
    return reply.send({
      version:  AGENT_VERSION,
      releases: RELEASE_DEFS.map(toPublicRelease),
    })
  })

  // GET /api/downloads/file/:id — stream file to client
  // Accepts auth via Authorization header OR ?token= query param so the browser
  // can trigger a native download using a plain <a href="...?token=..."> link.
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/file/:id',
    async (req, reply) => {
      // Auth: try header first, fall back to ?token= query param
      const queryToken = (req.query as { token?: string }).token
      if (queryToken) {
        req.headers.authorization = `Bearer ${queryToken}`
      }
      try {
        await req.jwtVerify()
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const def = RELEASE_DEFS.find(d => d.id === req.params.id)
      if (!def) return reply.code(404).send({ error: 'Release not found' })

      const filePath = releaseFilePath(def)
      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({
          error: 'File not built yet.',
          buildable: !!def.buildCmd,
          build_url: def.buildCmd ? `/api/downloads/build/${def.id}` : null,
        })
      }

      const stat = fs.statSync(filePath)
      reply.header('Content-Disposition', `attachment; filename="${def.filename}"`)
      reply.header('Content-Length', String(stat.size))
      reply.header('Content-Type', 'application/octet-stream')
      reply.header('Cache-Control', 'no-store')
      return reply.send(fs.createReadStream(filePath))
    }
  )

  // POST /api/downloads/build/:id — trigger a build (admin only)
  app.post<{ Params: { id: string } }>(
    '/build/:id',
    { preHandler: [requireAdmin] },
    async (req, reply) => {
      const def = RELEASE_DEFS.find(d => d.id === req.params.id)
      if (!def)         return reply.code(404).send({ error: 'Release not found' })
      if (!def.buildCmd) return reply.code(400).send({ error: 'This release has no build command' })

      const started = startBuild(def)
      const state   = buildStates.get(def.id)!
      return reply.send({
        started,
        status:    state.status,
        message:   started ? 'Build started' : 'Build already running',
        status_url: `/api/downloads/build/${def.id}/status`,
      })
    }
  )

  // GET /api/downloads/build/:id/status — poll build progress
  app.get<{ Params: { id: string } }>(
    '/build/:id/status',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const def = RELEASE_DEFS.find(d => d.id === req.params.id)
      if (!def) return reply.code(404).send({ error: 'Release not found' })

      const state = buildStates.get(def.id) ?? { status: 'idle' as BuildStatus, log: [] }
      const filePath = releaseFilePath(def)
      return reply.send({
        id:          def.id,
        status:      state.status,
        log:         state.log,
        available:   fs.existsSync(filePath),
        startedAt:   (state as BuildState).startedAt  ?? null,
        finishedAt:  (state as BuildState).finishedAt ?? null,
      })
    }
  )
}
