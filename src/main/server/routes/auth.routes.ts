import { Router } from 'express'
import { app } from 'electron'
import type { SetupState } from '@shared/types'
import { DEMO_ACCOUNTS, demoDataAvailable } from '../../db/seed'
import {
  changeOwnPassword,
  createCompanyUser,
  createConsultant,
  deleteUser,
  getProfile,
  isConfigured,
  listUsers,
  login,
  resetPassword,
  setupFirstConsultant,
  updateProfile,
  updateUser
} from '../services/auth.service'
import { getUserSettings, saveUserSettings } from '../services/settings.service'
import { requireAuth, requireRole } from '../middleware/auth'

export const authRouter: Router = Router()

/** Stato dell'installazione: guida il primo avvio (setup vs login). */
authRouter.get('/setup', (_req, res) => {
  const state: SetupState = {
    configured: isConfigured(),
    version: app.getVersion(),
    demo: demoDataAvailable() ? DEMO_ACCOUNTS : null
  }
  res.json(state)
})

authRouter.post('/setup', (req, res) => {
  const { username, password, full_name } = req.body ?? {}
  res.status(201).json(setupFirstConsultant({ username, password, full_name }))
})

authRouter.post('/login', (req, res) => {
  const { username, password, role } = req.body ?? {}
  res.json(login(username, password, role))
})

// --- il proprio profilo: dal database, non dal token (il nome può cambiare) ---

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(getProfile(req.auth!.sub))
})

authRouter.put('/me', requireAuth, (req, res) => {
  res.json(updateProfile(req.auth!.sub, req.body ?? {}))
})

authRouter.post('/me/password', requireAuth, (req, res) => {
  const { current, password } = req.body ?? {}
  res.json(changeOwnPassword(req.auth!.sub, current, password))
})

/** Le preferenze di chi è entrato: tema, avvisi, squillo (§10.12). */
authRouter.get('/me/settings', requireAuth, (req, res) => {
  res.json(getUserSettings(req.auth!.sub))
})

authRouter.put('/me/settings', requireAuth, (req, res) => {
  res.json(saveUserSettings(req.auth!.sub, req.body ?? {}))
})

// --- gli accessi: li gestiscono i consulenti, che sono gli amministratori ----

const soloConsulente = [requireAuth, requireRole('consultant')]

authRouter.get('/users', ...soloConsulente, (req, res) => {
  const company = typeof req.query.company === 'string' ? req.query.company : undefined
  res.json(listUsers(company))
})

authRouter.post('/users/company', ...soloConsulente, (req, res) => {
  const { username, password, full_name, company_uuid, phone, email } = req.body ?? {}
  res.status(201).json(createCompanyUser({ username, password, full_name, company_uuid, phone, email }))
})

authRouter.post('/users/consultant', ...soloConsulente, (req, res) => {
  const { username, password, full_name, phone, email } = req.body ?? {}
  res.status(201).json(createConsultant({ username, password, full_name, phone, email }))
})

authRouter.put('/users/:uuid', ...soloConsulente, (req, res) => {
  res.json(updateUser(String(req.params.uuid), req.body ?? {}, req.auth!.sub))
})

authRouter.post('/users/:uuid/password', ...soloConsulente, (req, res) => {
  res.json(resetPassword(String(req.params.uuid), req.body?.password))
})

authRouter.delete('/users/:uuid', ...soloConsulente, (req, res) => {
  res.json(deleteUser(String(req.params.uuid), req.auth!.sub))
})
