import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@shared/enums'
import { verifyToken, type TokenPayload } from '../../lib/tokens'
import { HttpError } from '../http-error'
import { isUserActive } from '../services/auth.service'

declare module 'express-serve-static-core' {
  interface Request {
    auth?: TokenPayload
  }
}

/** Richiede un JWT valido nell'header `Authorization: Bearer <token>`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(new HttpError(401, 'Autenticazione richiesta.'))
  }

  const payload = verifyToken(token)
  if (!payload) return next(new HttpError(401, 'Sessione scaduta o non valida.'))
  // Un accesso disattivato da un consulente smette di funzionare subito, non
  // fra dodici ore alla scadenza della sessione.
  if (!isUserActive(payload.sub)) {
    return next(new HttpError(401, 'Questo accesso è stato disattivato da un consulente dello studio.'))
  }

  req.auth = payload
  next()
}

/** Gating di ruolo — AGENTS.md §4. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new HttpError(401, 'Autenticazione richiesta.'))
    if (!roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'Operazione non consentita per questo ruolo.'))
    }
    next()
  }
}
