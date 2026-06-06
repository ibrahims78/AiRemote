'use strict'
/**
 * zip-agent.js — Pure Node.js directory zipper (no external dependencies)
 * Usage: node zip-agent.js <src_dir> <dst_zip>
 */
const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

const [srcDir, dstZip] = process.argv.slice(2)
if (!srcDir || !dstZip) {
  console.error('Usage: node zip-agent.js <src_dir> <dst_zip>')
  process.exit(1)
}
if (!fs.existsSync(srcDir)) {
  console.error(`Error: source directory not found: ${srcDir}`)
  process.exit(1)
}

console.log(`Zipping ${srcDir} → ${dstZip}`)

// ── ZIP format helpers ────────────────────────────────────────────────────────

function writeUInt16LE(buf, val, offset) { buf.writeUInt16LE(val, offset) }
function writeUInt32LE(buf, val, offset) { buf.writeUInt32LE(val >>> 0, offset) }

function dosDateTime(date) {
  const d = date.getFullYear() - 1980
  const dosDate = (d << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  return { dosDate, dosTime }
}

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      t[i] = c
    }
    return t
  })())
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ── Collect all files ─────────────────────────────────────────────────────────

function walk(dir, base) {
  const entries = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel  = base ? `${base}/${name}` : name
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      entries.push(...walk(full, rel))
    } else {
      entries.push({ full, rel, stat })
    }
  }
  return entries
}

const files = walk(srcDir, '')
console.log(`  Found ${files.length} files`)

// ── Build ZIP in memory ───────────────────────────────────────────────────────

const parts       = []   // raw Buffers to concat
const centralDir  = []   // central directory entries (Buffers)
let offset        = 0

for (const { full, rel, stat } of files) {
  const rawData  = fs.readFileSync(full)
  const compData = zlib.deflateRawSync(rawData, { level: 6 })

  // Use stored (0) if compression doesn't help
  const useDeflate = compData.length < rawData.length
  const data       = useDeflate ? compData : rawData
  const method     = useDeflate ? 8 : 0   // 8=DEFLATE, 0=STORED

  const crc        = crc32(rawData)
  const { dosDate, dosTime } = dosDateTime(stat.mtime)
  const nameBytes  = Buffer.from(rel.replace(/\\/g, '/'), 'utf8')

  // Local file header (30 bytes + name)
  const local = Buffer.alloc(30 + nameBytes.length)
  writeUInt32LE(local, 0x04034B50, 0)   // signature
  writeUInt16LE(local, 20, 4)            // version needed
  writeUInt16LE(local, 0, 6)             // flags
  writeUInt16LE(local, method, 8)        // compression
  writeUInt16LE(local, dosTime, 10)
  writeUInt16LE(local, dosDate, 12)
  writeUInt32LE(local, crc, 14)
  writeUInt32LE(local, data.length, 18)  // compressed size
  writeUInt32LE(local, rawData.length, 22) // uncompressed size
  writeUInt16LE(local, nameBytes.length, 26)
  writeUInt16LE(local, 0, 28)            // extra field length
  nameBytes.copy(local, 30)

  parts.push(local, data)

  // Central directory entry (46 bytes + name)
  const cent = Buffer.alloc(46 + nameBytes.length)
  writeUInt32LE(cent, 0x02014B50, 0)    // signature
  writeUInt16LE(cent, 20, 4)             // version made by
  writeUInt16LE(cent, 20, 6)             // version needed
  writeUInt16LE(cent, 0, 8)              // flags
  writeUInt16LE(cent, method, 10)
  writeUInt16LE(cent, dosTime, 12)
  writeUInt16LE(cent, dosDate, 14)
  writeUInt32LE(cent, crc, 16)
  writeUInt32LE(cent, data.length, 20)   // compressed size
  writeUInt32LE(cent, rawData.length, 24) // uncompressed size
  writeUInt16LE(cent, nameBytes.length, 28)
  writeUInt16LE(cent, 0, 30)             // extra length
  writeUInt16LE(cent, 0, 32)             // comment length
  writeUInt16LE(cent, 0, 34)             // disk number start
  writeUInt16LE(cent, 0, 36)             // internal attributes
  writeUInt32LE(cent, 0, 38)             // external attributes
  writeUInt32LE(cent, offset, 42)        // local header offset
  nameBytes.copy(cent, 46)

  centralDir.push(cent)
  offset += local.length + data.length
}

// Central directory + EOCD
const cdBuf   = Buffer.concat(centralDir)
const cdSize  = cdBuf.length
const cdStart = offset

const eocd = Buffer.alloc(22)
writeUInt32LE(eocd, 0x06054B50, 0)     // signature
writeUInt16LE(eocd, 0, 4)               // disk number
writeUInt16LE(eocd, 0, 6)               // central dir start disk
writeUInt16LE(eocd, files.length, 8)    // entries on disk
writeUInt16LE(eocd, files.length, 10)   // total entries
writeUInt32LE(eocd, cdSize, 12)         // central dir size
writeUInt32LE(eocd, cdStart, 16)        // central dir offset
writeUInt16LE(eocd, 0, 20)              // comment length

fs.mkdirSync(path.dirname(dstZip), { recursive: true })
fs.writeFileSync(dstZip, Buffer.concat([...parts, cdBuf, eocd]))

const sizeMb = (fs.statSync(dstZip).size / 1024 / 1024).toFixed(1)
console.log(`Done: ${sizeMb} MB → ${dstZip}`)
