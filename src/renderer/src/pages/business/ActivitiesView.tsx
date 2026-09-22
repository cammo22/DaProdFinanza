import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Alert, Button, CaricamentoPagina, Card, EmptyState, Field, Modal, Segmentato, Select, TextInput } from '../../components/ui'
import { Tendina, VoceMenu } from '../../components/Guscio'
import { Icona } from '../../components/icone'
import { mostraAvviso } from '../../components/Avvisi'
import { useAzione } from '../../lib/comandi'

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
    // Subito, non al primo scatto: l'ora ferma da quando si è aperta la schermata
    // darebbe per un secondo un tempo negativo.
    setOra(Date.now())
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

/** Il passo successivo più naturale per ogni stato: un pulsante con un nome chiaro. */
const PROSSIMO: Record<TaskStatus, { stato: TaskStatus; label: string }> = {
  todo: { stato: 'in_progress', label: 'Inizia' },
  in_progress: { stato: 'review', label: 'Da rivedere' },
  review: { stato: 'done', label: 'Fatta' },
  done: { stato: 'todo', label: 'Riapri' }
}

function SchedaAttivita({
  task,
  minuti,
  oggi,
  acceso,
  onApri,
  onStato,
  onAvvia
}: {
  task: Task
  minuti: number
  oggi: string
  acceso: boolean
  onApri: () => void
  onStato: (stato: TaskStatus) => void
  onAvvia: () => void
}): React.JSX.Element {
  const quota = task.estimate_minutes ? minuti / task.estimate_minutes : null
  const inRitardo = scaduta(task, oggi)
  const prossimo = PROSSIMO[task.status]

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-daprod-task', task.uuid)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`group rounded-lg border bg-ink-900 p-3 transition-colors hover:border-ink-500 ${
        acceso ? 'border-brand-400 shadow-[0_0_0_1px] shadow-brand-400/40' : 'border-ink-700'
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
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onStato(prossimo.stato)}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
            prossimo.stato === 'done'
              ? 'border-positive/40 text-positive hover:bg-positive/10'
              : 'border-ink-700 text-ink-200 hover:border-ink-500 hover:bg-ink-800'
          }`}
          title={`Sposta in "${TASK_STATUS_LABELS[prossimo.stato]}"`}
        >
          {prossimo.stato === 'done' && <Icona nome="spunta" className="h-3.5 w-3.5" />}
          {prossimo.label}
        </button>
        <Tendina
          titolo="Sposta in un altro stato"
          destra={false}
          larghezza="w-44"
          classeBottone="rounded-md p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-100"
          etichetta={<Icona nome="altro" className="h-4 w-4" />}
        >
          {(chiudi) =>
            TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
              <VoceMenu
                key={s}
                onClick={() => {
                  chiudi()
                  onStato(s)
                }}
              >
                {TASK_STATUS_LABELS[s]}
              </VoceMenu>
            ))
          }
        </Tendina>
        {task.status !== 'done' && (
          <button
            type="button"
            onClick={onAvvia}
            disabled={acceso}
            title={acceso ? 'Il timer sta già contando su questa attività' : 'Avvia il timer su questa attività'}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-300 hover:bg-brand-500/15 disabled:text-brand-400"
          >
            {acceso ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> in corso
              </>
            ) : (
              <>
                <Icona nome="play" pieno className="h-3 w-3" /> Avvia
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// --- correzione di una voce del registro ---------------------------------------------------

function ModificaVoce({
  companyUuid,
  voce,
  tasks,
  onClose,
  onSaved
}: {
  companyUuid: string
  voce: TimeEntry
  tasks: Task[]
  onClose: () => void
  onSaved: (messaggio: string) => void
}): React.JSX.Element {
  const [giorno, setGiorno] = useState(voce.work_date)
  const [tempo, setTempo] = useState(voce.minutes ? durataCampo(voce.minutes) : '')
  const [task, setTask] = useState(voce.task_uuid ?? '')
  const [nota, setNota] = useState(voce.description ?? '')
  const [fatturabile, setFatturabile] = useState(Boolean(voce.billable))
  const [errore, setErrore] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const salva = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const minuti = parseDurata(tempo)
    if (!minuti) {
      setErrore('Durata non valida: scrivi per esempio 1:30, 1,5 oppure 45m.')
      return
    }
    setBusy(true)
    try {
      await api.put(`/api/companies/${companyUuid}/time-entries/${voce.uuid}`, {
        work_date: giorno,
        minutes: minuti,
        task_uuid: task || null,
        description: nota,
        billable: fatturabile
      })
      onSaved('Voce corretta.')
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  const elimina = async (): Promise<void> => {
    if (!confirm('Eliminare questa voce di tempo?')) return
    setBusy(true)
    try {
      await api.delete(`/api/companies/${companyUuid}/time-entries/${voce.uuid}`)
      onSaved('Voce eliminata.')
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Correggi la voce" subtitle="Giorno, durata, attività e descrizione." onClose={onClose}>
      <form onSubmit={salva}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {errore && (
            <div className="col-span-2">
              <Alert>{errore}</Alert>
            </div>
          )}
          <Field label="Giorno">
            <TextInput type="date" value={giorno} max={dataLocale(new Date())} onChange={(e) => setGiorno(e.target.value)} />
          </Field>
          <Field label="Durata" hint="1:30 · 1,5 · 45m">
            <TextInput value={tempo} onChange={(e) => setTempo(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Attività">
              <Select value={task} onChange={(e) => setTask(e.target.value)}>
                <option value="">— lavoro generico —</option>
                {tasks.map((t) => (
                  <option key={t.uuid} value={t.uuid}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Descrizione">
              <TextInput value={nota} onChange={(e) => setNota(e.target.value)} />
            </Field>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-ink-300">
            <input type="checkbox" checked={fatturabile} onChange={(e) => setFatturabile(e.target.checked)} className="accent-brand-500" />
            Fatturabile al cliente
          </label>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-700 px-6 py-4">
          <Button type="button" variant="danger" className="mr-auto" disabled={busy} onClick={() => void elimina()}>
            Elimina
          </Button>
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Salva
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

/** Minuti → testo per il campo durata ("1:30"). */
function durataCampo(minuti: number): string {
  return `${Math.floor(minuti / 60)}:${String(minuti % 60).padStart(2, '0')}`
}

const DURATE_RAPIDE = [
  { minuti: 15, label: '15 min' },
  { minuti: 30, label: '30 min' },
  { minuti: 45, label: '45 min' },
  { minuti: 60, label: '1 h' },
  { minuti: 90, label: '1 h 30' },
  { minuti: 120, label: '2 h' }
]

function ieri(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dataLocale(d)
}

// --- vista -----------------------------------------------------------------------

type SchedaLavoro = 'bacheca' | 'registro' | 'andamento'

export function ActivitiesView({ company }: { company: Company }): React.JSX.Element {
  const [dati, setDati] = useState<ActivitiesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modale, setModale] = useState<{ task: Task | null; stato: TaskStatus } | null>(null)
  const [voceInModifica, setVoceInModifica] = useState<TimeEntry | null>(null)
  const [sopra, setSopra] = useState<TaskStatus | null>(null)
  const [scheda, setScheda] = useState<SchedaLavoro>('bacheca')
  // Sul telefono la bacheca mostra una colonna alla volta.
  const [colonna, setColonna] = useState<TaskStatus>('todo')

  // Timer: attività scelta e descrizione.
  const [timerTask, setTimerTask] = useState('')
  const [timerNota, setTimerNota] = useState('')

  // Ore a mano.
  const [giorno, setGiorno] = useState(() => dataLocale(new Date()))
  const [tempo, setTempo] = useState('')
  const [altraDurata, setAltraDurata] = useState(false)
  const [manoTask, setManoTask] = useState('')
  const [manoNota, setManoNota] = useState('')
  const [fatturabile, setFatturabile] = useState(true)
  const registra = useRef<HTMLDivElement>(null)
  const [evidenzia, setEvidenzia] = useState(false)

  const [tariffa, setTariffa] = useState('')

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

  // Dai comandi rapidi: "Registra ore" porta qui e accende il riquadro; "Nuova attività" apre la finestra.
  useAzione('registra-ore', () => {
    registra.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setEvidenzia(true)
    setTimeout(() => setEvidenzia(false), 1600)
  })
  useAzione('nuova-attivita', () => setModale({ task: null, stato: 'todo' }))

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
      if (messaggio) mostraAvviso(messaggio)
    } catch (err) {
      mostraAvviso(err instanceof Error ? err.message : 'Operazione non riuscita.', 'errore')
    }
  }

  const avvia = (taskUuid: string | null, descrizione = ''): Promise<void> =>
    azione(
      () =>
        api.post(`/api/companies/${company.uuid}/timer/start`, {
          task_uuid: taskUuid,
          description: descrizione
        }),
      'Timer avviato.'
    )

  const ferma = async (): Promise<void> => {
    let registrato = true
    await azione(async () => {
      const r = await api.post<{ stopped: TimeEntry | null }>('/api/timer/stop')
      registrato = r.stopped !== null
    })
    mostraAvviso(registrato ? 'Tempo registrato.' : 'Meno di un minuto: non l’ho registrato.', registrato ? 'ok' : 'info')
  }

  const sposta = (task: Task, stato: TaskStatus): void => {
    if (task.status === stato) return
    void azione(
      () => api.put(`/api/companies/${company.uuid}/tasks/${task.uuid}`, { status: stato }),
      `«${task.title}» ora è in "${TASK_STATUS_LABELS[stato]}".`
    )
  }

  const registraOre = (minutiScelti?: number): void => {
    const minuti = minutiScelti ?? parseDurata(tempo)
    if (!minuti) {
      mostraAvviso('Scegli quanto tempo (15 min, 30 min…) o scrivilo, per esempio 1:30.', 'errore')
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
      `Registrate ${durata(minuti)} ${giorno === dataLocale(new Date()) ? 'oggi' : `il ${dataIt(giorno)}`}.`
    ).then(() => {
      setTempo('')
      setManoNota('')
      setAltraDurata(false)
    })
  }

  if (!dati || !riepilogo) {
    return error ? <Alert>{error}</Alert> : <CaricamentoPagina />
  }

  const oggi = dataLocale(new Date())
  const aperte = dati.tasks.filter((t) => t.status !== 'done')
  const titoli = new Map(dati.tasks.map((t) => [t.uuid, t.title]))
  const minutiTask = (uuid: string): number => riepilogo.perAttivita[uuid] ?? 0
  const minutiScelti = parseDurata(tempo)

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

  const chip = (attivo: boolean): string =>
    `max-w-full shrink-0 truncate whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
      attivo
        ? 'border-brand-400/70 bg-brand-500/20 font-medium text-brand-100'
        : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500 hover:text-ink-100'
    }`

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert>{error}</Alert>}

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
                  ? 'imposta la tariffa in "Andamento"'
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
            <div className="flex flex-col gap-4 px-4 py-4 md:px-5">
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
                  <Button variant="danger" onClick={ferma} className="px-5">
                    <Icona nome="stop" pieno className="h-3.5 w-3.5" /> Ferma
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      void avvia(timerTask || null, timerNota)
                      setTimerNota('')
                    }}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 transition-transform hover:bg-brand-400 active:scale-95"
                    aria-label="Avvia il timer"
                    title="Avvia il timer"
                  >
                    <Icona nome="play" pieno className="ml-0.5 h-6 w-6" />
                  </button>
                  <div className="min-w-0">
                    <p className="font-mono text-3xl font-semibold tabular-nums text-ink-500">00:00:00</p>
                    <p className="text-xs text-ink-400">Un tocco per partire; l’attività puoi sceglierla qui sotto.</p>
                  </div>
                </div>
              )}

              {aperte.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={chip(timerTask === '')} onClick={() => setTimerTask('')}>
                    Lavoro generico
                  </button>
                  {aperte.slice(0, 8).map((t) => (
                    <button key={t.uuid} type="button" className={chip(timerTask === t.uuid)} onClick={() => setTimerTask(t.uuid)}>
                      {t.title}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <TextInput value={timerNota} onChange={(e) => setTimerNota(e.target.value)} placeholder="Cosa stai facendo (facoltativo)" />
                {running && (
                  <Button
                    onClick={() => {
                      void avvia(timerTask || null, timerNota)
                      setTimerNota('')
                    }}
                    className="shrink-0"
                    title="Ferma quello acceso e riparti con questa attività"
                  >
                    <Icona nome="play" pieno className="h-3 w-3" /> Cambia
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-ink-500">Un solo timer alla volta, in tutto il programma.</p>
            </div>
          </Card>

          <Card title="Registra ore">
            <div
              ref={registra}
              className={`flex flex-col gap-3.5 rounded-b-xl px-4 py-4 transition-shadow md:px-5 ${evidenzia ? 'shadow-[inset_0_0_0_2px] shadow-brand-400' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-12 text-xs text-ink-400">Quando</span>
                <button type="button" className={chip(giorno === oggi)} onClick={() => setGiorno(oggi)}>
                  Oggi
                </button>
                <button type="button" className={chip(giorno === ieri())} onClick={() => setGiorno(ieri())}>
                  Ieri
                </button>
                <input
                  type="date"
                  value={giorno}
                  max={oggi}
                  onChange={(e) => setGiorno(e.target.value)}
                  className={`${chip(giorno !== oggi && giorno !== ieri())} [color-scheme:dark] outline-none`}
                  aria-label="Un altro giorno"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-12 text-xs text-ink-400">Quanto</span>
                {DURATE_RAPIDE.map((d) => (
                  <button
                    key={d.minuti}
                    type="button"
                    className={chip(!altraDurata && minutiScelti === d.minuti)}
                    onClick={() => {
                      setAltraDurata(false)
                      setTempo(durataCampo(d.minuti))
                    }}
                  >
                    {d.label}
                  </button>
                ))}
                {altraDurata ? (
                  <input
                    autoFocus
                    value={tempo}
                    onChange={(e) => setTempo(e.target.value)}
                    placeholder="1:30"
                    className="w-20 rounded-full border border-brand-400/70 bg-ink-900 px-3 py-1.5 text-xs text-ink-100 outline-none"
                    aria-label="Durata"
                  />
                ) : (
                  <button type="button" className={chip(false)} onClick={() => setAltraDurata(true)}>
                    Altro…
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={manoTask} onChange={(e) => setManoTask(e.target.value)} aria-label="Attività">
                  <option value="">— lavoro generico —</option>
                  {dati.tasks.map((t) => (
                    <option key={t.uuid} value={t.uuid}>
                      {t.title}
                    </option>
                  ))}
                </Select>
                <TextInput value={manoNota} onChange={(e) => setManoNota(e.target.value)} placeholder="Descrizione (facoltativa)" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-ink-300">
                  <input
                    type="checkbox"
                    checked={fatturabile}
                    onChange={(e) => setFatturabile(e.target.checked)}
                    className="accent-brand-500"
                  />
                  Fatturabile
                </label>
                <Button variant="primary" className="ml-auto" onClick={() => registraOre()} disabled={!minutiScelti}>
                  <Icona nome="spunta" className="h-4 w-4" />
                  {minutiScelti ? `Registra ${durata(minutiScelti)}` : 'Registra'}
                </Button>
              </div>
            </div>
          </Card>
        </Griglia>

        <Card
          title={
            <Segmentato
              piccolo
              valore={scheda}
              onChange={setScheda}
              className="normal-case tracking-normal"
              opzioni={[
                { id: 'bacheca', label: `Bacheca · ${aperte.length}` },
                { id: 'registro', label: 'Registro ore' },
                { id: 'andamento', label: 'Andamento' }
              ]}
            />
          }
          actions={
            scheda === 'bacheca' ? (
              <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setModale({ task: null, stato: 'todo' })}>
                <Icona nome="piu" className="h-3.5 w-3.5" /> Nuova
              </Button>
            ) : undefined
          }
        >
          {scheda === 'bacheca' && (
            <div className="@container">
              {/* Su schermo stretto: una colonna alla volta, scelta qui. */}
              <div className="flex gap-1 overflow-x-auto px-4 pt-3 @xl:hidden">
                {TASK_STATUSES.map((stato) => (
                  <button key={stato} type="button" onClick={() => setColonna(stato)} className={chip(colonna === stato)}>
                    <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${COLONNA_STILE[stato]}`} />
                    {TASK_STATUS_LABELS[stato]} · {dati.tasks.filter((t) => t.status === stato).length}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 p-4 @xl:grid-cols-2 @4xl:grid-cols-4">
                {TASK_STATUSES.map((stato) => {
                  const lista = dati.tasks.filter((t) => t.status === stato)
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
                      } ${stato !== colonna ? '@max-xl:hidden' : ''}`}
                    >
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <span className={`h-2 w-2 rounded-full ${COLONNA_STILE[stato]}`} />
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-300">
                          {TASK_STATUS_LABELS[stato]}
                        </span>
                        <span className="text-xs text-ink-500">{lista.length}</span>
                        {stato !== 'done' && (
                          <button
                            type="button"
                            onClick={() => setModale({ task: null, stato })}
                            className="ml-auto rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-100"
                            title={`Nuova attività in "${TASK_STATUS_LABELS[stato]}"`}
                            aria-label={`Nuova attività in "${TASK_STATUS_LABELS[stato]}"`}
                          >
                            <Icona nome="piu" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {lista.map((task) => (
                        <SchedaAttivita
                          key={task.uuid}
                          task={task}
                          minuti={minutiTask(task.uuid)}
                          oggi={oggi}
                          acceso={running?.entry.task_uuid === task.uuid}
                          onApri={() => setModale({ task, stato: task.status })}
                          onStato={(s) => sposta(task, s)}
                          onAvvia={() => void avvia(task.uuid)}
                        />
                      ))}
                      {lista.length === 0 && (
                        <p className="px-1 py-3 text-center text-xs text-ink-600">
                          {stato === 'done' ? 'Qui finisce ciò che è concluso' : 'Nessuna attività'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {scheda === 'registro' &&
            (perGiorno.size === 0 ? (
              <EmptyState
                title="Ancora nessuna ora registrata"
                description="Avvia il timer mentre lavori per questa azienda, oppure registra le ore qui sopra: qui compare il registro giorno per giorno."
              />
            ) : (
              <div className="divide-y divide-ink-800">
                {[...perGiorno.entries()].map(([giornoVoci, voci]) => {
                  const totale = voci.reduce((s, v) => s + minutiVoce(v, new Date()), 0)
                  return (
                    <div key={giornoVoci} className="px-4 py-3 md:px-5">
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
                          <button
                            key={v.uuid}
                            type="button"
                            disabled={aperta}
                            onClick={() => setVoceInModifica(v)}
                            className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-800/70 disabled:hover:bg-transparent"
                            title={aperta ? 'Il timer sta contando' : 'Correggi questa voce'}
                          >
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
                            {!aperta && <Icona nome="matita" className="h-3.5 w-3.5 shrink-0 text-ink-600 group-hover:text-ink-300" />}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}

          {scheda === 'andamento' && (
            <div className="grid gap-4 p-4 lg:grid-cols-[1fr_18rem]">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Ore per settimana</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={grafico} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--color-ink-700)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--color-ink-400)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: 'var(--color-ink-400)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                      tickFormatter={(v: number) => `${v}h`}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--color-ink-700)', opacity: 0.4 }}
                      contentStyle={{ background: 'var(--color-ink-850)', border: '1px solid var(--color-ink-600)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => `${String(v).replace('.', ',')} h`}
                      labelFormatter={(l) => `Settimana del ${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar name="Fatturabili" dataKey="fatturabili" stackId="ore" fill={COLORI.ricavi} />
                    <Bar name="Non fatturabili" dataKey="altre" stackId="ore" fill="var(--color-ink-500)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <form
                className="flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-900/50 p-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  const cents = tariffa.trim() ? parseEuro(tariffa) : null
                  if (tariffa.trim() && (cents === null || cents < 0)) {
                    mostraAvviso('Tariffa non valida: scrivi un importo in euro, per esempio 80.', 'errore')
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
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Tariffa oraria</p>
                <p className="text-xs text-ink-400">
                  Quanto vale un’ora di lavoro per questa azienda. Dà un valore alle ore fatturabili: non crea
                  fatture e non entra nei conti dell’azienda.
                </p>
                <div className="flex items-end gap-2">
                  <Field label="Euro all’ora">
                    <TextInput
                      value={tariffa}
                      onChange={(e) => setTariffa(e.target.value)}
                      inputMode="decimal"
                      placeholder="es. 80"
                      className="w-28"
                    />
                  </Field>
                  <Button type="submit">Salva</Button>
                </div>
              </form>
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
      {voceInModifica && (
        <ModificaVoce
          companyUuid={company.uuid}
          voce={voceInModifica}
          tasks={dati.tasks}
          onClose={() => setVoceInModifica(null)}
          onSaved={(messaggio) => {
            setVoceInModifica(null)
            mostraAvviso(messaggio)
            void carica()
          }}
        />
      )}
    </div>
  )
}
