import jwt from 'jsonwebtoken'
import type { Role } from '@shared/enums'
import type { SessionUser } from '@shared/types'
import { jwtSecret } from './secrets'

/** Sessione JWT con ruolo embedded — AGENTS.md §2/§12. */
const EXPIRES_IN = '12h'
const ISSUER = 'daprodfinanza'

export interface TokenPayload {
  sub: string
  username: string
  full_name: string
  role: Role
  company_uuid: string | null
}

export function signToken(user: SessionUser): string {
  const payload: TokenPayload = {
    sub: user.uuid,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    company_uuid: user.company_uuid
  }
  return jwt.sign(payload, jwtSecret(), { expiresIn: EXPIRES_IN, issuer: ISSUER })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, jwtSecret(), { issuer: ISSUER }) as TokenPayload
  } catch {
    return null
  }
}
