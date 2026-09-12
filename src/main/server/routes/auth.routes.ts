import { Router } from 'express'
import { app } from 'electron'
import type { SetupState } from '@shared/types'
import { DEMO_ACCOUNTS, demoDataAvailable } from '../../db/seed'
import {
  createCompanyUser,
  isConfigured,
  listUsers,
  login,
  setupFirstConsultant
} from '../services/auth.service'
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

authRouter.get('/me', requireAuth, (req, res) => {
  const { sub, username, full_name, role, company_uuid } = req.auth!
  res.json({ uuid: sub, username, full_name, role, company_uuid })
})

/** Solo il Consulente crea gli operatori lato Azienda — §4. */
authRouter.get('/users', requireAuth, requireRole('consultant'), (_req, res) => {
  res.json(listUsers())
})

authRouter.post('/users/company', requireAuth, requireRole('consultant'), (req, res) => {
  const { username, password, full_name, company_uuid } = req.body ?? {}
  res.status(201).json(createCompanyUser({ username, password, full_name, company_uuid }))
})
