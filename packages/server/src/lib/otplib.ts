// otplib v13 uses a functional API — no `authenticator` named export
import { generateSecret as _genSecret, verifySync as _verifySync } from 'otplib'

function buildOtpauthUri(account: string, issuer: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

export const authenticator = {
  generateSecret(): string {
    return _genSecret()
  },

  keyuri(account: string, issuer: string, secret: string): string {
    return buildOtpauthUri(account, issuer, secret)
  },

  verify({ token, secret }: { token: string; secret: string }): boolean {
    try {
      // VerifyResult is an object with a `valid` boolean property in otplib v13
      const r = (_verifySync({ secret, token }) as unknown) as { valid?: boolean }
      return r?.valid === true
    } catch {
      return false
    }
  }
}
