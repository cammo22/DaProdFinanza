import { Router, type Request } from 'express'
import { HttpError } from '../http-error'
import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  setCompanyArchived
} from '../services/companies.service'
import { requireAuth, requireRole } from '../middleware/auth'
import { analysisRouter } from './analysis.routes'

/** Anagrafica Aziende — AGENTS.md §10.1. */
export const companiesRouter: Router = Router()

companiesRouter.use(requireAuth)

// Periodi, analisi e import vivono sotto la singola azienda.
companiesRouter.use('/:uuid', analysisRouter)

function uuidParam(req: Request): string {
  const value = req.params['uuid']
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** Il Consulente vede tutte le aziende; l'operatore Azienda solo la propria (§4). */
companiesRouter.get('/', (req, res) => {
  const all = listCompanies(req.query.archived === 'true')
  const visible =
    req.auth!.role === 'consultant'
      ? all
      : all.filter((company) => company.uuid === req.auth!.company_uuid)
  res.json(visible)
})

companiesRouter.get('/:uuid', (req, res) => {
  const uuid = uuidParam(req)
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== uuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  res.json(getCompany(uuid))
})

companiesRouter.post('/', requireRole('consultant'), (req, res) => {
  res.status(201).json(createCompany(req.body ?? {}))
})

companiesRouter.post('/:uuid/archive', requireRole('consultant'), (req, res) => {
  res.json(setCompanyArchived(uuidParam(req), req.body?.archived !== false))
})

companiesRouter.delete('/:uuid', requireRole('consultant'), (req, res) => {
  res.json(deleteCompany(uuidParam(req)))
})
