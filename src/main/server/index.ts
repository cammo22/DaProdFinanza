import { app as electronApp } from 'electron'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { HealthState } from '@shared/types'
import { isDatabaseHealthy } from '../db'
import { HttpError } from './http-error'
import { timerRouter } from './routes/activities.routes'
import { authRouter } from './routes/auth.routes'
import { clientsRouter } from './routes/clients.routes'
import { companiesRouter } from './routes/companies.routes'
import { referenceRouter } from './routes/reference.routes'
import { inboxRouter } from './routes/requests.routes'
import { settingsRouter } from './routes/settings.routes'

/**
 * Backend REST embedded nel processo main — AGENTS.md §2/§3.
 *
 * In Fase 1 ascolta solo su 127.0.0.1 con porta effimera: è la UI locale a
 * consumarlo. L'esposizione verso le app Azienda (canale cifrato, §3) è Fase 8 —
 * qui non si apre nulla verso la rete.
 */
const HOST = '127.0.0.1'

let server: Server | null = null
let port = 0

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error('[server] errore non gestito:', err)
  res.status(500).json({ error: 'Errore interno del server.' })
}

export function createServerApp(): express.Express {
  const api = express()

  api.use(cors({ origin: true }))
  api.use(express.json({ limit: '1mb' }))

  api.get('/api/health', (_req, res) => {
    const health: HealthState = {
      database: isDatabaseHealthy() ? 'ok' : 'error',
      server: 'ok',
      // Il trasporto Consulente↔Azienda arriva in Fase 8 (AGENTS.md §7/§13).
      tailscale: 'not-configured',
      last_sync: null,
      version: electronApp.getVersion()
    }
    res.json(health)
  })

  api.use('/api/auth', authRouter)
  api.use('/api/clients', clientsRouter)
  api.use('/api/companies', companiesRouter)
  api.use('/api/reference', referenceRouter)
  api.use('/api/timer', timerRouter)
  api.use('/api/settings', settingsRouter)
  api.use('/api/inbox', inboxRouter)

  api.use((_req, res) => res.status(404).json({ error: 'Risorsa non trovata.' }))
  api.use(errorHandler)

  return api
}

export function startServer(): Promise<number> {
  if (server) return Promise.resolve(port)

  return new Promise((resolve, reject) => {
    const listener = createServerApp().listen(0, HOST)

    listener.once('listening', () => {
      server = listener
      port = (listener.address() as AddressInfo).port
      console.log(`[server] in ascolto su http://${HOST}:${port}`)
      resolve(port)
    })

    listener.once('error', reject)
  })
}

export function serverPort(): number {
  return port
}

export function apiBaseUrl(): string {
  return `http://${HOST}:${port}`
}

export function stopServer(): void {
  // Le connessioni keep-alive del renderer terrebbero il server in piedi:
  // si chiudono subito, così il processo esce davvero.
  server?.close()
  server?.closeAllConnections()
  server = null
  port = 0
}
