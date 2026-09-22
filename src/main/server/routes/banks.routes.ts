import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
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

// L'operatore Azienda legge solo se il consulente gli ha acceso la sezione (§10.12).
banksRouter.get('/banking', vistaAzienda('banche'), (req, res) => {
  res.json(bankingView(param(req, 'uuid'), todayLocal()))
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
