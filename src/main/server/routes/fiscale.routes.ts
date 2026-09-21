import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'
import { bilancioFiscale, getFiscaleSettings, saveFiscaleSettings } from '../services/fiscale.service'

/**
 * Area fiscale e contributi di un'azienda — AGENTS.md §10.17. La stima la fa
 * la schermata col motore condiviso: qui arrivano impostazioni e numeri del
 * bilancio. L'azienda la vede se il consulente l'ha condivisa.
 */
export const fiscaleRouter: Router = Router({ mergeParams: true })

fiscaleRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

fiscaleRouter.get('/fiscale', vistaAzienda('fiscale'), (req, res) => {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  res.json({ settings: getFiscaleSettings(companyUuid), bilancio: bilancioFiscale(companyUuid) })
})

fiscaleRouter.put('/fiscale/settings', requireRole('consultant'), (req, res) => {
  res.json(saveFiscaleSettings(param(req, 'uuid'), req.body ?? {}))
})
