'use strict'
/**
 * download-cloudflared.js
 * Downloads the Windows x64 cloudflared binary for the server-desktop app.
 * Run: node scripts/download-cloudflared.js
 */
const https = require('https')
const fs    = require('fs')
const path  = require('path')

const BIN_DIR = path.join(__dirname, '..', 'packages', 'server-desktop', 'bin')
const DEST    = path.join(BIN_DIR, 'cloudflared.exe')
const URL     = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

fs.mkdirSync(BIN_DIR, { recursive: true })

if (fs.existsSync(DEST)) {
  const size = fs.statSync(DEST).size
  console.log(`✅ cloudflared.exe already exists (${(size/1024/1024).toFixed(1)} MB) — skip download`)
  process.exit(0)
}

console.log('⬇  Downloading cloudflared Windows x64...')
console.log(`   URL: ${URL}`)

function download(url, dest, redirectCount = 0) {
  if (redirectCount > 5) { console.error('Too many redirects'); process.exit(1) }
  https.get(url, { headers: { 'User-Agent': 'AiRemote-Build/3.2.0' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log(`   → Redirect: ${res.headers.location}`)
      return download(res.headers.location, dest, redirectCount + 1)
    }
    if (res.statusCode !== 200) {
      console.error(`   ✖ HTTP ${res.statusCode}`)
      process.exit(1)
    }

    const total  = parseInt(res.headers['content-length'] || '0', 10)
    let received = 0
    const file   = fs.createWriteStream(dest)

    res.on('data', (chunk) => {
      received += chunk.length
      if (total) {
        const pct = Math.floor(received / total * 100)
        process.stdout.write(`\r   ${pct}% (${(received/1024/1024).toFixed(1)} MB)`)
      }
    })

    res.pipe(file)
    file.on('finish', () => {
      file.close()
      const size = fs.statSync(dest).size
      console.log(`\n✅ Downloaded cloudflared.exe (${(size/1024/1024).toFixed(1)} MB) → ${dest}`)
    })
    res.on('error', (e) => { console.error('\n✖ ' + e.message); fs.unlinkSync(dest); process.exit(1) })
  }).on('error', (e) => { console.error('✖ ' + e.message); process.exit(1) })
}

download(URL, DEST)
