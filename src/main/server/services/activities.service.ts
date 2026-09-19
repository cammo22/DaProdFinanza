import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  dataLocale,
  minutiFra,
  type TaskPriority,
  type TaskStatus
} from '@shared/engine'
import type { ActivitiesPayload, RunningTimer, Task, TimeEntry } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'

/**
 * Attività e Tempi — AGENTS.md §10.11.
 *
 * Un solo timer acceso in tutto il programma, come un cronometro vero: farne
 * partire uno ferma quello di prima, anche se era su un'altra azienda. Così
 * le ore non si sovrappongono e non si contano due volte.
 */

/** Quanto indietro guarda la schermata: il grafico copre 8 settimane, il registro un po' di più. */
const GIORNI_STORICO = 120
/** Un tratto di lavoro più lungo di così è quasi certamente un timer dimenticato. */
const MINUTI_MAX_VOCE = 24 * 60

// --- lettura ---------------------------------------------------------------------

function getTask(companyUuid: string, uuid: string): Task {
  const row = getDatabase()
    .prepare('SELECT * FROM tasks WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as Task | undefined
  if (!row) throw new HttpError(404, 'Attività non trovata.')
  return row
}

function getEntry(companyUuid: string, uuid: string): TimeEntry {
  const row = getDatabase()
    .prepare('SELECT * FROM time_entries WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as TimeEntry | undefined
  if (!row) throw new HttpError(404, 'Voce di tempo non trovata.')
  return row
}

/** Il timer acceso, su qualunque azienda; null se è tutto fermo. */
export function runningTimer(): RunningTimer | null {
  const row = getDatabase()
    .prepare(
      `SELECT e.*, c.name AS company_name, t.title AS task_title
         FROM time_entries e
         JOIN companies c ON c.uuid = e.company_uuid
         LEFT JOIN tasks t ON t.uuid = e.task_uuid
        WHERE e.started_at IS NOT NULL AND e.ended_at IS NULL AND e.deleted = 0
        ORDER BY e.started_at DESC LIMIT 1`
    )
    .get() as (TimeEntry & { company_name: string; task_title: string | null }) | undefined
  if (!row) return null
  const { company_name, task_title, ...entry } = row
  return { entry, company_uuid: entry.company_uuid, company_name, task_title }
}

export function activities(companyUuid: string): ActivitiesPayload {
  getCompany(companyUuid)
  const db = getDatabase()
  const dal = new Date()
  dal.setDate(dal.getDate() - GIORNI_STORICO)

  const tasks = db
    .prepare(
      `SELECT * FROM tasks WHERE company_uuid = ? AND deleted = 0
        ORDER BY position, created_at`
    )
    .all(companyUuid) as Task[]
  const entries = db
    .prepare(
      `SELECT * FROM time_entries
        WHERE company_uuid = ? AND deleted = 0 AND work_date >= ?
        ORDER BY work_date DESC, COALESCE(started_at, created_at) DESC`
    )
    .all(companyUuid, dataLocale(dal)) as TimeEntry[]
  const settings = db
    .prepare('SELECT hourly_rate_cents FROM activity_settings WHERE company_uuid = ?')
    .get(companyUuid) as { hourly_rate_cents: number | null } | undefined

  return {
    tasks,
    entries,
    hourly_rate_cents: settings?.hourly_rate_cents ?? null,
    running: runningTimer()
  }
}

// --- attività --------------------------------------------------------------------

function testo(v: unknown, campo: string, max = 500): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') throw new HttpError(400, `${campo} non valido.`)
  const t = v.trim()
  if (t.length > max) throw new HttpError(400, `${campo}: al massimo ${max} caratteri.`)
  return t || null
}

function data(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new HttpError(400, `${campo}: data non valida.`)
  }
  return v
}

function minuti(v: unknown, campo: string): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `${campo}: minuti non validi.`)
  return n
}

export interface TaskInput {
  title?: unknown
  notes?: unknown
  status?: unknown
  priority?: unknown
  due_date?: unknown
  estimate_minutes?: unknown
  position?: unknown
}

export function saveTask(companyUuid: string, input: TaskInput, uuid?: string): Task {
  getCompany(companyUuid)
  const current = uuid ? getTask(companyUuid, uuid) : null
  const db = getDatabase()

  const title = input.title === undefined ? (current?.title ?? null) : testo(input.title, 'Titolo', 200)
  if (!title) throw new HttpError(400, "Scrivi di cosa si tratta: l'attività ha bisogno di un titolo.")

  const status = (input.status ?? current?.status ?? 'todo') as TaskStatus
  if (!TASK_STATUSES.includes(status)) throw new HttpError(400, 'Stato non valido.')
  const priority = (input.priority ?? current?.priority ?? 'medium') as TaskPriority
  if (!TASK_PRIORITIES.includes(priority)) throw new HttpError(400, 'Priorità non valida.')

  const notes = input.notes === undefined ? (current?.notes ?? null) : testo(input.notes, 'Note', 4000)
  const due = input.due_date === undefined ? (current?.due_date ?? null) : data(input.due_date, 'Scadenza')
  const estimate =
    input.estimate_minutes === undefined
      ? (current?.estimate_minutes ?? null)
      : minuti(input.estimate_minutes, 'Stima')

  // Cambiando colonna senza una posizione, l'attività va in fondo alla nuova.
  let position: number
  if (typeof input.position === 'number' && Number.isFinite(input.position)) {
    position = input.position
  } else if (current && current.status === status) {
    position = current.position
  } else {
    const ultimo = db
      .prepare(
        `SELECT MAX(position) AS p FROM tasks WHERE company_uuid = ? AND status = ? AND deleted = 0`
      )
      .get(companyUuid, status) as { p: number | null }
    position = (ultimo.p ?? 0) + 1
  }

  const now = nowIso()
  const completedAt =
    status === 'done' ? (current?.status === 'done' ? current.completed_at : now) : null

  if (current) {
    db.prepare(
      `UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, due_date = ?,
              estimate_minutes = ?, position = ?, completed_at = ?, updated_at = ?, synced = 0
        WHERE uuid = ?`
    ).run(title, notes, status, priority, due, estimate, position, completedAt, now, current.uuid)
    return getTask(companyUuid, current.uuid)
  }

  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO tasks (uuid, company_uuid, title, notes, status, priority, due_date,
                        estimate_minutes, position, completed_at, created_at, updated_at, synced, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
  ).run(nuovo, companyUuid, title, notes, status, priority, due, estimate, position, completedAt, now, now)
  return getTask(companyUuid, nuovo)
}

/**
 * Cancellare un'attività non cancella le ore: restano nel registro, senza
 * attività, perché il tempo è stato speso comunque.
 */
export function deleteTask(companyUuid: string, uuid: string): { uuid: string } {
  getTask(companyUuid, uuid)
  const db = getDatabase()
  const now = nowIso()
  db.transaction(() => {
    db.prepare(
      `UPDATE time_entries SET task_uuid = NULL, updated_at = ?, synced = 0
        WHERE task_uuid = ? AND deleted = 0`
    ).run(now, uuid)
    db.prepare('UPDATE tasks SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?').run(now, uuid)
  })()
  return { uuid }
}

// --- tempo -----------------------------------------------------------------------

/**
 * Chiude il timer. Meno di un minuto non si registra: è un avvio per sbaglio
 * o un cambio di attività, e nel registro sarebbe solo una riga da "0 min".
 */
function chiudiVoce(entry: TimeEntry, fine: Date): void {
  const minutes = Math.min(MINUTI_MAX_VOCE, minutiFra(entry.started_at!, fine.toISOString()))
  getDatabase()
    .prepare(
      `UPDATE time_entries SET ended_at = ?, minutes = ?, deleted = ?, updated_at = ?, synced = 0
        WHERE uuid = ?`
    )
    .run(fine.toISOString(), minutes, minutes < 1 ? 1 : 0, nowIso(), entry.uuid)
}

export function startTimer(
  companyUuid: string,
  input: { task_uuid?: unknown; description?: unknown; billable?: unknown }
): RunningTimer {
  getCompany(companyUuid)
  const taskUuid = typeof input.task_uuid === 'string' && input.task_uuid ? input.task_uuid : null
  const task = taskUuid ? getTask(companyUuid, taskUuid) : null
  const description = testo(input.description, 'Descrizione', 300)
  const db = getDatabase()
  const ora = new Date()

  db.transaction(() => {
    const acceso = runningTimer()
    if (acceso) chiudiVoce(acceso.entry, ora)

    const now = ora.toISOString()
    db.prepare(
      `INSERT INTO time_entries (uuid, company_uuid, task_uuid, description, work_date, started_at,
                                 ended_at, minutes, billable, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, 0)`
    ).run(
      newUuid(),
      companyUuid,
      taskUuid,
      description,
      dataLocale(ora),
      now,
      input.billable === false ? 0 : 1,
      now,
      now
    )

    // Chi fa partire il timer su un'attività da fare ci sta lavorando.
    if (task && task.status === 'todo') saveTask(companyUuid, { status: 'in_progress' }, task.uuid)
  })()

  return runningTimer()!
}

/** `stopped` è null se non c'era niente da fermare, o se è durato meno di un minuto. */
export function stopTimer(): { stopped: TimeEntry | null } {
  const acceso = runningTimer()
  if (!acceso) return { stopped: null }
  chiudiVoce(acceso.entry, new Date())
  const voce = getDatabase()
    .prepare('SELECT * FROM time_entries WHERE uuid = ? AND deleted = 0')
    .get(acceso.entry.uuid) as TimeEntry | undefined
  return { stopped: voce ?? null }
}

export function addTimeEntry(
  companyUuid: string,
  input: {
    task_uuid?: unknown
    description?: unknown
    work_date?: unknown
    minutes?: unknown
    billable?: unknown
  }
): TimeEntry {
  getCompany(companyUuid)
  const taskUuid = typeof input.task_uuid === 'string' && input.task_uuid ? input.task_uuid : null
  if (taskUuid) getTask(companyUuid, taskUuid)
  const workDate = data(input.work_date, 'Giorno') ?? dataLocale(new Date())
  const minutes = minuti(input.minutes, 'Durata')
  if (!minutes) throw new HttpError(400, 'Quanto tempo? Scrivi la durata in ore e minuti.')
  if (minutes > MINUTI_MAX_VOCE) throw new HttpError(400, 'Una voce non può superare le 24 ore.')

  const uuid = newUuid()
  const now = nowIso()
  getDatabase()
    .prepare(
      `INSERT INTO time_entries (uuid, company_uuid, task_uuid, description, work_date, started_at,
                                 ended_at, minutes, billable, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      uuid,
      companyUuid,
      taskUuid,
      testo(input.description, 'Descrizione', 300),
      workDate,
      minutes,
      input.billable === false ? 0 : 1,
      now,
      now
    )
  return getEntry(companyUuid, uuid)
}

export function deleteTimeEntry(companyUuid: string, uuid: string): { uuid: string } {
  getEntry(companyUuid, uuid)
  getDatabase()
    .prepare('UPDATE time_entries SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

export function setHourlyRate(companyUuid: string, value: unknown): { hourly_rate_cents: number | null } {
  getCompany(companyUuid)
  let rate: number | null = null
  if (value !== null && value !== undefined && value !== '') {
    rate = Number(value)
    if (!Number.isInteger(rate) || rate < 0) throw new HttpError(400, 'Tariffa oraria non valida.')
  }
  getDatabase()
    .prepare(
      `INSERT INTO activity_settings (company_uuid, hourly_rate_cents, updated_at, synced)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(company_uuid) DO UPDATE SET hourly_rate_cents = excluded.hourly_rate_cents,
                                               updated_at = excluded.updated_at, synced = 0`
    )
    .run(companyUuid, rate, nowIso())
  return { hourly_rate_cents: rate }
}
