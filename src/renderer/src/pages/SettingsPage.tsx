import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ACCENTI,
  ACCENTO_LABELS,
  BACKUP_MAX,
  BACKUP_MIN,
  MODULI,
  MODULO_INFO,
  type Accento,
  type AppSettings,
  type Tema,
  type UserSettings
} from '@shared/settings'
import type { Profile, UserListItem } from '@shared/types'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useImpostazioni } from '../lib/impostazioni'
import { Alert, Button, Card, Field, Interruttore, Modal, Schede, Segmentato, Select, TextInput } from '../components/ui'
import { CREDITI_OPEN_SOURCE } from '../lib/open-source'

/**
 * Impostazioni — AGENTS.md §10.12 (versione 1.3.0).
 *
 * Il consulente ci trova tutto il programma: generale, moduli, utenti dello
 * studio e accessi delle aziende, il proprio profilo. L'operatore Azienda ci
 * arriva solo per il proprio profilo (`soloProfilo`).
 */

type Scheda = 'generale' | 'moduli' | 'utenti' | 'profilo' | 'info'

export function SettingsPage({ soloProfilo = false }: { soloProfilo?: boolean }): React.JSX.Element {
  const [scheda, setScheda] = useState<Scheda>(soloProfilo ? 'profilo' : 'generale')
  const schede: { id: Scheda; label: string }[] = soloProfilo
    ? [
        { id: 'profilo', label: 'Il mio profilo' },
        { id: 'info', label: 'Informazioni' }
      ]
    : [
        { id: 'generale', label: 'Generale' },
        { id: 'moduli', label: 'Moduli' },
        { id: 'utenti', label: 'Utenti e accessi' },
        { id: 'profilo', label: 'Il mio profilo' },
        { id: 'info', label: 'Informazioni' }
      ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-ink-700 px-4 pt-4 md:px-8 md:pt-5">
        <h1 className="text-lg font-semibold text-ink-100">{soloProfilo ? 'Profilo' : 'Impostazioni'}</h1>
        <p className="mt-0.5 mb-3 text-xs text-ink-400">
          {soloProfilo
            ? 'I tuoi recapiti, la password, il tema e il colore.'
            : 'Si salvano da sole a ogni modifica e valgono per chiunque entri da questo computer.'}
        </p>
        <Schede schede={schede} attiva={scheda} onChange={setScheda} />
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-8 md:py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {scheda === 'generale' && <Generale />}
          {scheda === 'moduli' && <Moduli />}
          {scheda === 'utenti' && <Utenti />}
          {scheda === 'profilo' && <MioProfilo />}
          {scheda === 'info' && <Informazioni />}
        </div>
      </div>
    </div>
  )
}

/** Salva e mostra l'esito accanto, senza finestre: "Salvato" sparisce da solo. */
function useSalvataggio(): {
  stato: string | null
  errore: string | null
  esegui: (azione: () => Promise<unknown>, ok?: string) => Promise<void>
} {
  const [stato, setStato] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const esegui = useCallback(async (azione: () => Promise<unknown>, ok = 'Salvato.') => {
    setErrore(null)
    try {
      await azione()
      setStato(ok)
      setTimeout(() => setStato(null), 2500)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    }
  }, [])
  return { stato, errore, esegui }
}

function Esito({ stato, errore }: { stato: string | null; errore: string | null }): React.JSX.Element | null {
  if (errore) return <Alert>{errore}</Alert>
  if (stato) return <Alert tone="success">{stato}</Alert>
  return null
}

// --- Generale -----------------------------------------------------------------

const TEMI: { id: Tema; label: string }[] = [
  { id: 'scuro', label: 'Scuro' },
  { id: 'chiaro', label: 'Chiaro' },
  { id: 'sistema', label: 'Come il sistema' }
]

/** I colori d'accento come si vedono: un pallino per scelta. */
const CAMPIONI: Record<Accento, string> = {
  blu: '#3b82f6',
  turchese: '#0d9488',
  viola: '#7c3aed',
  indaco: '#4f46e5'
}

function SceltaTema({
  utente,
  onSalva
}: {
  utente: UserSettings
  onSalva: (p: Partial<UserSettings>) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 py-3">
      <div>
        <p className="text-sm text-ink-100">Tema</p>
        <p className="mt-0.5 text-xs text-ink-400">Vale per il tuo accesso, anche sugli altri computer dello studio.</p>
        <Segmentato
          className="mt-2"
          valore={utente.tema}
          onChange={(tema) => onSalva({ tema })}
          opzioni={TEMI.map((t) => ({ id: t.id, label: t.label }))}
        />
      </div>
      <div>
        <p className="text-sm text-ink-100">Colore d'accento</p>
        <p className="mt-0.5 text-xs text-ink-400">Pulsanti, evidenze e sezione aperta nel menu.</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Colore d'accento">
          {ACCENTI.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={utente.accento === a}
              onClick={() => onSalva({ accento: a })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                utente.accento === a ? 'border-ink-400 bg-ink-800 text-ink-100' : 'border-ink-700 text-ink-300 hover:bg-ink-800'
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full ring-offset-2 ring-offset-ink-850 ${utente.accento === a ? 'ring-2 ring-ink-200' : ''}`}
                style={{ background: CAMPIONI[a] }}
              />
              {ACCENTO_LABELS[a]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Generale(): React.JSX.Element {
  const { app, utente, salvaApp, salvaUtente } = useImpostazioni()
  const { stato, errore, esegui } = useSalvataggio()
  const [studio, setStudio] = useState(app.studio)
  useEffect(() => setStudio(app.studio), [app.studio])

  const cambiaApp = (p: Partial<AppSettings>): void => void esegui(() => salvaApp(p))
  const cambiaUtente = (p: Partial<UserSettings>): void => void esegui(() => salvaUtente(p))

  return (
    <>
      <Esito stato={stato} errore={errore} />
      <Card title="Aspetto e avvisi">
        <div className="divide-y divide-ink-800 px-5">
          <SceltaTema utente={utente} onSalva={cambiaUtente} />
          <Interruttore
            label="Avvisi sul desktop"
            descrizione="Un avviso di sistema quando un'azienda manda una richiesta o risponde."
            acceso={utente.avvisiDesktop}
            onChange={(v) => cambiaUtente({ avvisiDesktop: v })}
          />
          <Interruttore
            label="Squillo per le chiamate"
            descrizione="Un suono breve quando un'azienda chiede di essere chiamata."
            acceso={utente.suonoChiamate}
            onChange={(v) => cambiaUtente({ suonoChiamate: v })}
          />
        </div>
      </Card>

      <Card title="Aggiornamenti e sicurezza dei dati">
        <div className="divide-y divide-ink-800 px-5">
          <Interruttore
            label="Cerca da solo gli aggiornamenti"
            descrizione="All'avvio e ogni sei ore. Il pulsante Aggiornamenti in basso funziona sempre."
            acceso={app.aggiornamentiAutomatici}
            onChange={(v) => cambiaApp({ aggiornamentiAutomatici: v })}
          />
          <Interruttore
            label="Backup automatico, uno al giorno"
            descrizione="Una copia cifrata del database al primo avvio della giornata, in Documenti › backup › automatici."
            acceso={app.backupAutomatico}
            onChange={(v) => cambiaApp({ backupAutomatico: v })}
          />
          <div className={`flex items-center gap-4 py-3 ${app.backupAutomatico ? '' : 'opacity-50'}`}>
            <div className="flex-1">
              <p className="text-sm text-ink-100">Copie da tenere</p>
              <p className="mt-0.5 text-xs text-ink-400">Le più vecchie si cancellano da sole. Quelle fatte a mano restano.</p>
            </div>
            <Select
              className="w-28"
              value={app.backupDaTenere}
              disabled={!app.backupAutomatico}
              onChange={(e) => cambiaApp({ backupDaTenere: Number(e.target.value) })}
            >
              {[3, 7, 14, 30, 60]
                .filter((n) => n >= BACKUP_MIN && n <= BACKUP_MAX)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} giorni
                  </option>
                ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card title="Lo studio">
        <form
          className="grid gap-4 px-5 py-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            void esegui(() => salvaApp({ studio }))
          }}
        >
          <p className="text-xs text-ink-400 md:col-span-3">
            Come vi presentate alle aziende: lo vedono nel loro riepilogo, sotto “Il tuo consulente”.
          </p>
          <Field label="Nome dello studio">
            <TextInput value={studio.nome} onChange={(e) => setStudio({ ...studio, nome: e.target.value })} placeholder="Studio Rossi" />
          </Field>
          <Field label="Telefono">
            <TextInput value={studio.telefono} onChange={(e) => setStudio({ ...studio, telefono: e.target.value })} inputMode="tel" />
          </Field>
          <Field label="Email">
            <TextInput value={studio.email} onChange={(e) => setStudio({ ...studio, email: e.target.value })} inputMode="email" />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" variant="primary">
              Salva i dati dello studio
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}

// --- Moduli ---------------------------------------------------------------------

function Moduli(): React.JSX.Element {
  const { app, salvaApp } = useImpostazioni()
  const { stato, errore, esegui } = useSalvataggio()
  return (
    <>
      <Esito stato={stato} errore={errore} />
      <Card title="Moduli nel menu">
        <p className="px-5 pt-4 text-xs text-ink-400">
          Un modulo spento sparisce dal menu per tutti, aziende comprese. I dati restano: riaccendendolo
          si ritrova tutto com&apos;era. Le schermate sui bilanci ci sono sempre.
        </p>
        <div className="divide-y divide-ink-800 px-5">
          {MODULI.map((m) => (
            <Interruttore
              key={m}
              label={MODULO_INFO[m].label}
              descrizione={MODULO_INFO[m].descrizione}
              acceso={app.moduli[m]}
              onChange={(v) => void esegui(() => salvaApp({ moduli: { ...app.moduli, [m]: v } }))}
            />
          ))}
        </div>
      </Card>
    </>
  )
}

// --- Utenti e accessi --------------------------------------------------------

function quando(iso: string | null): string {
  if (!iso) return 'mai'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

type Dialogo = { tipo: 'nuovo-consulente' } | { tipo: 'modifica'; utente: UserListItem } | { tipo: 'password'; utente: UserListItem } | null

function Utenti(): React.JSX.Element {
  const { user } = useAuth()
  const [utenti, setUtenti] = useState<UserListItem[]>([])
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const { stato, errore, esegui } = useSalvataggio()

  const carica = useCallback(async () => {
    setUtenti(await api.get<UserListItem[]>('/api/auth/users'))
  }, [])
  useEffect(() => {
    void carica()
  }, [carica])

  const consulenti = utenti.filter((u) => u.role === 'consultant')
  const aziende = utenti.filter((u) => u.role === 'company')

  const attiva = (u: UserListItem): void =>
    void esegui(async () => {
      await api.put(`/api/auth/users/${u.uuid}`, { active: !u.active })
      await carica()
    }, u.active ? `Accesso di ${u.full_name} disattivato.` : `Accesso di ${u.full_name} riattivato.`)

  const elimina = (u: UserListItem): void => {
    if (!confirm(`Eliminare l'accesso di ${u.full_name} (${u.username})?`)) return
    void esegui(async () => {
      await api.delete(`/api/auth/users/${u.uuid}`)
      await carica()
    }, 'Accesso eliminato.')
  }

  const riga = (u: UserListItem): React.JSX.Element => (
    <div key={u.uuid} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-100">
          {u.full_name}
          {u.uuid === user?.uuid && <span className="ml-2 text-xs text-brand-300">(tu)</span>}
          {!u.active && <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">disattivato</span>}
        </p>
        <p className="text-xs text-ink-400">
          {u.username}
          {u.company_name ? ` · ${u.company_name}` : ''}
          {u.phone ? ` · ${u.phone}` : ''} · ultimo accesso {quando(u.last_login)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="px-2.5 py-1 text-xs" onClick={() => setDialogo({ tipo: 'modifica', utente: u })}>
          Modifica
        </Button>
        <Button className="px-2.5 py-1 text-xs" onClick={() => setDialogo({ tipo: 'password', utente: u })}>
          Nuova password
        </Button>
        {u.uuid !== user?.uuid && (
          <>
            <Button className="px-2.5 py-1 text-xs" onClick={() => attiva(u)}>
              {u.active ? 'Disattiva' : 'Riattiva'}
            </Button>
            <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => elimina(u)}>
              Elimina
            </Button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      <Esito stato={stato} errore={errore} />
      <Card
        title="Consulenti dello studio"
        actions={
          <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setDialogo({ tipo: 'nuovo-consulente' })}>
            + Nuovo consulente
          </Button>
        }
      >
        <p className="px-5 pt-3 text-xs text-ink-400">
          I consulenti sono gli amministratori: vedono tutte le aziende, gestiscono gli accessi e rispondono alle
          richieste. Un accesso disattivato smette di funzionare subito.
        </p>
        <div className="divide-y divide-ink-800">{consulenti.map(riga)}</div>
      </Card>

      <Card title="Accessi delle aziende">
        {aziende.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-400">
            Nessun accesso azienda. Si crea da Clienti e Aziende (pulsante Accesso) o dalle impostazioni dell&apos;azienda.
          </p>
        ) : (
          <div className="divide-y divide-ink-800">{aziende.map(riga)}</div>
        )}
      </Card>

      {dialogo?.tipo === 'nuovo-consulente' && (
        <NuovoConsulente
          onClose={() => setDialogo(null)}
          onCreato={() => {
            setDialogo(null)
            void carica()
          }}
        />
      )}
      {dialogo?.tipo === 'modifica' && (
        <ModificaUtente
          utente={dialogo.utente}
          onClose={() => setDialogo(null)}
          onSalvato={() => {
            setDialogo(null)
            void carica()
          }}
        />
      )}
      {dialogo?.tipo === 'password' && (
        <NuovaPassword utente={dialogo.utente} onClose={() => setDialogo(null)} />
      )}
    </>
  )
}

export function NuovoConsulente({ onClose, onCreato }: { onClose: () => void; onCreato: () => void }): React.JSX.Element {
  const [form, setForm] = useState({ full_name: '', username: '', password: '', phone: '', email: '' })
  const [errore, setErrore] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const invia = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setErrore(null)
    try {
      await api.post('/api/auth/users/consultant', form)
      onCreato()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Creazione non riuscita.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Nuovo consulente" subtitle="Un collega dello studio: vedrà tutte le aziende e gestirà gli accessi." onClose={onClose}>
      <form onSubmit={invia}>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          {errore && (
            <div className="md:col-span-2">
              <Alert>{errore}</Alert>
            </div>
          )}
          <div className="md:col-span-2">
            <Field label="Nome e cognome" required>
              <TextInput value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus required />
            </Field>
          </div>
          <Field label="Username" required>
            <TextInput value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" required />
          </Field>
          <Field label="Password" hint="Almeno 8 caratteri." required>
            <TextInput type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
          </Field>
          <Field label="Telefono">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </Field>
          <Field label="Email">
            <TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" />
          </Field>
        </div>
        <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creazione…' : 'Crea consulente'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export function ModificaUtente({
  utente,
  onClose,
  onSalvato
}: {
  utente: UserListItem
  onClose: () => void
  onSalvato: () => void
}): React.JSX.Element {
  const [form, setForm] = useState({ full_name: utente.full_name, phone: utente.phone ?? '', email: utente.email ?? '' })
  const [errore, setErrore] = useState<string | null>(null)
  const invia = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setErrore(null)
    try {
      await api.put(`/api/auth/users/${utente.uuid}`, form)
      onSalvato()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    }
  }
  return (
    <Modal title={`Modifica ${utente.full_name}`} subtitle={`Username: ${utente.username} (non si cambia: serve per entrare).`} onClose={onClose}>
      <form onSubmit={invia}>
        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          {errore && (
            <div className="md:col-span-2">
              <Alert>{errore}</Alert>
            </div>
          )}
          <div className="md:col-span-2">
            <Field label="Nome e cognome" required>
              <TextInput value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </Field>
          </div>
          <Field label="Telefono" hint={utente.role === 'company' ? 'Il numero a cui lo studio richiama.' : undefined}>
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </Field>
          <Field label="Email">
            <TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" />
          </Field>
        </div>
        <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary">
            Salva
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export function NuovaPassword({ utente, onClose }: { utente: UserListItem; onClose: () => void }): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState(false)
  const invia = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setErrore(null)
    try {
      await api.post(`/api/auth/users/${utente.uuid}/password`, { password })
      setFatto(true)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }
  return (
    <Modal title="Nuova password" subtitle={`Per ${utente.full_name} (${utente.username}). Comunicagliela tu: il programma non manda email.`} onClose={onClose}>
      <form onSubmit={invia}>
        <div className="flex flex-col gap-4 px-6 py-5">
          {errore && <Alert>{errore}</Alert>}
          {fatto ? (
            <Alert tone="success">Password cambiata. Da adesso vale quella nuova.</Alert>
          ) : (
            <Field label="Nuova password" hint="Almeno 8 caratteri." required>
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus required />
            </Field>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            {fatto ? 'Chiudi' : 'Annulla'}
          </Button>
          {!fatto && (
            <Button type="submit" variant="primary">
              Cambia password
            </Button>
          )}
        </footer>
      </form>
    </Modal>
  )
}

// --- Il mio profilo ---------------------------------------------------------------

function MioProfilo(): React.JSX.Element {
  const { updateUser } = useAuth()
  const { utente, salvaUtente } = useImpostazioni()
  const [profilo, setProfilo] = useState<Profile | null>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' })
  const [pwd, setPwd] = useState({ current: '', password: '' })
  const { stato, errore, esegui } = useSalvataggio()

  useEffect(() => {
    api.get<Profile>('/api/auth/me').then((p) => {
      setProfilo(p)
      setForm({ full_name: p.full_name, phone: p.phone ?? '', email: p.email ?? '' })
    })
  }, [])

  if (!profilo) return <p className="text-sm text-ink-400">Caricamento…</p>

  return (
    <>
      <Esito stato={stato} errore={errore} />
      <Card title="I tuoi dati">
        <form
          className="grid gap-4 px-5 py-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void esegui(async () => {
              const p = await api.put<Profile>('/api/auth/me', form)
              setProfilo(p)
              updateUser(p)
            })
          }}
        >
          <div className="md:col-span-2">
            <Field label="Nome e cognome" required>
              <TextInput value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </Field>
          </div>
          <Field
            label="Telefono"
            hint={profilo.role === 'company' ? 'Il consulente ti richiama qui quando chiedi una chiamata.' : undefined}
          >
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </Field>
          <Field label="Email">
            <TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" />
          </Field>
          <p className="text-xs text-ink-400 md:col-span-2">Username: {profilo.username} — non si cambia, serve per entrare.</p>
          <div className="md:col-span-2">
            <Button type="submit" variant="primary">
              Salva
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Password">
        <form
          className="grid gap-4 px-5 py-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void esegui(async () => {
              await api.post('/api/auth/me/password', pwd)
              setPwd({ current: '', password: '' })
            }, 'Password cambiata.')
          }}
        >
          <Field label="Password attuale" required>
            <TextInput type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" required />
          </Field>
          <Field label="Nuova password" hint="Almeno 8 caratteri." required>
            <TextInput type="password" value={pwd.password} onChange={(e) => setPwd({ ...pwd, password: e.target.value })} autoComplete="new-password" required />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit">Cambia password</Button>
          </div>
        </form>
      </Card>

      <Card title="Aspetto">
        <div className="px-5">
          <SceltaTema utente={utente} onSalva={(p) => void esegui(() => salvaUtente(p))} />
        </div>
      </Card>
    </>
  )
}

// --- Informazioni ----------------------------------------------------------------

function Informazioni(): React.JSX.Element {
  const { version, demoBuild } = useAuth()
  return (
    <>
      <Card title="DaProdFinanza">
        <div className="flex flex-col gap-2 px-5 py-4 text-sm text-ink-300">
          <p>
            Versione <span className="font-mono text-ink-100">{version}</span>
            {demoBuild ? ' — versione dimostrativa' : ''}
          </p>
          <p>Gestionale di controllo di gestione per consulenti. Licenza MIT, © DaProdProduzioni.</p>
          <div>
            <Button className="px-3 py-1 text-xs" onClick={() => void window.daprod.openDataFolder()}>
              Apri la cartella dei dati
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Componenti open source inclusi">
        <p className="px-5 pt-3 text-xs text-ink-400">
          Il programma apre PDF, fogli di calcolo, documenti Word e presentazioni al proprio interno, senza bisogno di
          Office, grazie a questi progetti liberi.
        </p>
        <ul className="divide-y divide-ink-800 px-5 py-2 text-sm">
          {CREDITI_OPEN_SOURCE.map((c) => (
            <li key={c.nome} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
              <span className="text-ink-100">{c.nome}</span>
              <span className="text-xs text-ink-400">
                {c.aCosaServe} · {c.licenza}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
