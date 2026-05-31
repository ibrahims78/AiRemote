import type { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '../middleware/auth'

const AGENT_VERSION = '1.4.0'

const RELEASES_DIR = path.resolve(process.cwd(), '../../releases')

const RELEASE_FILES: {
  id: string
  label_ar: string
  label_en: string
  desc_ar: string
  desc_en: string
  filename: string
  dir: string
  platform: string
  icon: string
  size_hint: string
}[] = [
  {
    id: 'win-exe',
    label_ar: 'Windows Agent (EXE)',
    label_en: 'Windows Agent (EXE)',
    desc_ar: 'تطبيق مستقل لـ Windows 64-bit — لا يحتاج Node.js',
    desc_en: 'Standalone Windows 64-bit app — no Node.js required',
    filename: `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`,
    dir: 'agent-headless',
    platform: 'windows',
    icon: 'windows',
    size_hint: '~38 MB',
  },
  {
    id: 'linux-bin',
    label_ar: 'Linux Agent (Binary)',
    label_en: 'Linux Agent (Binary)',
    desc_ar: 'ملف تنفيذي لـ Linux 64-bit — لا يحتاج Node.js',
    desc_en: 'Standalone Linux 64-bit binary — no Node.js required',
    filename: `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`,
    dir: 'agent-headless',
    platform: 'linux',
    icon: 'linux',
    size_hint: '~38 MB',
  },
  {
    id: 'script-js',
    label_ar: 'Node.js Script',
    label_en: 'Node.js Script',
    desc_ar: 'سكريبت JavaScript — يتطلب Node.js 18+',
    desc_en: 'JavaScript bundle — requires Node.js 18+',
    filename: `agent-v${AGENT_VERSION}.js`,
    dir: 'agent-script',
    platform: 'any',
    icon: 'nodejs',
    size_hint: '~500 KB',
  },
  {
    id: 'script-pkg',
    label_ar: 'حزمة الـ Script (ZIP)',
    label_en: 'Script Package (ZIP)',
    desc_ar: 'السكريبت + start.bat + start.sh لجميع الأنظمة',
    desc_en: 'Script + start.bat + start.sh for all platforms',
    filename: `agent-script-v${AGENT_VERSION}.zip`,
    dir: 'agent-script',
    platform: 'any',
    icon: 'archive',
    size_hint: '~500 KB',
  },
]

export async function downloadRoutes(app: FastifyInstance) {
  // GET /api/downloads — list available releases
  app.get('/list', { preHandler: [requireAuth] }, async (_req, reply) => {
    const list = RELEASE_FILES.map(f => {
      const filePath = path.join(RELEASES_DIR, f.dir, f.filename)
      const exists = fs.existsSync(filePath)
      let size = 0
      if (exists) {
        try { size = fs.statSync(filePath).size } catch {}
      }
      return {
        id: f.id,
        label_ar: f.label_ar,
        label_en: f.label_en,
        desc_ar: f.desc_ar,
        desc_en: f.desc_en,
        filename: f.filename,
        platform: f.platform,
        icon: f.icon,
        size_hint: f.size_hint,
        size_bytes: size,
        available: exists,
        version: AGENT_VERSION,
        download_url: `/api/downloads/file/${f.id}`,
      }
    })
    return reply.send({ version: AGENT_VERSION, releases: list })
  })

  // GET /api/downloads/file/:id — download a release file
  app.get<{ Params: { id: string } }>('/file/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const release = RELEASE_FILES.find(f => f.id === req.params.id)
    if (!release) {
      return reply.code(404).send({ error: 'Release not found' })
    }

    const filePath = path.join(RELEASES_DIR, release.dir, release.filename)
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not built yet. See README for build instructions.' })
    }

    const stat = fs.statSync(filePath)
    reply.header('Content-Disposition', `attachment; filename="${release.filename}"`)
    reply.header('Content-Length', stat.size)
    reply.header('Content-Type', 'application/octet-stream')
    return reply.send(fs.createReadStream(filePath))
  })
}
