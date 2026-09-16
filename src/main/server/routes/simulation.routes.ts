import { Router, type Request } from 'express'
import type { Scenario } from '@shared/types'
import { requireAuth, requireRole } from '../middleware/auth'
import { HttpError } from '../http-error'
import {
  deleteScenario,
  exportScenario,
  listScenarios,
  saveScenario,
  simulationBase
} from '../services/simulation.service'

/**
 * Analisi & Simulazioni di un'azienda — AGENTS.md §10.8.
 *
 * Simulare non cambia nessun dato, quindi anche l'operatore Azienda può farlo
 * ed esportare il risultato; salvare uno scenario resta al Consulente.
 */
export const simulationRouter: Router = Router({ mergeParams: true })

simulationRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function assertCanRead(req: Request): string {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  return companyUuid
}

simulationRouter.get('/periods/:periodUuid/simulation-base', (req, res) => {
  res.json(
    simulationBase(
      assertCanRead(req),
      param(req, 'periodUuid'),
      (req.query.scenario as Scenario) ?? 'actual'
    )
  )
})

simulationRouter.get('/simulations', (req, res) => {
  res.json(listScenarios(assertCanRead(req)))
})

simulationRouter.post('/simulations/export', async (req, res) => {
  const companyUuid = assertCanRead(req)
  const { filePath, periodUuid, scenario, params, name } = req.body ?? {}
  if (!filePath || !periodUuid) throw new HttpError(400, 'Mancano il file o il periodo di base.')
  res.status(201).json(
    await exportScenario(companyUuid, { filePath, periodUuid, scenario, params, name })
  )
})

simulationRouter.post('/simulations', requireRole('consultant'), (req, res) => {
  res.status(201).json(saveScenario(param(req, 'uuid'), req.body ?? {}))
})

simulationRouter.put('/simulations/:id', requireRole('consultant'), (req, res) => {
  res.json(saveScenario(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})

simulationRouter.delete('/simulations/:id', requireRole('consultant'), (req, res) => {
  res.json(deleteScenario(param(req, 'uuid'), param(req, 'id')))
})
