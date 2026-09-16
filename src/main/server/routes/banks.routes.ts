import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { HttpError } from '../http-error'
import {
  bankingView,
  deleteBank,
  deleteLine,
  deleteLoan,
  saveBank,
  saveLine,
  saveLoan
} from '../services/banks.service'
import { todayLocal } from '../services/treasury.service'

/**
 * Banche e finanziamenti di un'azienda — AGENTS.md §10.7. Come per la
 * tesoreria, l'operatore Azienda legge e il Consulente scrive.
 */
export const banksRouter: Router = Router({ mergeParams: true })

banksRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

banksRouter.get('/banking', (req, res) => {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  res.json(bankingView(companyUuid, todayLocal()))
})

const scrittura = requireRole('consultant')

banksRouter.post('/banks', scrittura, (req, res) => {
  res.status(201).json(saveBank(param(req, 'uuid'), req.body ?? {}))
})
banksRouter.put('/banks/:id', scrittura, (req, res) => {
  res.json(saveBank(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})
banksRouter.delete('/banks/:id', scrittura, (req, res) => {
  res.json(deleteBank(param(req, 'uuid'), param(req, 'id')))
})

banksRouter.post('/credit-lines', scrittura, (req, res) => {
  res.status(201).json(saveLine(param(req, 'uuid'), req.body ?? {}))
})
banksRouter.put('/credit-lines/:id', scrittura, (req, res) => {
  res.json(saveLine(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})
banksRouter.delete('/credit-lines/:id', scrittura, (req, res) => {
  res.json(deleteLine(param(req, 'uuid'), param(req, 'id')))
})

banksRouter.post('/loans', scrittura, (req, res) => {
  res.status(201).json(saveLoan(param(req, 'uuid'), req.body ?? {}))
})
banksRouter.put('/loans/:id', scrittura, (req, res) => {
  res.json(saveLoan(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})
banksRouter.delete('/loans/:id', scrittura, (req, res) => {
  res.json(deleteLoan(param(req, 'uuid'), param(req, 'id')))
})
