// ── Session Recording Service (v3.0.0) ────────────────────────────────────────
// Records screen session frames in memory and allows export as a ZIP of JPEGs.
// Frames are stored as raw Buffer objects to avoid double base64 encoding overhead.

interface RecordingFrame {
  seq:   number
  ts:    number
  data:  Buffer   // raw JPEG bytes
  width: number
  height: number
}

interface Recording {
  sessionId:  string
  deviceId:   string
  userId:     string
  startedAt:  number
  stoppedAt:  number | null
  frames:     RecordingFrame[]
  maxFrames:  number
  active:     boolean
  bytesSaved: number
}

// Active and completed recordings (kept until explicitly deleted)
const recordings = new Map<string, Recording>()

// Max frames per recording to cap memory usage (~500 frames × 50KB avg = ~25MB per recording)
const DEFAULT_MAX_FRAMES = 600

export function startRecording(
  sessionId: string,
  deviceId:  string,
  userId:    string,
  maxFrames  = DEFAULT_MAX_FRAMES
): void {
  if (recordings.has(sessionId)) return
  recordings.set(sessionId, {
    sessionId,
    deviceId,
    userId,
    startedAt:  Date.now(),
    stoppedAt:  null,
    frames:     [],
    maxFrames,
    active:     true,
    bytesSaved: 0
  })
  console.log(`🎥 Recording started: session=${sessionId}`)
}

export function stopRecording(sessionId: string): RecordingMeta | null {
  const rec = recordings.get(sessionId)
  if (!rec) return null
  rec.active    = false
  rec.stoppedAt = Date.now()
  const meta    = getRecordingMeta(sessionId)!
  console.log(`🎥 Recording stopped: session=${sessionId} frames=${rec.frames.length}`)
  return meta
}

export function isRecording(sessionId: string): boolean {
  return recordings.get(sessionId)?.active === true
}

export function addFrame(sessionId: string, data: Buffer, width: number, height: number, seq: number): void {
  const rec = recordings.get(sessionId)
  if (!rec || !rec.active) return

  // Circular buffer: drop oldest frame when at capacity
  if (rec.frames.length >= rec.maxFrames) {
    const dropped = rec.frames.shift()
    if (dropped) rec.bytesSaved += dropped.data.length
  }

  rec.frames.push({ seq, ts: Date.now(), data, width, height })
}

export interface RecordingMeta {
  sessionId:    string
  deviceId:     string
  userId:       string
  startedAt:    number
  stoppedAt:    number | null
  frameCount:   number
  durationSec:  number
  totalBytes:   number
  active:       boolean
}

export function getRecordingMeta(sessionId: string): RecordingMeta | null {
  const rec = recordings.get(sessionId)
  if (!rec) return null
  const totalBytes = rec.frames.reduce((a, f) => a + f.data.length, 0) + rec.bytesSaved
  return {
    sessionId:   rec.sessionId,
    deviceId:    rec.deviceId,
    userId:      rec.userId,
    startedAt:   rec.startedAt,
    stoppedAt:   rec.stoppedAt,
    frameCount:  rec.frames.length,
    durationSec: Math.round(((rec.stoppedAt ?? Date.now()) - rec.startedAt) / 1000),
    totalBytes,
    active:      rec.active
  }
}

// Export as ZIP (Node.js built-in zlib — no extra deps needed)
// Returns a Buffer containing a ZIP archive of all frames as JPEG files.
export async function exportRecordingAsZip(sessionId: string): Promise<Buffer | null> {
  const rec = recordings.get(sessionId)
  if (!rec || rec.frames.length === 0) return null

  // Build a ZIP file manually (stored, not deflated — JPEGs don't compress well)
  // ZIP format: local file headers + data + central directory + end of central directory
  const parts: Buffer[] = []
  const centralDir: Buffer[] = []
  let offset = 0

  const encodeStr = (s: string) => Buffer.from(s, 'utf8')

  for (const frame of rec.frames) {
    const name    = encodeStr(`frame_${String(frame.seq).padStart(6, '0')}_${frame.ts}.jpg`)
    const data    = frame.data
    const crc     = crc32(data)
    const now     = dosDateTime(new Date(frame.ts))

    // Local file header
    const localHeader = Buffer.allocUnsafe(30 + name.length)
    localHeader.writeUInt32LE(0x04034b50, 0)  // signature
    localHeader.writeUInt16LE(20,           4)  // version needed
    localHeader.writeUInt16LE(0,            6)  // flags
    localHeader.writeUInt16LE(0,            8)  // compression (stored)
    localHeader.writeUInt16LE(now.time,    10)  // mod time
    localHeader.writeUInt16LE(now.date,    12)  // mod date
    localHeader.writeUInt32LE(crc,         14)  // CRC-32
    localHeader.writeUInt32LE(data.length, 18)  // compressed size
    localHeader.writeUInt32LE(data.length, 22)  // uncompressed size
    localHeader.writeUInt16LE(name.length, 26)  // filename length
    localHeader.writeUInt16LE(0,           28)  // extra field length
    name.copy(localHeader, 30)
    parts.push(localHeader, data)

    // Central directory record
    const cdRecord = Buffer.allocUnsafe(46 + name.length)
    cdRecord.writeUInt32LE(0x02014b50, 0)   // signature
    cdRecord.writeUInt16LE(20,          4)   // version made
    cdRecord.writeUInt16LE(20,          6)   // version needed
    cdRecord.writeUInt16LE(0,           8)   // flags
    cdRecord.writeUInt16LE(0,          10)   // compression
    cdRecord.writeUInt16LE(now.time,   12)   // mod time
    cdRecord.writeUInt16LE(now.date,   14)   // mod date
    cdRecord.writeUInt32LE(crc,        16)   // CRC-32
    cdRecord.writeUInt32LE(data.length, 20)  // compressed size
    cdRecord.writeUInt32LE(data.length, 24)  // uncompressed size
    cdRecord.writeUInt16LE(name.length, 28)  // filename length
    cdRecord.writeUInt16LE(0,           30)  // extra length
    cdRecord.writeUInt16LE(0,           32)  // comment length
    cdRecord.writeUInt16LE(0,           34)  // disk start
    cdRecord.writeUInt16LE(0,           36)  // internal attr
    cdRecord.writeUInt32LE(0,           38)  // external attr
    cdRecord.writeUInt32LE(offset,      42)  // local header offset
    name.copy(cdRecord, 46)
    centralDir.push(cdRecord)

    offset += 30 + name.length + data.length
  }

  const cdBuf   = Buffer.concat(centralDir)
  const cdStart = offset

  // End of central directory
  const eocd = Buffer.allocUnsafe(22)
  eocd.writeUInt32LE(0x06054b50,          0)
  eocd.writeUInt16LE(0,                   4)
  eocd.writeUInt16LE(0,                   6)
  eocd.writeUInt16LE(rec.frames.length,   8)
  eocd.writeUInt16LE(rec.frames.length,  10)
  eocd.writeUInt32LE(cdBuf.length,       12)
  eocd.writeUInt32LE(cdStart,            16)
  eocd.writeUInt16LE(0,                  20)

  return Buffer.concat([...parts, cdBuf, eocd])
}

export function deleteRecording(sessionId: string): void {
  recordings.delete(sessionId)
}

export function listRecordings(): RecordingMeta[] {
  return [...recordings.values()].map(rec => getRecordingMeta(rec.sessionId)!).filter(Boolean)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buf) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : (crc >>> 1)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}
