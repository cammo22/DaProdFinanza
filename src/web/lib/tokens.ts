import type { Role } from '@shared/enums'
import type { SessionUser } from '@shared/types'

/**
 * Al posto di `src/main/lib/tokens.ts` nella versione Android. Il "server" vive
 * nella stessa pagina dell'interfaccia, quindi non c'è niente da firmare: una
 * sessione è un identificativo casuale che punta all'utente, in memoria.
 * Chiudendo l'app si esce, come con un JWT scaduto.
 */
const DURATA_MS = 12 * 60 * 60 * 1000

export interface TokenPayload {
  sub: string
  username: string
  full_name: string
  role: Role
  company_uuid: string | null
}

const sessioni = new Map<string, { payload: TokenPayload; scade: number }>()

export function signToken(user: SessionUser): string {
  const token = crypto.randomUUID()
  sessioni.set(token, {
    payload: {
      sub: user.uuid,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      company_uuid: user.company_uuid
    },
    scade: Date.now() + DURATA_MS
  })
  return token
}

export function verifyToken(token: string): TokenPayload | null {
  const s = sessioni.get(token)
  if (!s || s.scade < Date.now()) return null
  return s.payload
}
