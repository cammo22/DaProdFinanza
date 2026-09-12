import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Hashing delle password con scrypt — AGENTS.md §12 (stesso schema di IrideeCRM).
 * Formato memorizzato: `scrypt$N$r$p$saltHex$hashHex`.
 */
const N = 16384
const r = 8
const p = 1
const KEY_LENGTH = 64

export function hashPassword(plain: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(plain.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p })
  return ['scrypt', N, r, p, salt.toString('hex'), derived.toString('hex')].join('$')
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts
  const expected = Buffer.from(hashHex, 'hex')
  const derived = scryptSync(plain.normalize('NFKC'), Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw)
  })

  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/** Regola minima di robustezza: la UI mostra lo stesso messaggio. */
export const MIN_PASSWORD_LENGTH = 8

export function validatePassword(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`
  }
  return null
}
