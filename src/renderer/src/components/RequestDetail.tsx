import { useCallback, useEffect, useRef, useState } from 'react'
import {
  preferredTimeLabel,
  REQUEST_KIND_LABELS,
  REQUEST_OPEN_STATUSES,
  REQUEST_STATUS_LABELS,
  type DocumentItem,
  type RequestAction,
  type RequestDetail as Dettaglio,
  type RequestEvent,
  type RequestStatus
} from '@shared/documents'
import type { UserListItem } from '@shared/types'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useImpostazioni } from '../lib/impostazioni'
import { segnalaAzione, useAlCambioRichieste } from '../lib/inbox'
import { Alert, Button, TextArea, TextInput } from './ui'
import { UploadDialog } from './UploadDialog'
import { DocumentViewer } from './viewer/DocumentViewer'

/**
 * Una richiesta aperta: la storia, i documenti, la risposta — e per lo studio i
 * pulsanti della chiamata (AGENTS.md §10.14). La usano sia il consulente sia
 * l'azienda: cambia solo quali pulsanti ci sono.
 */

export const TONO_STATO: Record<RequestStatus, string> = {
  inviata: 'border-warning/40 bg-warning/10 text-warning',
  vista: 'border-brand-500/40 bg-brand-500/10 text-brand-300',
  in_carico: 'border-brand-500/40 bg-brand-500/15 text-brand-300',
  in_attesa: 'border-warning/40 bg-warning/10 text-warning',
  risolta: 'border-positive/40 bg-positive/10 text-positive',
  annullata: 'border-ink-600 bg-ink-800 text-ink-400'
}

export function StatoRichiesta({ status }: { status: RequestStatus }): React.JSX.Element {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONO_STATO[status]}`}>
      {REQUEST_STATUS_LABELS[status]}
    </span>
  )
}

export function quandoBreve(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const ieri = new Date()
  ieri.setDate(oggi.getDate() - 1)
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === oggi.toDateString()) return `oggi ${ora}`
  if (d.toDateString() === ieri.toDateString()) return `ieri ${ora}`
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} ${ora}`
}

const ICONE: Record<RequestEvent['kind'], string> = {
  creata: '✉️',
  vista: '👁',
  messaggio: '💬',
  stato: '•',
  documento: '📎',
  chiamata: '📞',
  richiamo: '🕒',
  assegnata: '👤'
}

/** Il numero di telefono come link: sul telefono chiama, sul computer lo passa all'app che gestisce le chiamate. */
export function chiama(numero: string): void {
  window.open(`tel:${numero.replace(/[^\d+]/g, '')}`)
}

function dataLocale(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Le scelte rapide di "Richiamo…": tra poco, oggi pomeriggio, domattina. */
function sceltePerRichiamo(): { label: string; quando: Date }[] {
  const ora = new Date()
  const tra = (min: number): Date => new Date(ora.getTime() + min * 60_000)
  const alle = (giorni: number, h: number): Date => {
    const d = new Date(ora)
    d.setDate(d.getDate() + giorni)
    d.setHours(h, 0, 0, 0)
    return d
  }
  const scelte = [
    { label: 'Tra 15 minuti', quando: tra(15) },
    { label: 'Tra un’ora', quando: tra(60) }
  ]
  if (ora.getHours() < 15) scelte.push({ label: 'Oggi alle 15:00', quando: alle(0, 15) })
  if (ora.getHours() < 17) scelte.push({ label: 'Oggi alle 17:30', quando: new Date(alle(0, 17).getTime() + 30 * 60_000) })
  scelte.push({ label: 'Domani alle 9:00', quando: alle(1, 9) })
  return scelte
}

export function RequestDetail({
  companyUuid,
  requestUuid,
  onChiudi
}: {
  companyUuid: string
  requestUuid: string
  onChiudi?: () => void
}): React.JSX.Element {
  const { user } = useAuth()
  const { portale, moduloAttivo } = useImpostazioni()
  const studio = user?.role === 'consultant'
  const [r, setR] = useState<Dettaglio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [testo, setTesto] = useState('')
  const [invio, setInvio] = useState(false)
  const [pannello, setPannello] = useState<'richiamo' | 'fatta' | 'attesa' | 'assegna' | null>(null)
  const [nota, setNota] = useState('')
  const [minuti, setMinuti] = useState('10')
  const [quando, setQuando] = useState(() => dataLocale(new Date(Date.now() + 60 * 60_000)))
  const [colleghi, setColleghi] = useState<UserListItem[]>([])
  const [allega, setAllega] = useState(false)
  const [aperto, setAperto] = useState<DocumentItem | null>(null)
  const fondo = useRef<HTMLDivElement>(null)

  const puoScrivere = studio || Boolean(portale?.permessi.scrivereMessaggi)
  const puoAllegare = studio || Boolean(portale?.permessi.inviareDocumenti)

  const ricarica = useCallback(async () => {
    try {
      setR(await api.get<Dettaglio>(`/api/companies/${companyUuid}/requests/${requestUuid}`))
      setErrore(null)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Richiesta non disponibile.')
    }
  }, [companyUuid, requestUuid])

  useEffect(() => {
    void ricarica().then(() => segnalaAzione())
  }, [ricarica])
  useAlCambioRichieste(ricarica)

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' })
  }, [r?.events.length])

  const azione = async (action: RequestAction, extra: Record<string, unknown> = {}): Promise<void> => {
    setErrore(null)
    try {
      await api.post(`/api/companies/${companyUuid}/requests/${requestUuid}/actions`, { action, ...extra })
      setPannello(null)
      setNota('')
      await ricarica()
      segnalaAzione()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  const rispondi = async (risolvi = false): Promise<void> => {
    if (!testo.trim()) return
    setInvio(true)
    setErrore(null)
    try {
      await api.post(`/api/companies/${companyUuid}/requests/${requestUuid}/messages`, { text: testo, risolvi })
      setTesto('')
      await ricarica()
      segnalaAzione()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Messaggio non inviato.')
    } finally {
      setInvio(false)
    }
  }

  const apriAssegna = async (): Promise<void> => {
    setPannello('assegna')
    const tutti = await api.get<UserListItem[]>('/api/auth/users')
    setColleghi(tutti.filter((u) => u.role === 'consultant' && u.active))
  }

  if (errore && !r) return <Alert>{errore}</Alert>
  if (!r) return <p className="p-4 text-sm text-ink-400">Caricamento…</p>

  const aperta = (REQUEST_OPEN_STATUSES as string[]).includes(r.status)
  const chiamata = r.kind === 'chiamata'
  const documentiPerUuid = new Map(r.documents.map((d) => [d.uuid, d]))

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-ink-700 px-4 py-3 md:px-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-ink-400">
              {REQUEST_KIND_LABELS[r.kind]} n. {r.number}
              {studio && r.company_name ? ` · ${r.company_name}` : ''}
              {r.urgent ? ' · urgente' : ''}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-ink-100">{r.subject}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <StatoRichiesta status={r.status} />
              {r.assigned_name && <span>se ne occupa {r.assigned_name}</span>}
              <span>aperta da {r.created_by_name} {quandoBreve(r.created_at)}</span>
              {r.due_date && <span>· entro il {r.due_date.split('-').reverse().join('/')}</span>}
            </div>
          </div>
          {onChiudi && (
            <button type="button" onClick={onChiudi} className="rounded px-2 text-xl leading-none text-ink-400 hover:text-ink-100" aria-label="Chiudi">
              ×
            </button>
          )}
        </div>

        {chiamata && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
            <span className="text-ink-300">
              📞 <span className="font-mono text-ink-100">{r.phone}</span>
            </span>
            {r.preferred_time && <span className="text-xs text-ink-400">preferisce: {preferredTimeLabel(r.preferred_time)}</span>}
            {r.callback_at && aperta && (
              <span className="text-xs text-brand-300">richiamo previsto {quandoBreve(r.callback_at)}</span>
            )}
          </div>
        )}

        {studio && aperta && (
          <div className="mt-3 flex flex-wrap gap-2">
            {chiamata && (
              <>
                <Button
                  variant="primary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => {
                    if (r.phone) chiama(r.phone)
                    void azione('chiamo_ora')
                  }}
                >
                  📞 Chiamo ora
                </Button>
                <Button className="px-3 py-1.5 text-xs" onClick={() => setPannello(pannello === 'richiamo' ? null : 'richiamo')}>
                  🕒 Richiamo…
                </Button>
                <Button className="px-3 py-1.5 text-xs" onClick={() => setPannello(pannello === 'fatta' ? null : 'fatta')}>
                  ✔ Chiamata fatta
                </Button>
                <Button className="px-3 py-1.5 text-xs" onClick={() => void azione('non_risponde')}>
                  📵 Non risponde
                </Button>
              </>
            )}
            {r.assigned_uuid !== user?.uuid && (
              <Button className="px-3 py-1.5 text-xs" onClick={() => void azione('prendi_in_carico')}>
                ✋ Prendo in carico
              </Button>
            )}
            <Button className="px-3 py-1.5 text-xs" onClick={() => setPannello(pannello === 'attesa' ? null : 'attesa')}>
              ⏳ Aspetto l’azienda
            </Button>
            {!chiamata && (
              <Button className="px-3 py-1.5 text-xs" onClick={() => void azione('risolvi')}>
                ✔ Risolta
              </Button>
            )}
            <Button className="px-3 py-1.5 text-xs" onClick={() => void apriAssegna()}>
              👤 Affida a…
            </Button>
            <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => confirm('Annullare la richiesta?') && void azione('annulla')}>
              Annulla
            </Button>
          </div>
        )}
        {!studio && aperta && (
          <div className="mt-3">
            <Button className="px-3 py-1 text-xs" onClick={() => confirm('Annullare la richiesta?') && void azione('annulla')}>
              Annulla la richiesta
            </Button>
          </div>
        )}
        {!aperta && (
          <div className="mt-3">
            <Button className="px-3 py-1 text-xs" onClick={() => void azione('riapri')}>
              ↺ Riapri
            </Button>
          </div>
        )}

        {pannello === 'richiamo' && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
            <p className="text-xs text-ink-300">Quando richiami? L’azienda lo vede subito.</p>
            <div className="flex flex-wrap gap-2">
              {sceltePerRichiamo().map((s) => (
                <Button key={s.label} className="px-2.5 py-1 text-xs" onClick={() => void azione('richiamo', { callback_at: s.quando.toISOString(), text: nota })}>
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TextInput type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="w-56 py-1 text-xs" />
              <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => void azione('richiamo', { callback_at: new Date(quando).toISOString(), text: nota })}>
                Conferma
              </Button>
            </div>
            <TextInput value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota per l’azienda (facoltativa): «sono in riunione, ti chiamo dopo»" className="py-1 text-xs" />
          </div>
        )}
        {pannello === 'fatta' && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
            <TextArea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Com’è andata? (l’azienda lo legge nella storia)" className="min-h-14 text-xs" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
              {moduloAttivo('attivita') && (
                <>
                  <span>Durata</span>
                  <TextInput value={minuti} onChange={(e) => setMinuti(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-16 py-1 text-xs" />
                  <span>minuti, nelle ore dello studio</span>
                </>
              )}
              <Button variant="primary" className="ml-auto px-3 py-1 text-xs" onClick={() => void azione('chiamata_fatta', { text: nota, minutes: Number(minuti) || 0 })}>
                Segna come fatta
              </Button>
            </div>
          </div>
        )}
        {pannello === 'attesa' && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
            <TextInput value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Cosa serve dall’azienda? «Mandami l’estratto conto di agosto»" className="py-1 text-xs" />
            <div>
              <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => void azione('in_attesa', { text: nota || undefined })}>
                Segna “in attesa dell’azienda”
              </Button>
            </div>
          </div>
        )}
        {pannello === 'assegna' && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
            {colleghi.length === 0 ? (
              <span className="text-xs text-ink-400">Caricamento…</span>
            ) : (
              colleghi.map((c) => (
                <Button key={c.uuid} className="px-2.5 py-1 text-xs" onClick={() => void azione('assegna', { assignee_uuid: c.uuid })}>
                  {c.full_name}
                  {c.uuid === user?.uuid ? ' (tu)' : ''}
                </Button>
              ))
            )}
          </div>
        )}
        {errore && (
          <div className="mt-3">
            <Alert>{errore}</Alert>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
        <ol className="flex flex-col gap-3">
          {r.events.map((e) => {
            const mio = e.author_uuid === user?.uuid
            const doc = e.document_uuid ? documentiPerUuid.get(e.document_uuid) : undefined
            if (e.kind === 'messaggio' || (e.kind === 'creata' && e.text)) {
              return (
                <li key={e.uuid} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mio ? 'bg-brand-500/15 text-ink-100' : 'border border-ink-700 bg-ink-850 text-ink-100'}`}>
                    <p className="whitespace-pre-wrap" data-selectable>
                      {e.text}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {e.author_name} · {quandoBreve(e.created_at)}
                    </p>
                  </div>
                </li>
              )
            }
            return (
              <li key={e.uuid} className="flex items-start gap-2 text-xs text-ink-300">
                <span className="w-5 shrink-0 text-center">{ICONE[e.kind]}</span>
                <span className="flex-1">
                  {e.kind === 'creata'
                    ? `${e.author_name} ha aperto la richiesta.`
                    : e.kind === 'vista'
                      ? `Vista da ${e.author_name}.`
                      : e.kind === 'stato'
                        ? `${REQUEST_STATUS_LABELS[e.status ?? 'vista']}${e.text ? ` — ${e.text}` : ''}`
                        : e.text}
                  {doc && (
                    <button type="button" className="ml-1 text-brand-300 hover:underline" onClick={() => setAperto(doc)}>
                      apri
                    </button>
                  )}
                  <span className="ml-2 text-ink-500">{quandoBreve(e.created_at)}</span>
                </span>
              </li>
            )
          })}
        </ol>

        {r.documents.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Documenti</p>
            <div className="flex flex-wrap gap-2">
              {r.documents.map((d) => (
                <button
                  key={d.uuid}
                  type="button"
                  onClick={() => setAperto(d)}
                  className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-left text-xs text-ink-100 hover:border-brand-400/60"
                >
                  📄 {d.name}
                  {studio && d.uploaded_by_role === 'company' && !d.opened_by_studio_at && (
                    <span className="ml-2 rounded bg-warning/15 px-1 text-[10px] text-warning">nuovo</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={fondo} />
      </div>

      {puoScrivere && (
        <footer className="border-t border-ink-700 px-4 py-3 md:px-5">
          <TextArea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder={studio ? 'Rispondi per scritto…' : 'Scrivi allo studio…'}
            className="min-h-16 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void rispondi()
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {puoAllegare && (
              <Button className="px-3 py-1 text-xs" onClick={() => setAllega(true)}>
                📎 Allega file
              </Button>
            )}
            <span className="hidden text-[11px] text-ink-500 md:inline">Ctrl+Invio per mandare</span>
            <div className="ml-auto flex gap-2">
              {studio && aperta && (
                <Button className="px-3 py-1 text-xs" disabled={invio || !testo.trim()} onClick={() => void rispondi(true)}>
                  Invia e segna risolta
                </Button>
              )}
              <Button variant="primary" className="px-3 py-1 text-xs" disabled={invio || !testo.trim()} onClick={() => void rispondi()}>
                {invio ? 'Invio…' : 'Invia'}
              </Button>
            </div>
          </div>
        </footer>
      )}

      {allega && (
        <UploadDialog
          companyUuid={companyUuid}
          requestUuid={requestUuid}
          onClose={() => setAllega(false)}
          onFatto={() => {
            setAllega(false)
            void ricarica()
            segnalaAzione()
          }}
        />
      )}
      {aperto && <DocumentViewer companyUuid={companyUuid} documento={aperto} onClose={() => setAperto(null)} />}
    </div>
  )
}
