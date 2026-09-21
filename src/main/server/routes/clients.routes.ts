import { Router } from 'express'
import {
  createClient,
  deleteClient,
  listClients,
  setClientArchived,
  updateClient
} from '../services/clients.service'
import { requireAuth, requireRole } from '../middleware/auth'

/**
 * Anagrafica Clienti — AGENTS.md §10.1.
 * Tutto il router è riservato al Consulente: l'app Azienda non vede
 * né crea clienti (§4, prima riga della tabella permessi).
 */
export const clientsRouter: Router = Router()

clientsRouter.use(requireAuth, requireRole('consultant'))

clientsRouter.get('/', (req, res) => {
  res.json(listClients(req.query.archived === 'true'))
})

clientsRouter.post('/', (req, res) => {
  res.status(201).json(createClient(req.body ?? {}))
})

clientsRouter.put('/:uuid', (req, res) => {
  res.json(updateClient(req.params.uuid, req.body ?? {}))
})

clientsRouter.post('/:uuid/archive', (req, res) => {
  res.json(setClientArchived(req.params.uuid, req.body?.archived !== false))
})

clientsRouter.delete('/:uuid', (req, res) => {
  res.json(deleteClient(req.params.uuid))
})
