/**
 * Attività e Tempi — AGENTS.md §10.11.
 *
 * Il lavoro del consulente su ogni azienda: le cose da fare (una bacheca a
 * colonne) e il tempo speso (timer e ore scritte a mano). L'idea viene dalle
 * piattaforme di gestione del lavoro come Ever Teams; qui è ridotta a ciò che
 * serve a uno studio: sapere quanto tempo prende un cliente e quanto vale.
 *
 * Solo funzioni pure: il servizio le usa per il riepilogo, i test le provano
 * senza database. Il tempo si conta in **minuti interi**, il valore in centesimi.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

/** Ordine delle colonne della bacheca. */
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done']

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Da fare',
  in_progress: 'In corso',
  review: 'Da verificare',
  done: 'Fatto'
}

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Bassa',
  medium: 'Normale',
  high: 'Alta',
  urgent: 'Urgente'
}

/** Il minimo che il riepilogo deve sapere di un'attività. */
export interface TaskLike {
  uuid: string
  status: TaskStatus
  due_date: string | null
  estimate_minutes: number | null
}

/** Il minimo che il riepilogo deve sapere di una voce di tempo. */
export interface TimeEntryLike {
  task_uuid: string | null
  work_date: string
  started_at: string | null
  ended_at: string | null
  minutes: number | null
  billable: 0 | 1
}

export interface SettimanaOre {
  /** Lunedì della settimana, `YYYY-MM-DD`. */
  inizio: string
  /** Etichetta breve per l'asse, es. "15/9". */
  label: string
  minuti: number
  fatturabili: number
}

export interface RiepilogoAttivita {
  settimanaMinuti: number
  meseMinuti: number
  meseFatturabiliMinuti: number
  /** Valore delle ore fatturabili del mese; null senza tariffa oraria. */
  meseValoreCents: number | null
  aperte: number
  scadute: number
  /** Minuti registrati per attività (chiave: uuid dell'attività). */
  perAttivita: Record<string, number>
  /** Le ultime settimane, dalla più vecchia alla corrente. */
  settimane: SettimanaOre[]
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Data locale `YYYY-MM-DD`: le ore si contano sul giorno di chi lavora, non in UTC. */
export function dataLocale(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daData(iso: string): Date {
  const [y, m, g] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, g ?? 1)
}

/** Lunedì della settimana di `d`, a mezzanotte locale. */
export function lunedi(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const giorno = (out.getDay() + 6) % 7 // lunedì = 0
  out.setDate(out.getDate() - giorno)
  return out
}

/**
 * Minuti di una voce. Una voce chiusa ha i suoi minuti; un timer ancora acceso
 * conta fino a `now`, così i totali salgono mentre si lavora.
 */
export function minutiVoce(entry: TimeEntryLike, now: Date): number {
  if (entry.minutes !== null && entry.ended_at !== null) return entry.minutes
  if (entry.started_at && entry.ended_at === null) {
    return Math.max(0, Math.floor((now.getTime() - Date.parse(entry.started_at)) / 60000))
  }
  return entry.minutes ?? 0
}

/** Minuti trascorsi fra due istanti ISO, arrotondati al minuto (mai negativi). */
export function minutiFra(inizio: string, fine: string): number {
  return Math.max(0, Math.round((Date.parse(fine) - Date.parse(inizio)) / 60000))
}

/** Valore del tempo alla tariffa oraria, in centesimi. */
export function valoreCents(minuti: number, tariffaOrariaCents: number): number {
  return Math.round((minuti * tariffaOrariaCents) / 60)
}

/** "2 h 05", "45 min", "0 min": leggibile in una cella stretta. */
export function durata(minuti: number): string {
  const m = Math.max(0, Math.round(minuti))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${pad(m % 60)}`
}

/** Un'attività è scaduta se non è fatta e la sua scadenza è prima di oggi. */
export function scaduta(task: TaskLike, oggi: string): boolean {
  return task.status !== 'done' && task.due_date !== null && task.due_date < oggi
}

export function riepilogoAttivita(
  tasks: TaskLike[],
  entries: TimeEntryLike[],
  tariffaOrariaCents: number | null,
  now: Date,
  numeroSettimane = 8
): RiepilogoAttivita {
  const oggi = dataLocale(now)
  const inizioSettimana = dataLocale(lunedi(now))
  const inizioMese = `${oggi.slice(0, 7)}-01`

  const primoLunedi = lunedi(now)
  primoLunedi.setDate(primoLunedi.getDate() - 7 * (numeroSettimane - 1))
  const settimane: SettimanaOre[] = Array.from({ length: numeroSettimane }, (_, i) => {
    const d = new Date(primoLunedi)
    d.setDate(d.getDate() + 7 * i)
    return { inizio: dataLocale(d), label: `${d.getDate()}/${d.getMonth() + 1}`, minuti: 0, fatturabili: 0 }
  })

  let settimanaMinuti = 0
  let meseMinuti = 0
  let meseFatturabiliMinuti = 0
  const perAttivita: Record<string, number> = {}

  for (const e of entries) {
    const minuti = minutiVoce(e, now)
    if (e.task_uuid) perAttivita[e.task_uuid] = (perAttivita[e.task_uuid] ?? 0) + minuti
    if (e.work_date > oggi) continue
    if (e.work_date >= inizioSettimana) settimanaMinuti += minuti
    if (e.work_date >= inizioMese) {
      meseMinuti += minuti
      if (e.billable) meseFatturabiliMinuti += minuti
    }
    const lun = dataLocale(lunedi(daData(e.work_date)))
    const s = settimane.find((x) => x.inizio === lun)
    if (s) {
      s.minuti += minuti
      if (e.billable) s.fatturabili += minuti
    }
  }

  return {
    settimanaMinuti,
    meseMinuti,
    meseFatturabiliMinuti,
    meseValoreCents:
      tariffaOrariaCents === null ? null : valoreCents(meseFatturabiliMinuti, tariffaOrariaCents),
    aperte: tasks.filter((t) => t.status !== 'done').length,
    scadute: tasks.filter((t) => scaduta(t, oggi)).length,
    perAttivita,
    settimane
  }
}
