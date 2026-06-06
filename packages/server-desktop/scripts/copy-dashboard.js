'use strict'
/**
 * copy-dashboard.js — copies built React dashboard into server-desktop/static/
 * Run after: pnpm --filter @airemote/dashboard build
 */
const fs   = require('fs')
const path = require('path')

const ROOT    = path.resolve(__dirname, '../../..')
const SRC     = path.join(ROOT, 'packages', 'dashboard', 'dist')
const DEST    = path.join(__dirname, '..', 'static')

if (!fs.existsSync(SRC)) {
  console.error(`❌ Dashboard build not found at: ${SRC}`)
  console.error('   Run: pnpm --filter @airemote/dashboard build')
  process.exit(1)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

console.log(`📋 Copying dashboard from: ${SRC}`)
console.log(`📂 Destination: ${DEST}`)

if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true })
}

copyDir(SRC, DEST)
const files = fs.readdirSync(DEST)
console.log(`✅ Dashboard copied: ${files.length} items`)
