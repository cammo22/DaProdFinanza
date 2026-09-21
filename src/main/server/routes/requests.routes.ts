import { Router } from 'express'
import { permessiAzienda } from '@shared/settings'
import { requireAuth, requireRole } from '../middleware/auth'
import { permessoAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'
import {
  addMessage,
  createRequest,
  inboxSummary,
  listAllRequests,
  listRequests,
  openRequest,
  requestAction,
  unreadByCompany
} from '../services/requests.service'
import { getAppSettings, getPortalSettings } from '../services/settings.service'
import { attore, param } from './attore'

/**
 * Richieste e chiamate di un'azienda — AGENTS.md §10.14.
 *
 * L'azienda apre richieste secondo quello che il consulente le permette
 * (chiamate, domande, documenti) e vede a che punto sono; lo studio risponde
 * e usa i pulsanti della chiamata. Il campanello (`/api/inbox`) dice a
 * entrambi se c'è qualcosa di nuovo.
 */
export const requestsRouter: Router = Router({ mergeParams: true })

requestsRouter.use(requireAuth)

const lettura = permessoAzienda('richieste', 'Le richieste non sono attive.')

requestsRouter.get('/requests', lettura, (req, res) => {
  res.json(listRequests(param(req, 'uuid'), { aperte: req.query.aperte === 'true' }))
})

requestsRouter.post('/requests', lettura, (req, res) => {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company') {
    // Ogni tipo di richiesta ha il suo interruttore nelle impostazioni dell'azienda.
    const permessi = permessiAzienda(getPortalSettings(companyUuid), getAppSettings())
    const kind = req.body?.kind
    const ok =
      kind === 'chiamata'
        ? permessi.richiedereChiamate
        : kind === 'documenti'
          ? permessi.inviareDocumenti
          : permessi.scrivereMessaggi
    if (!ok) throw new HttpError(403, 'Il consulente non ha abilitato questo tipo di richiesta.')
  }
  res.status(201).json(createRequest(companyUuid, req.body ?? {}, attore(req)))
})

requestsRouter.get('/requests/:id', lettura, (req, res) => {
  res.json(openRequest(param(req, 'uuid'), param(req, 'id'), attore(req)))
})

requestsRouter.post(
  '/requests/:id/messages',
  permessoAzienda('scrivereMessaggi', 'Il consulente non ha abilitato i messaggi.'),
  (req, res) => {
    res.status(201).json(addMessage(param(req, 'uuid'), param(req, 'id'), req.body ?? {}, attore(req)))
  }
)

requestsRouter.post('/requests/:id/actions', lettura, (req, res) => {
  res.json(requestAction(param(req, 'uuid'), param(req, 'id'), req.body ?? {}, attore(req)))
})

/** Il campanello e la casella delle richieste di tutto lo studio. */
export const inboxRouter: Router = Router()

inboxRouter.use(requireAuth)

inboxRouter.get('/summary', (req, res) => {
  const auth = req.auth!
  res.json({
    ...inboxSummary(auth.role, auth.company_uuid),
    per_company: auth.role === 'consultant' ? unreadByCompany() : {}
  })
})

inboxRouter.get('/requests', requireRole('consultant'), (req, res) => {
  res.json(listAllRequests({ aperte: req.query.aperte === 'true' }))
})
