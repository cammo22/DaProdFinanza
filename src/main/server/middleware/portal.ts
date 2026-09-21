import type { NextFunction, Request, Response } from 'express'
import {
  permessiAzienda,
  visteAzienda,
  type VistaCondivisibile
} from '@shared/settings'
import { HttpError } from '../http-error'
import { getAppSettings, getPortalSettings } from '../services/settings.service'

/**
 * Cosa vede l'operatore Azienda — AGENTS.md §4 e §10.12.
 *
 * I consulenti sono gli amministratori: vedono tutto. Un'azienda vede la
 * propria azienda e, dentro, solo le sezioni che il consulente le ha acceso.
 * Il controllo sta qui, sul server, non solo nel menu: una sezione spenta
 * risponde 403 anche a chi la chiede a mano.
 */

function companyParam(req: Request): string {
  const value = req.params['uuid']
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

const NON_CONDIVISA = 'Il consulente non ha condiviso questa sezione con la tua azienda.'

/** Passa il Consulente; l'Azienda solo se almeno una delle viste indicate è accesa per lei. */
export function vistaAzienda(...viste: VistaCondivisibile[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth
    if (!auth) return next(new HttpError(401, 'Autenticazione richiesta.'))
    if (auth.role === 'consultant') return next()
    const companyUuid = companyParam(req)
    if (auth.company_uuid !== companyUuid) {
      return next(new HttpError(403, 'Operazione non consentita per questo ruolo.'))
    }
    const visibili = visteAzienda(getPortalSettings(companyUuid), getAppSettings())
    if (!viste.some((v) => visibili.includes(v))) return next(new HttpError(403, NON_CONDIVISA))
    next()
  }
}

type Permesso = keyof ReturnType<typeof permessiAzienda>

/** Come sopra, per quello che l'azienda può fare: mandare file, chiedere chiamate… */
export function permessoAzienda(permesso: Permesso, messaggio: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth
    if (!auth) return next(new HttpError(401, 'Autenticazione richiesta.'))
    if (auth.role === 'consultant') return next()
    const companyUuid = companyParam(req)
    if (auth.company_uuid !== companyUuid) {
      return next(new HttpError(403, 'Operazione non consentita per questo ruolo.'))
    }
    const permessi = permessiAzienda(getPortalSettings(companyUuid), getAppSettings())
    if (!permessi[permesso]) return next(new HttpError(403, messaggio))
    next()
  }
}
