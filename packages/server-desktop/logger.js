'use strict'
/**
 * logger.js — Professional logging system for AiRemote Server Desktop
 * - Daily log files with auto-rotation (14 days, 50 MB max)
 * - Console + file output
 * - In-memory ring buffer for UI display
 */
const fs   = require('fs')
const path = require('path')

const MAX_DAYS        = 14
const MAX_SIZE_BYTES  = 50 * 1024 * 1024  // 50 MB
const RING_SIZE       = 500               // lines kept in memory for UI

let logDir    = null
let logStream = null
let logDate   = null
const ring    = []   // { ts, level, tag, msg }
const listeners = [] // (entry) => void

function ts() {
  return new Date().toISOString().replace('T', ' ').replace(/Z$/, '')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function getLogPath(date) {
  return path.join(logDir, `server-${date}.log`)
}

function openStream(date) {
  if (logStream) { try { logStream.end() } catch {} }
  const p = getLogPath(date)
  logStream = fs.createWriteStream(p, { flags: 'a', encoding: 'utf8' })
  logDate   = date
}

function rotateLogs() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - MAX_DAYS)
  try {
    const files = fs.readdirSync(logDir).filter(f => f.startsWith('server-') && f.endsWith('.log'))
    for (const f of files) {
      const d = f.replace('server-', '').replace('.log', '')
      if (new Date(d) < cutoff) {
        try { fs.unlinkSync(path.join(logDir, f)) } catch {}
      }
    }
  } catch {}
}

function checkRotate() {
  const d = today()
  if (d !== logDate) {
    openStream(d)
    rotateLogs()
    return
  }
  try {
    const stat = fs.statSync(getLogPath(d))
    if (stat.size >= MAX_SIZE_BYTES) {
      openStream(`${d}-${Date.now()}`)
    }
  } catch {}
}

/** Initialize logger. Must be called before first log(). */
function init(dataDir) {
  logDir = path.join(dataDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  openStream(today())
  rotateLogs()
}

const ICONS = { info: '●', warn: '⚠', error: '✖', debug: '·' }

/** Write a log entry. */
function log(level, tag, msg) {
  const now   = ts()
  const icon  = ICONS[level] || '●'
  const line  = `[${now}] [${level.toUpperCase().padEnd(5)}] [${tag.padEnd(10)}] ${icon} ${msg}`

  // Console
  if (level === 'error') process.stderr.write(line + '\n')
  else                   process.stdout.write(line + '\n')

  // File
  checkRotate()
  if (logStream) { try { logStream.write(line + '\n') } catch {} }

  // Ring buffer
  const entry = { ts: now, level, tag, msg }
  ring.push(entry)
  if (ring.length > RING_SIZE) ring.shift()

  // Notify live listeners (e.g. for IPC broadcast to renderer)
  for (const cb of listeners) { try { cb(entry) } catch {} }
}

/** Convenience methods */
const info  = (tag, msg) => log('info',  tag, msg)
const warn  = (tag, msg) => log('warn',  tag, msg)
const error = (tag, msg) => log('error', tag, msg)
const debug = (tag, msg) => log('debug', tag, msg)

/** Subscribe to new log entries in real-time (returns unsubscribe function) */
function subscribe(cb) {
  listeners.push(cb)
  return () => {
    const idx = listeners.indexOf(cb)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}

/** Get recent N log entries for UI display */
function getRecent(n = 200) {
  return ring.slice(-n)
}

/** Export all logs from today to a string */
function exportToday() {
  try {
    return fs.readFileSync(getLogPath(today()), 'utf8')
  } catch { return '' }
}

/** Export all log files as a zip to destPath */
async function exportAllLogs(destPath) {
  const archiver = require('archiver')
  const output   = fs.createWriteStream(destPath)
  const archive  = archiver('zip', { zlib: { level: 6 } })
  return new Promise((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    try {
      const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'))
      for (const f of files) archive.file(path.join(logDir, f), { name: f })
    } catch {}
    archive.finalize()
  })
}

module.exports = { init, log, info, warn, error, debug, getRecent, exportToday, exportAllLogs, subscribe }
