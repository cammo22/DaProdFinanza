import { Router, type Request } from 'express'
import type { Scenario } from '@shared/types'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'
import {
  createItem,
  deleteItem,
  registerPayment,
  treasuryView,
  updateItem,
  updateSettings
} from '../services/treasury.service'
import { workingCapitalView } from '../services/working-capital.service'

/**
 * Capitale circolante, tesoreria e scadenziario di un'azienda — §10.5-§10.6.
 *
 * L'operatore Azienda legge; scrivere scadenze e previsioni resta al
 * Consulente finché non è chiarito AGENTS.md §14 punto 4 (autonomia dell'app
 * Azienda), che cambia il modello di sincronizzazione.
 */
export const treasuryRouter: Router = Router({ mergeParams: true })

treasuryRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function assertCanRead(req: Request): string {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  return companyUuid
}

// Per l'operatore Azienda, solo le sezioni che il consulente gli ha acceso (§10.12).
treasuryRouter.get('/periods/:periodUuid/working-capital', vistaAzienda('capitale-circolante'), (req, res) => {
  res.json(
    workingCapitalView(assertCanRead(req), param(req, 'periodUuid'), {
      scenario: (req.query.scenario as Scenario) ?? undefined
    })
  )
})

// La Panoramica mostra la liquidità prevista: le serve la stessa previsione.
treasuryRouter.get('/treasury', vistaAzienda('tesoreria', 'panoramica'), (req, res) => {
  res.json(treasuryView(assertCanRead(req)))
})

treasuryRouter.post('/treasury/items', requireRole('consultant'), (req, res) => {
  res.status(201).json(createItem(param(req, 'uuid'), req.body ?? {}))
})

treasuryRouter.put('/treasury/items/:itemUuid', requireRole('consultant'), (req, res) => {
  res.json(updateItem(param(req, 'uuid'), param(req, 'itemUuid'), req.body ?? {}))
})

treasuryRouter.post('/treasury/items/:itemUuid/payments', requireRole('consultant'), (req, res) => {
  res.json(registerPayment(param(req, 'uuid'), param(req, 'itemUuid'), req.body ?? {}))
})

treasuryRouter.delete('/treasury/items/:itemUuid', requireRole('consultant'), (req, res) => {
  res.json(deleteItem(param(req, 'uuid'), param(req, 'itemUuid')))
})

treasuryRouter.put('/treasury/settings', requireRole('consultant'), (req, res) => {
  res.json(updateSettings(param(req, 'uuid'), req.body ?? {}))
})
