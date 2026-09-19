import { scrypt } from '@noble/hashes/scrypt.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

/**
 * `node:crypto` quanto basta al backend, per la versione Android: UUID e
 * numeri casuali dal browser, scrypt e SHA-256 da @noble/hashes. Le password
 * restano nello stesso formato del programma per computer.
 */

/** Un Uint8Array che sa diventare esadecimale come un Buffer di Node. */
export class Bytes extends Uint8Array {
  override toString(encoding?: string): string {
    if (encoding === 'hex') return bytesToHex(this)
    return new TextDecoder().decode(this)
  }
}

/** Solo `Buffer.from(hex, 'hex')`: l'unico uso nel backend (password.ts). */
export const Buffer = {
  from(data: string, encoding?: string): Bytes {
    return new Bytes(encoding === 'hex' ? hexToBytes(data) : new TextEncoder().encode(data))
  }
}

export function randomUUID(): string {
  return crypto.randomUUID()
}

export function randomBytes(n: number): Bytes {
  const out = new Bytes(n)
  crypto.getRandomValues(out)
  return out
}

export function scryptSync(
  password: string,
  salt: Uint8Array,
  keylen: number,
  opts: { N: number; r: number; p: number }
): Bytes {
  return new Bytes(scrypt(new TextEncoder().encode(password), salt, { ...opts, dkLen: keylen }))
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function createHash(_algo: string) {
  const parti: Uint8Array[] = []
  const h = {
    update(data: string | Uint8Array) {
      parti.push(typeof data === 'string' ? new TextEncoder().encode(data) : data)
      return h
    },
    digest(encoding?: string): string | Bytes {
      const tot = new Uint8Array(parti.reduce((s, p) => s + p.length, 0))
      let o = 0
      for (const p of parti) {
        tot.set(p, o)
        o += p.length
      }
      const out = new Bytes(sha256(tot))
      return encoding === 'hex' ? bytesToHex(out) : out
    }
  }
  return h
}

export default { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash }
