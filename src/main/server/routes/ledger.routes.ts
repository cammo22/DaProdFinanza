import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'
import {
  createStarterChart,
  deleteAccount,
  deletePeriod,
  getBalances,
  listAccounts,
  saveAccount,
  saveBalances,
  setPeriodClosed
} from '../services/ledger.service'

/**
 * Piano dei conti e saldi inseriti nel programma. Come per il resto, l'operatore
 * Azienda legge i propri dati e il Consulente scrive.
 */
export const ledgerRouter: Router = Router({ mergeParams: true })

ledgerRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function lettura(req: Request): string {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  return companyUuid
}

const scrittura = requireRole('consultant')
// Conti e saldi grezzi: per l'operatore Azienda solo se vede i prospetti (§10.12).
const prospetti = vistaAzienda('conto-economico', 'stato-patrimoniale')

ledgerRouter.get('/accounts', prospetti, (req, res) => {
  res.json(listAccounts(lettura(req)))
})
ledgerRouter.post('/accounts', scrittura, (req, res) => {
  res.status(201).json(saveAccount(param(req, 'uuid'), req.body ?? {}))
})
ledgerRouter.post('/accounts/starter', scrittura, (req, res) => {
  res.status(201).json(createStarterChart(param(req, 'uuid')))
})
ledgerRouter.put('/accounts/:id', scrittura, (req, res) => {
  res.json(saveAccount(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})
ledgerRouter.delete('/accounts/:id', scrittura, (req, res) => {
  res.json(deleteAccount(param(req, 'uuid'), param(req, 'id')))
})

ledgerRouter.get('/balances', prospetti, (req, res) => {
  res.json(getBalances(lettura(req), req.query))
})
ledgerRouter.put('/balances', scrittura, (req, res) => {
  res.json(saveBalances(param(req, 'uuid'), req.body ?? {}))
})

ledgerRouter.post('/periods/:periodUuid/close', scrittura, (req, res) => {
  res.json(setPeriodClosed(param(req, 'uuid'), param(req, 'periodUuid'), req.body?.closed !== false))
})
ledgerRouter.delete('/periods/:periodUuid', scrittura, (req, res) => {
  res.json(deletePeriod(param(req, 'uuid'), param(req, 'periodUuid')))
})
