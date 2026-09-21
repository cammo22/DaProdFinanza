import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'
import { contoEconomicoRecente } from '../services/bilancio.service'
import {
  deleteEmployee,
  getPersonaleSettings,
  listEmployees,
  saveEmployee,
  savePersonaleSettings
} from '../services/personale.service'

/**
 * Personale di un'azienda — AGENTS.md §10.16. L'azienda lo vede solo se il
 * consulente l'ha condiviso (sono stipendi: di partenza no); scrivere resta
 * al consulente.
 */
export const personaleRouter: Router = Router({ mergeParams: true })

personaleRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function azienda(req: Request): string {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  return companyUuid
}

personaleRouter.get('/personale', vistaAzienda('personale'), (req, res) => {
  const companyUuid = azienda(req)
  const ce = contoEconomicoRecente(companyUuid)
  res.json({
    employees: listEmployees(companyUuid),
    settings: getPersonaleSettings(companyUuid),
    // Per confrontare il costo calcolato con quello scritto nel bilancio.
    bilancio: ce
      ? { label: ce.label, costiPersonale: ce.aggregates.costiPersonale, ricavi: ce.aggregates.ricaviOperativi }
      : null
  })
})

personaleRouter.put('/personale/settings', requireRole('consultant'), (req, res) => {
  res.json(savePersonaleSettings(param(req, 'uuid'), req.body ?? {}))
})

personaleRouter.post('/employees', requireRole('consultant'), (req, res) => {
  res.status(201).json(saveEmployee(param(req, 'uuid'), req.body ?? {}))
})

personaleRouter.put('/employees/:id', requireRole('consultant'), (req, res) => {
  res.json(saveEmployee(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})

personaleRouter.delete('/employees/:id', requireRole('consultant'), (req, res) => {
  res.json(deleteEmployee(param(req, 'uuid'), param(req, 'id')))
})
