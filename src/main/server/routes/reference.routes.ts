import { Router } from 'express'
import { listSections } from '../services/reference.service'
import { requireAuth } from '../middleware/auth'

/**
 * Dati di riferimento del motore finanziario, in sola lettura.
 * Visibili a entrambi i ruoli: sapere come è classificato un conto non espone
 * dati di altre aziende.
 */
export const referenceRouter: Router = Router()

referenceRouter.use(requireAuth)

referenceRouter.get('/sections', (_req, res) => {
  res.json(listSections())
})
