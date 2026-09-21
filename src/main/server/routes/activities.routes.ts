import { Router, type Request } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  activities,
  addTimeEntry,
  deleteTask,
  deleteTimeEntry,
  runningTimer,
  saveTask,
  setHourlyRate,
  startTimer,
  stopTimer,
  updateTimeEntry
} from '../services/activities.service'

/**
 * Attività e Tempi — AGENTS.md §10.11.
 *
 * Sono il lavoro e le ore del consulente, non dati dell'azienda: l'operatore
 * Azienda non li vede (quanto tempo prende un cliente e quanto vale è materia
 * dello studio).
 */
export const activitiesRouter: Router = Router({ mergeParams: true })

activitiesRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

const soloConsulente = requireRole('consultant')

activitiesRouter.get('/activities', soloConsulente, (req, res) => {
  res.json(activities(param(req, 'uuid')))
})

activitiesRouter.put('/activities/settings', soloConsulente, (req, res) => {
  res.json(setHourlyRate(param(req, 'uuid'), req.body?.hourly_rate_cents))
})

activitiesRouter.post('/tasks', soloConsulente, (req, res) => {
  res.status(201).json(saveTask(param(req, 'uuid'), req.body ?? {}))
})

activitiesRouter.put('/tasks/:id', soloConsulente, (req, res) => {
  res.json(saveTask(param(req, 'uuid'), req.body ?? {}, param(req, 'id')))
})

activitiesRouter.delete('/tasks/:id', soloConsulente, (req, res) => {
  res.json(deleteTask(param(req, 'uuid'), param(req, 'id')))
})

activitiesRouter.post('/time-entries', soloConsulente, (req, res) => {
  res.status(201).json(addTimeEntry(param(req, 'uuid'), req.body ?? {}))
})

activitiesRouter.put('/time-entries/:id', soloConsulente, (req, res) => {
  res.json(updateTimeEntry(param(req, 'uuid'), param(req, 'id'), req.body ?? {}))
})

activitiesRouter.delete('/time-entries/:id', soloConsulente, (req, res) => {
  res.json(deleteTimeEntry(param(req, 'uuid'), param(req, 'id')))
})

activitiesRouter.post('/timer/start', soloConsulente, (req, res) => {
  res.status(201).json(startTimer(param(req, 'uuid'), req.body ?? {}))
})

/** Il timer vale per tutto il programma: si legge e si ferma senza sapere dov'è. */
export const timerRouter: Router = Router()

timerRouter.use(requireAuth, soloConsulente)

timerRouter.get('/', (_req, res) => {
  res.json(runningTimer())
})

timerRouter.post('/stop', (_req, res) => {
  res.json(stopTimer())
})
