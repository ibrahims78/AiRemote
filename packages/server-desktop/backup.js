'use strict'
/**
 * backup.js — Backup and restore system for AiRemote Server Desktop
 */
const fs      = require('fs')
const path    = require('path')
const archiver = require('archiver')
const { createReadStream, createWriteStream } = require('fs')

let _dataDir   = null
let _schedTimer = null

function init(dataDir) {
  _dataDir = dataDir
}

/** Create a backup ZIP containing db + config */
async function exportBackup(destPath) {
  if (!_dataDir) throw new Error('Backup not initialized')

  const output  = createWriteStream(destPath)
  const archive = archiver('zip', { zlib: { level: 6 } })

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const mb = (archive.pointer() / 1024 / 1024).toFixed(1)
      resolve({ path: destPath, sizeMb: mb })
    })
    archive.on('error', reject)
    archive.pipe(output)

    const dbPath     = path.join(_dataDir, 'airemote.db')
    const configPath = path.join(_dataDir, 'config.json')

    if (fs.existsSync(dbPath))     archive.file(dbPath, { name: 'airemote.db' })
    if (fs.existsSync(configPath)) archive.file(configPath, { name: 'config.json' })

    // Metadata
    const meta = JSON.stringify({
      version:     '3.2.0',
      created_at:  new Date().toISOString(),
      hostname:    require('os').hostname(),
    }, null, 2)
    archive.append(meta, { name: 'backup-info.json' })

    archive.finalize()
  })
}

/** Extract a backup ZIP and restore db + config */
async function importBackup(zipPath, logger) {
  if (!_dataDir) throw new Error('Backup not initialized')

  // Use Node.js built-in to unzip
  const { execFile } = require('child_process')
  const os = require('os')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-restore-'))

  return new Promise((resolve, reject) => {
    // Use PowerShell on Windows to extract zip
    const cmd  = 'powershell'
    const args = ['-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force`]

    execFile(cmd, args, { timeout: 30000 }, (err) => {
      if (err) {
        // Fallback: try 7z
        execFile('7z', ['x', zipPath, `-o${tmpDir}`, '-y'], { timeout: 30000 }, (err2) => {
          if (err2) return reject(new Error('Cannot extract ZIP: ' + (err.message || err2.message)))
          doRestore(tmpDir, resolve, reject, logger)
        })
        return
      }
      doRestore(tmpDir, resolve, reject, logger)
    })
  })
}

function doRestore(tmpDir, resolve, reject, logger) {
  try {
    const dbSrc     = path.join(tmpDir, 'airemote.db')
    const cfgSrc    = path.join(tmpDir, 'config.json')
    const metaSrc   = path.join(tmpDir, 'backup-info.json')
    const dbDest    = path.join(_dataDir, 'airemote.db')
    const cfgDest   = path.join(_dataDir, 'config.json')

    let meta = {}
    if (fs.existsSync(metaSrc)) {
      try { meta = JSON.parse(fs.readFileSync(metaSrc, 'utf8')) } catch {}
    }

    if (fs.existsSync(dbSrc))  { fs.copyFileSync(dbSrc, dbDest);   logger?.info('backup', 'Restored airemote.db') }
    if (fs.existsSync(cfgSrc)) { fs.copyFileSync(cfgSrc, cfgDest); logger?.info('backup', 'Restored config.json') }

    // Cleanup temp
    try { fs.rmSync(tmpDir, { recursive: true }) } catch {}

    resolve({ meta })
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true }) } catch {}
    reject(e)
  }
}

/** Schedule automatic backups */
function scheduleBackup(config, logger) {
  if (_schedTimer) { clearInterval(_schedTimer); _schedTimer = null }
  if (!config?.enabled || !config?.intervalHours) return

  const ms = config.intervalHours * 60 * 60 * 1000
  _schedTimer = setInterval(async () => {
    const d    = new Date().toISOString().slice(0, 10)
    const dest = path.join(config.destDir || _dataDir, `AiRemote-Backup-${d}.zip`)
    try {
      await exportBackup(dest)
      logger?.info('backup', `Auto-backup saved: ${dest}`)
    } catch (e) {
      logger?.error('backup', `Auto-backup failed: ${e.message}`)
    }
  }, ms)

  logger?.info('backup', `Auto-backup scheduled every ${config.intervalHours}h → ${config.destDir || _dataDir}`)
}

module.exports = { init, exportBackup, importBackup, scheduleBackup }
