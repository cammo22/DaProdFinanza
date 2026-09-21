import type { Request } from 'express'
import { getProfile } from '../services/auth.service'
import type { Attore } from '../services/requests.service'

/**
 * Chi sta facendo l'operazione, col nome di adesso: quello nel token può
 * essere vecchio di ore (il profilo si può rinominare), e nella storia di una
 * richiesta deve finire il nome giusto.
 */
export function attore(req: Request): Attore {
  const p = getProfile(req.auth!.sub)
  return { uuid: p.uuid, name: p.full_name, role: p.role }
}

export function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}
