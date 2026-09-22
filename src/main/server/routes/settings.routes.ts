import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { getAppSettings, saveAppSettings } from '../services/settings.service'
import { applicaBackupAutomatico } from '../../lib/auto-backup'

/**
 * Impostazioni del programma — AGENTS.md §10.12.
 *
 * Le modifica un consulente. L'operatore Azienda ne legge solo quello che gli
 * serve: quali moduli esistono e come si chiama lo studio ("Il tuo consulente").
 */
export const settingsRouter: Router = Router()

settingsRouter.use(requireAuth)

settingsRouter.get('/app', (req, res) => {
  const settings = getAppSettings()
  if (req.auth!.role === 'consultant') {
    res.json(settings)
    return
  }
  res.json({ moduli: settings.moduli, studio: settings.studio })
})

settingsRouter.put('/app', requireRole('consultant'), (req, res) => {
  const settings = saveAppSettings(req.body ?? {})
  // Acceso adesso: la copia del giorno si fa subito, non al prossimo avvio.
  applicaBackupAutomatico()
  res.json(settings)
})
