import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'
import {
  deleteMarginItem,
  deleteMaterial,
  getMarginSettings,
  listMarginItems,
  listMaterials,
  manodoperaDalPersonale,
  saveMarginItem,
  saveMarginSettings,
  saveMaterial
} from '../services/marginalita.service'

/**
 * Marginalità di un'azienda — AGENTS.md §10.18. L'azienda la vede (in
 * lettura) se il consulente l'ha condivisa; scrivere resta al consulente.
 */
export const marginalitaRouter: Router = Router({ mergeParams: true })

marginalitaRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

const consulente = requireRole('consultant')

marginalitaRouter.get('/marginalita', vistaAzienda('marginalita'), (req, res) => {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  const manodopera = manodoperaDalPersonale(companyUuid)
  res.json({
    settings: getMarginSettings(companyUuid),
    materials: listMaterials(companyUuid),
    items: listMarginItems(companyUuid),
    // Le paghe per persona le vede solo il consulente.
    personale: req.auth!.role === 'consultant' ? manodopera : { costoOrarioDiretti: manodopera.costoOrarioDiretti, persone: [] }
  })
})

marginalitaRouter.put('/marginalita/settings', consulente, (req, res) => {
  res.json(saveMarginSettings(param(req, 'uuid'), req.body ?? {}))
})

marginalitaRouter.post('/margin-materials', consulente, (req, res) => {
  res.status(201).json(saveMaterial(param(req, 'uuid'), req.body ?? {}))
})

marginalitaRouter.put('/margin-materials/:id', consulente, (req, res) => {
  res.json(saveMaterial(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})

marginalitaRouter.delete('/margin-materials/:id', consulente, (req, res) => {
  res.json(deleteMaterial(param(req, 'uuid'), param(req, 'id')))
})

marginalitaRouter.post('/margin-items', consulente, (req, res) => {
  res.status(201).json(saveMarginItem(param(req, 'uuid'), req.body ?? {}))
})

marginalitaRouter.put('/margin-items/:id', consulente, (req, res) => {
  res.json(saveMarginItem(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})

marginalitaRouter.delete('/margin-items/:id', consulente, (req, res) => {
  res.json(deleteMarginItem(param(req, 'uuid'), param(req, 'id')))
})
