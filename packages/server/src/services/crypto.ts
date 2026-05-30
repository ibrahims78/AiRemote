import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const k = process.env.CREDENTIALS_KEY
  if (!k) {
    // In dev, derive a deterministic key from JWT_SECRET so nothing is stored in plaintext
    const seed = process.env.JWT_SECRET || 'airemote-dev-credentials-key-fallback'
    return crypto.createHash('sha256').update(seed).digest()
  }
  return crypto.createHash('sha256').update(k).digest()
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv  = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')
  const [ivHex, tagHex, dataHex] = parts
  const key     = getKey()
  const iv      = Buffer.from(ivHex, 'hex')
  const tag     = Buffer.from(tagHex, 'hex')
  const data    = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}
