import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  dataLocale,
  durata,
  minutiVoce,
  riepilogoAttivita,
  scaduta,
  type TaskPriority,
  type TaskStatus
} from '@shared/engine'
import type { ActivitiesPayload, Company, RunningTimer, Task, TimeEntry } from '@shared/types'
import { api } from '../../lib/api'
import { dataBreve, dataIt, euro, euroInput, parseEuro } from '../../lib/format'
import { Griglia, Pannelli } from '../../components/Pannelli'
import { StrisciaIndicatori } from '../../components/widgets'
import { COLORI } from '../../components/charts'
import { Alert, Button, Card, EmptyState, Field, Modal, Select, TextInput } from '../../components/ui'

/**
 * Attività e Tempi — AGENTS.md §10.11.
 *
 * Il lavoro del consulente su questa azienda: una bacheca a colonne con le
 * cose da fare, un timer, le ore scritte a mano e quanto valgono. L'ispirazione
 * sono le piattaforme di gestione del lavoro come Ever Teams (bacheca, timer
 * unico, registro ore), ridotte a quello che serve a uno studio.
 */

/** Avvisa la barra del timer in alto che qualcosa è cambiato. */
export const EVENTO_TIMER = 'daprod:timer'
export const avvisaTimer = (): void => {
  window.dispatchEvent(new Event(EVENTO_TIMER))
}

const PRIORITA_STILE: Record<TaskPriority, string> = {
  low: 'border-ink-600 text-ink-400',
  medium: 'border-brand-500/40 text-brand-300',
  high: 'border-warning/50 text-warning',
  urgent: 'border-negative/50 text-negative'
}

const COLONNA_STILE: Record<TaskStatus, string> = {
  todo: 'bg-ink-500',
  in_progress: 'bg-brand-400',
  review: 'bg-warning',
  done: 'bg-positive'
}

/** Durata scritta a mano → minuti: "1:30", "1h30", "45m", oppure ore nude ("1,5"). */
export function parseDurata(testo: string): number | null {
  const t = testo.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let m = /^(\d+):(\d{1,2})$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(\d+)h(?:(\d{1,2})(?:m|min)?)?$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0)
  m = /^(\d+)(?:m|min)$/.exec(t)
  if (m) return Number(m[1])
  const n = Number(t.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  // Un numero nudo sono ore ("1,5" = un'ora e mezza).
  return Math.round(n * 60)
}

function orologio(secondi: number): string {
  const s = Math.max(0, Math.floor(secondi))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Secondi trascorsi dal timer acceso, aggiornati ogni secondo. */
export function useSecondi(timer: RunningTimer | null): number {
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => {
    if (!timer) return
    const id = setInterval(() => setOra(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timer])
  return timer?.entry.started_at ? (ora - Date.parse(timer.entry.started_at)) / 1000 : 0
}

// --- modale attività ---------------------------------------------------------------

function TaskModal({
  companyUuid,
  task,
  statoIniziale,
  minutiRegistrati,
  onClose,
  onSaved
}: {
  companyUuid: string
  task: Task | null
  statoIniziale: TaskStatus
  minutiRegistrati: number
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? statoIniziale)
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [due, setDue] = useState(task?.due_date ?? '')
  const [stima, setStima] = useState(
    task?.estimate_minutes ? String(task.estimate_minutes / 60).replace('.', ',') : ''
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const esegui = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  const invia = (event: React.FormEvent): void => {
    event.preventDefault()
    const estimate = stima.trim() ? parseDurata(stima) : null
    if (stima.trim() && estimate === null) {
      setError('Stima non valida: scrivi le ore, per esempio 2 oppure 1,5 oppure 1:30.')
      return
    }
    const body = { title, notes, status, priority, due_date: due || null, estimate_minutes: estimate }
    void esegui(() =>
      task
        ? api.put(`/api/companies/${companyUuid}/tasks/${task.uuid}`, body)
        : api.post(`/api/companies/${companyUuid}/tasks`, body)
    )
  }

  return (
    <Modal
      title={task ? 'Modifica attività' : 'Nuova attività'}
      subtitle={
        task && minutiRegistrati > 0
          ? `Tempo registrato finora: ${durata(minutiRegistrati)}`
          : 'Una cosa da fare per questa azienda: una scadenza, una pratica, una richiesta.'
      }
      onClose={onClose}
    >
      <form onSubmit={invia}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Titolo" required>
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </Field>
          </div>
          <Field label="Stato">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorità">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scadenza">
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Stima (ore)" hint="Es. 2, 1,5 oppure 1:30">
            <TextInput value={stima} onChange={(e) => setStima(e.target.value)} inputMode="decimal" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </Field>
          </div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-700 px-6 py-4">
          {task && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Eliminare "${task.title}"? Le ore registrate restano nel registro.`)) return
                void esegui(() => api.delete(`/api/companies/${companyUuid}/tasks/${task.uuid}`))
              }}
            >
              Elimina
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Salvataggio…' : task ? 'Salva' : 'Aggiungi'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

// --- scheda della bacheca -------------------------------------------------------------

function SchedaAttivita({
  task,
  minuti,
  oggi,
  acceso,
  onApri,
  onSposta,
  onAvvia
}: {
  task: Task
  minuti: number
  oggi: string
  acceso: boolean
  onApri: () => void
  onSposta: (verso: -1 | 1) => void
  onAvvia: () => void
}): React.JSX.Element {
  const i = TASK_STATUSES.indexOf(task.status)
  const quota = task.estimate_minutes ? minuti / task.estimate_minutes : null
  const inRitardo = scaduta(task, oggi)

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-daprod-task', task.uuid)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`group rounded-lg border bg-ink-900 p-3 transition-colors hover:border-ink-500 ${
        acceso ? 'border-brand-400' : 'border-ink-700'
      }`}
    >
      <button type="button" onClick={onApri} className="block w-full text-left">
        <p className={`text-sm leading-snug ${task.status === 'done' ? 'text-ink-400 line-through' : 'text-ink-100'}`}>
          {task.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded border px-1.5 py-px ${PRIORITA_STILE[task.priority]}`}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
          {task.due_date && (
            <span className={inRitardo ? 'font-medium text-negative' : 'text-ink-400'}>
              {inRitardo ? 'Scaduta ' : 'Entro '}
              {dataBreve(task.due_date)}
            </span>
          )}
          {minuti > 0 && <span className="ml-auto font-mono text-ink-300">{durata(minuti)}</span>}
        </div>
        {quota !== null && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800" title={`Stima: ${durata(task.estimate_minutes!)}`}>
            <div
              className={`h-full rounded-full ${quota > 1 ? 'bg-negative' : 'bg-brand-400'}`}
              style={{ width: `${Math.min(100, quota * 100)}%` }}
            />
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          disabled={i === 0}
          onClick={() => onSposta(-1)}
          title={i > 0 ? `Sposta in "${TASK_STATUS_LABELS[TASK_STATUSES[i - 1]]}"` : undefined}
          className="rounded px-2 py-0.5 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-0"
        >
          ←
        </button>
        <button
          type="button"
          disabled={i === TASK_STATUSES.length - 1}
          onClick={() => onSposta(1)}
          title={i < TASK_STATUSES.length - 1 ? `Sposta in "${TASK_STATUS_LABELS[TASK_STATUSES[i + 1]]}"` : undefined}
          className="rounded px-2 py-0.5 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-0"
        >
          →
        </button>
        {task.status !== 'done' && (
          <button
            type="button"
            onClick={onAvvia}
            disabled={acceso}
            title={acceso ? 'Il timer sta già contando su questa attività' : 'Avvia il timer su questa attività'}
            className="ml-auto rounded px-2 py-0.5 text-xs text-brand-300 hover:bg-brand-500/15 disabled:text-brand-400"
          >
            {acceso ? '● in corso' : '▶ Avvia'}
          </button>
        )}
      </div>
    </div>
  )
}

// --- vista -----------------------------------------------------------------------

export function ActivitiesView({ company }: { company: Company }): React.JSX.Element {
  const [dati, setDati] = useState<ActivitiesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modale, setModale] = useState<{ task: Task | null; stato: TaskStatus } | null>(null)
  const [sopra, setSopra] = useState<TaskStatus | null>(null)

  // Timer: attività scelta e descrizione.
  const [timerTask, setTimerTask] = useState('')
  const [timerNota, setTimerNota] = useState('')

  // Ore a mano.
  const [giorno, setGiorno] = useState(() => dataLocale(new Date()))
  const [tempo, setTempo] = useState('')
  const [manoTask, setManoTask] = useState('')
  const [manoNota, setManoNota] = useState('')
  const [fatturabile, setFatturabile] = useState(true)

  const [tariffa, setTariffa] = useState('')
  const [salvato, setSalvato] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      const r = await api.get<ActivitiesPayload>(`/api/companies/${company.uuid}/activities`)
      setDati(r)
      setTariffa(euroInput(r.hourly_rate_cents))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attività non disponibili.')
    }
  }, [company.uuid])

  useEffect(() => {
    carica()
    // Il timer si può fermare anche dalla barra in alto.
    window.addEventListener(EVENTO_TIMER, carica)
    return () => window.removeEventListener(EVENTO_TIMER, carica)
  }, [carica])

  const running = dati?.running ?? null
  const secondi = useSecondi(running)
  const quiAcceso = running?.company_uuid === company.uuid

  // Il riepilogo si ricalcola a ogni minuto intero di timer, non a ogni secondo.
  const minutoCorrente = Math.floor(secondi / 60)
  const riepilogo = useMemo(
    () =>
      dati ? riepilogoAttivita(dati.tasks, dati.entries, dati.hourly_rate_cents, new Date()) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dati, minutoCorrente]
  )

  const azione = async (fn: () => Promise<unknown>, messaggio?: string): Promise<void> => {
    try {
      await fn()
      await carica()
      avvisaTimer()
      if (messaggio) {
        setSalvato(messaggio)
        setTimeout(() => setSalvato(null), 3000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  const avvia = (taskUuid: string | null, descrizione = ''): Promise<void> =>
    azione(() =>
      api.post(`/api/companies/${company.uuid}/timer/start`, {
        task_uuid: taskUuid,
        description: descrizione
      })
    )

  const ferma = async (): Promise<void> => {
    let registrato = true
    await azione(async () => {
      const r = await api.post<{ stopped: TimeEntry | null }>('/api/timer/stop')
      registrato = r.stopped !== null
    })
    setSalvato(registrato ? 'Tempo registrato.' : 'Meno di un minuto: non l’ho registrato.')
    setTimeout(() => setSalvato(null), 3000)
  }

  const sposta = (task: Task, stato: TaskStatus): void => {
    if (task.status === stato) return
    void azione(() => api.put(`/api/companies/${company.uuid}/tasks/${task.uuid}`, { status: stato }))
  }

  if (!dati || !riepilogo) {
    return error ? <Alert>{error}</Alert> : <p className="text-sm text-ink-400">Caricamento…</p>
  }

  const oggi = dataLocale(new Date())
  const aperte = dati.tasks.filter((t) => t.status !== 'done')
  const titoli = new Map(dati.tasks.map((t) => [t.uuid, t.title]))
  const minutiTask = (uuid: string): number => riepilogo.perAttivita[uuid] ?? 0

  // Registro: ultime 30 giornate con ore, raggruppate per giorno.
  const perGiorno = new Map<string, TimeEntry[]>()
  for (const e of dati.entries) {
    if (!perGiorno.has(e.work_date)) {
      if (perGiorno.size >= 30) break
      perGiorno.set(e.work_date, [])
    }
    perGiorno.get(e.work_date)!.push(e)
  }

  const grafico = riepilogo.settimane.map((s) => ({
    label: s.label,
    fatturabili: Math.round((s.fatturabili / 60) * 10) / 10,
    altre: Math.round(((s.minuti - s.fatturabili) / 60) * 10) / 10
  }))

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {salvato && <Alert tone="success">{salvato}</Alert>}

      <Pannelli vista="attivita">
        <StrisciaIndicatori
          indicatori={[
            { label: 'Ore questa settimana', valore: durata(riepilogo.settimanaMinuti), sotto: 'da lunedì a oggi' },
            {
              label: 'Ore del mese',
              valore: durata(riepilogo.meseMinuti),
              sotto: `di cui fatturabili ${durata(riepilogo.meseFatturabiliMinuti)}`,
              quota: riepilogo.meseMinuti ? riepilogo.meseFatturabiliMinuti / riepilogo.meseMinuti : null,
              stile: 'barra',
              colore: 'bg-positive'
            },
            {
              label: 'Valore del mese',
              valore: euro(riepilogo.meseValoreCents),
              sotto:
                dati.hourly_rate_cents === null
                  ? 'imposta la tariffa oraria qui sotto'
                  : `ore fatturabili × ${euro(dati.hourly_rate_cents, dati.hourly_rate_cents % 100 !== 0)}/h`
            },
            {
              label: 'Attività aperte',
              valore: String(riepilogo.aperte),
              sotto: riepilogo.scadute > 0 ? `${riepilogo.scadute} scadute` : 'nessuna scaduta'
            }
          ]}
        />

        <Griglia colonne={2}>
          <Card title="Timer">
            <div className="flex flex-col gap-4 px-5 py-4">
              {running ? (
                <div className="flex flex-wrap items-center gap-4">
                  <p className="font-mono text-4xl font-semibold tabular-nums text-brand-300">{orologio(secondi)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-100">
                      {running.task_title ?? running.entry.description ?? 'Lavoro senza attività'}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {quiAcceso ? 'su questa azienda' : `su ${running.company_name}`} · dalle{' '}
                      {new Date(running.entry.started_at!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Button variant="danger" onClick={ferma}>
                    ■ Ferma
                  </Button>
                </div>
              ) : (
                <p className="font-mono text-4xl font-semibold tabular-nums text-ink-600">00:00:00</p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Attività">
                  <Select value={timerTask} onChange={(e) => setTimerTask(e.target.value)}>
                    <option value="">— lavoro generico —</option>
                    {aperte.map((t) => (
                      <option key={t.uuid} value={t.uuid}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Descrizione">
                  <TextInput
                    value={timerNota}
                    onChange={(e) => setTimerNota(e.target.value)}
                    placeholder="Cosa stai facendo"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    void avvia(timerTask || null, timerNota)
                    setTimerNota('')
                  }}
                >
                  ▶ {running ? 'Avvia questo (ferma l’altro)' : 'Avvia'}
                </Button>
                <p className="text-xs text-ink-400">Un solo timer alla volta, in tutto il programma.</p>
              </div>
            </div>
          </Card>

          <Card title="Aggiungi ore a mano">
            <form
              className="grid grid-cols-2 gap-3 px-5 py-4"
              onSubmit={(e) => {
                e.preventDefault()
                const minuti = parseDurata(tempo)
                if (!minuti) {
                  setError('Durata non valida: scrivi per esempio 1:30, 1,5 oppure 45m.')
                  return
                }
                void azione(
                  () =>
                    api.post(`/api/companies/${company.uuid}/time-entries`, {
                      work_date: giorno,
                      minutes: minuti,
                      task_uuid: manoTask || null,
                      description: manoNota,
                      billable: fatturabile
                    }),
                  `Aggiunte ${durata(minuti)} il ${dataIt(giorno)}.`
                ).then(() => {
                  setTempo('')
                  setManoNota('')
                })
              }}
            >
              <Field label="Giorno">
                <TextInput type="date" value={giorno} max={oggi} onChange={(e) => setGiorno(e.target.value)} />
              </Field>
              <Field label="Durata" hint="1:30 · 1,5 · 45m">
                <TextInput value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="1:30" />
              </Field>
              <div className="col-span-2">
                <Field label="Attività">
                  <Select value={manoTask} onChange={(e) => setManoTask(e.target.value)}>
                    <option value="">— lavoro generico —</option>
                    {dati.tasks.map((t) => (
                      <option key={t.uuid} value={t.uuid}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Descrizione">
                  <TextInput value={manoNota} onChange={(e) => setManoNota(e.target.value)} />
                </Field>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-ink-300 sm:col-span-1">
                <input
                  type="checkbox"
                  checked={fatturabile}
                  onChange={(e) => setFatturabile(e.target.checked)}
                  className="accent-brand-500"
                />
                Fatturabile al cliente
              </label>
              <div className="col-span-2 flex justify-end sm:col-span-1">
                <Button type="submit" variant="primary">
                  Aggiungi
                </Button>
              </div>
            </form>
          </Card>
        </Griglia>

        <Card
          title="Bacheca delle attività"
          actions={
            <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setModale({ task: null, stato: 'todo' })}>
              + Nuova attività
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {TASK_STATUSES.map((stato) => {
              const colonna = dati.tasks.filter((t) => t.status === stato)
              return (
                <div
                  key={stato}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('text/x-daprod-task')) return
                    e.preventDefault()
                    setSopra(stato)
                  }}
                  onDragLeave={() => setSopra((s) => (s === stato ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setSopra(null)
                    const task = dati.tasks.find((t) => t.uuid === e.dataTransfer.getData('text/x-daprod-task'))
                    if (task) sposta(task, stato)
                  }}
                  className={`flex min-h-32 flex-col gap-2 rounded-xl border p-2.5 transition-colors ${
                    sopra === stato ? 'border-brand-400 bg-brand-500/5' : 'border-ink-800 bg-ink-900/40'
                  }`}
                >
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <span className={`h-2 w-2 rounded-full ${COLONNA_STILE[stato]}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-300">
                      {TASK_STATUS_LABELS[stato]}
                    </span>
                    <span className="text-xs text-ink-500">{colonna.length}</span>
                    {stato !== 'done' && (
                      <button
                        type="button"
                        onClick={() => setModale({ task: null, stato })}
                        className="ml-auto rounded px-1.5 text-sm text-ink-500 hover:bg-ink-800 hover:text-ink-100"
                        title={`Nuova attività in "${TASK_STATUS_LABELS[stato]}"`}
                      >
                        +
                      </button>
                    )}
                  </div>
                  {colonna.map((task) => (
                    <SchedaAttivita
                      key={task.uuid}
                      task={task}
                      minuti={minutiTask(task.uuid)}
                      oggi={oggi}
                      acceso={running?.entry.task_uuid === task.uuid}
                      onApri={() => setModale({ task, stato: task.status })}
                      onSposta={(verso) => sposta(task, TASK_STATUSES[TASK_STATUSES.indexOf(task.status) + verso])}
                      onAvvia={() => void avvia(task.uuid)}
                    />
                  ))}
                  {colonna.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-ink-600">
                      {stato === 'done' ? 'Trascina qui ciò che è concluso' : 'Nessuna attività'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        <Griglia colonne={2}>
          <Card title="Ore per settimana">
            <div className="px-3 py-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={grafico} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1d2636" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    tickFormatter={(v: number) => `${v}h`}
                  />
                  <Tooltip
                    cursor={{ fill: '#1d2636', opacity: 0.4 }}
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => `${String(v).replace('.', ',')} h`}
                    labelFormatter={(l) => `Settimana del ${l}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Fatturabili" dataKey="fatturabili" stackId="ore" fill={COLORI.ricavi} />
                  <Bar name="Non fatturabili" dataKey="altre" stackId="ore" fill="#475569" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Tariffa oraria">
            <form
              className="flex flex-col gap-3 px-5 py-4"
              onSubmit={(e) => {
                e.preventDefault()
                const cents = tariffa.trim() ? parseEuro(tariffa) : null
                if (tariffa.trim() && (cents === null || cents < 0)) {
                  setError('Tariffa non valida: scrivi un importo in euro, per esempio 80.')
                  return
                }
                void azione(
                  () =>
                    api.put(`/api/companies/${company.uuid}/activities/settings`, {
                      hourly_rate_cents: cents
                    }),
                  'Tariffa salvata.'
                )
              }}
            >
              <p className="text-sm text-ink-400">
                Quanto vale un’ora di lavoro per questa azienda. Serve solo a dare un valore alle ore
                fatturabili: non crea fatture e non entra nei conti dell’azienda.
              </p>
              <div className="flex items-end gap-2">
                <Field label="Euro all’ora">
                  <TextInput
                    value={tariffa}
                    onChange={(e) => setTariffa(e.target.value)}
                    inputMode="decimal"
                    placeholder="es. 80"
                    className="w-32"
                  />
                </Field>
                <Button type="submit">Salva</Button>
              </div>
            </form>
          </Card>
        </Griglia>

        <Card title="Registro ore">
          {perGiorno.size === 0 ? (
            <EmptyState
              title="Ancora nessuna ora registrata"
              description="Avvia il timer mentre lavori per questa azienda, oppure aggiungi le ore a mano: qui compare il registro giorno per giorno."
            />
          ) : (
            <div className="divide-y divide-ink-800">
              {[...perGiorno.entries()].map(([giornoVoci, voci]) => {
                const totale = voci.reduce((s, v) => s + minutiVoce(v, new Date()), 0)
                return (
                  <div key={giornoVoci} className="px-5 py-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink-300">
                        {new Date(`${giornoVoci}T12:00:00`).toLocaleDateString('it-IT', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long'
                        })}
                      </span>
                      <span className="font-mono text-ink-300">{durata(totale)}</span>
                    </div>
                    {voci.map((v) => {
                      const aperta = v.started_at !== null && v.ended_at === null
                      return (
                        <div key={v.uuid} className="group flex items-center gap-3 py-1 text-sm">
                          <span className="min-w-0 flex-1 truncate text-ink-100">
                            {v.task_uuid ? (titoli.get(v.task_uuid) ?? 'Attività') : 'Lavoro generico'}
                            {v.description && <span className="text-ink-400"> · {v.description}</span>}
                          </span>
                          {!v.billable && (
                            <span className="shrink-0 rounded border border-ink-700 px-1.5 text-[10px] text-ink-400">
                              non fatturabile
                            </span>
                          )}
                          <span className={`shrink-0 font-mono text-xs ${aperta ? 'text-brand-300' : 'text-ink-300'}`}>
                            {aperta ? '● in corso' : durata(minutiVoce(v, new Date()))}
                          </span>
                          {!aperta && (
                            <button
                              type="button"
                              title="Elimina questa voce"
                              onClick={() => {
                                if (!confirm('Eliminare questa voce di tempo?')) return
                                void azione(() => api.delete(`/api/companies/${company.uuid}/time-entries/${v.uuid}`))
                              }}
                              className="shrink-0 rounded px-1.5 text-ink-600 hover:bg-negative/15 hover:text-negative"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </Pannelli>

      {modale && (
        <TaskModal
          companyUuid={company.uuid}
          task={modale.task}
          statoIniziale={modale.stato}
          minutiRegistrati={modale.task ? minutiTask(modale.task.uuid) : 0}
          onClose={() => setModale(null)}
          onSaved={() => {
            setModale(null)
            void carica()
          }}
        />
      )}
    </div>
  )
}
