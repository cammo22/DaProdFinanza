import { useCallback, useEffect, useMemo, useState } from 'react'
import { REQUEST_OPEN_STATUSES, type RequestItem, type RequestKind } from '@shared/documents'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useImpostazioni } from '../lib/impostazioni'
import { useAlCambioRichieste } from '../lib/inbox'
import { Alert, Button, EmptyState } from './ui'
import { NewRequestDialog } from './NewRequestDialog'
import { quandoBreve, RequestDetail, StatoRichiesta } from './RequestDetail'
import { UploadDialog } from './UploadDialog'

/**
 * Elenco delle richieste con il dettaglio accanto (AGENTS.md §10.14).
 *
 * Tre usi: la pagina Richieste dell'azienda (le sue), quella di un'azienda
 * vista dallo studio, e la casella dello studio con tutte le aziende.
 */

const ICONA: Record<RequestKind, string> = { chiamata: '📞', domanda: '💬', documenti: '📎' }

export function RequestsBoard({
  companyUuid,
  selezioneIniziale
}: {
  /** null = tutte le aziende (casella dello studio). */
  companyUuid: string | null
  selezioneIniziale?: { companyUuid: string; requestUuid: string } | null
}): React.JSX.Element {
  const { user } = useAuth()
  const { portale } = useImpostazioni()
  const studio = user?.role === 'consultant'
  const [richieste, setRichieste] = useState<RequestItem[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'aperte' | 'tutte' | 'chiamate'>('aperte')
  const [scelta, setScelta] = useState<{ companyUuid: string; requestUuid: string } | null>(selezioneIniziale ?? null)
  const [nuova, setNuova] = useState<RequestKind | null>(null)
  const [documenti, setDocumenti] = useState(false)

  useEffect(() => {
    if (selezioneIniziale) setScelta(selezioneIniziale)
  }, [selezioneIniziale])

  const ricarica = useCallback(async () => {
    try {
      const url = companyUuid ? `/api/companies/${companyUuid}/requests` : '/api/inbox/requests'
      setRichieste(await api.get<RequestItem[]>(url))
      setErrore(null)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Richieste non disponibili.')
    }
  }, [companyUuid])

  useEffect(() => {
    void ricarica()
  }, [ricarica])
  useAlCambioRichieste(ricarica)

  const visibili = useMemo(
    () =>
      (richieste ?? []).filter((r) =>
        filtro === 'tutte'
          ? true
          : filtro === 'chiamate'
            ? r.kind === 'chiamata' && (REQUEST_OPEN_STATUSES as string[]).includes(r.status)
            : (REQUEST_OPEN_STATUSES as string[]).includes(r.status)
      ),
    [richieste, filtro]
  )

  const nonLetta = (r: RequestItem): boolean => (studio ? Boolean(r.unread_studio) : Boolean(r.unread_company))
  const permessi = portale?.permessi

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <section className={`flex min-h-0 flex-col gap-3 lg:w-[380px] lg:shrink-0 ${scelta ? 'max-lg:hidden' : ''}`}>
        {companyUuid && (
          <div className="flex flex-wrap gap-2">
            {studio ? (
              <>
                <Button variant="primary" className="px-3 py-1.5 text-xs" onClick={() => setNuova('documenti')}>
                  Chiedi documenti
                </Button>
                <Button className="px-3 py-1.5 text-xs" onClick={() => setNuova('domanda')}>
                  Scrivi all’azienda
                </Button>
              </>
            ) : (
              <>
                {permessi?.richiedereChiamate && (
                  <Button variant="primary" className="px-3 py-1.5 text-xs" onClick={() => setNuova('chiamata')}>
                    📞 Chiedi una chiamata
                  </Button>
                )}
                {permessi?.scrivereMessaggi && (
                  <Button className="px-3 py-1.5 text-xs" onClick={() => setNuova('domanda')}>
                    💬 Scrivi una domanda
                  </Button>
                )}
                {permessi?.inviareDocumenti && (
                  <Button className="px-3 py-1.5 text-xs" onClick={() => setDocumenti(true)}>
                    📎 Manda documenti
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1 text-xs">
          {(
            [
              ['aperte', 'Aperte'],
              ['chiamate', 'Chiamate'],
              ['tutte', 'Tutte']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={`flex-1 rounded-md px-2 py-1 ${filtro === id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {errore && <Alert>{errore}</Alert>}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-ink-700 bg-ink-850">
          {richieste === null ? (
            <p className="px-4 py-5 text-sm text-ink-400">Caricamento…</p>
          ) : visibili.length === 0 ? (
            <EmptyState
              title={filtro === 'tutte' ? 'Nessuna richiesta' : 'Niente di aperto'}
              description={
                studio
                  ? 'Quando un’azienda chiede una chiamata, scrive o manda documenti, arriva qui.'
                  : 'Qui vedi le tue richieste allo studio e a che punto sono.'
              }
            />
          ) : (
            <ul className="divide-y divide-ink-800">
              {visibili.map((r) => {
                const attiva = scelta?.requestUuid === r.uuid
                return (
                  <li key={r.uuid}>
                    <button
                      type="button"
                      onClick={() => setScelta({ companyUuid: r.company_uuid, requestUuid: r.uuid })}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left ${attiva ? 'bg-brand-500/10' : 'hover:bg-ink-800/60'}`}
                    >
                      <span className="mt-0.5 text-base">{ICONA[r.kind]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {nonLetta(r) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-400" aria-label="novità" />}
                          <span className={`truncate text-sm ${nonLetta(r) ? 'font-semibold text-ink-100' : 'text-ink-200'}`}>{r.subject}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
                          <StatoRichiesta status={r.status} />
                          {!companyUuid && r.company_name && <span className="truncate">{r.company_name}</span>}
                          {r.urgent ? <span className="text-negative">urgente</span> : null}
                          <span>{quandoBreve(r.last_event_at)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className={`min-h-0 flex-1 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 ${scelta ? '' : 'max-lg:hidden'}`}>
        {scelta ? (
          <RequestDetail
            key={scelta.requestUuid}
            companyUuid={scelta.companyUuid}
            requestUuid={scelta.requestUuid}
            onChiudi={() => setScelta(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-400">
            Scegli una richiesta a sinistra per vedere la storia e rispondere.
          </div>
        )}
      </section>

      {nuova && companyUuid && (
        <NewRequestDialog
          companyUuid={companyUuid}
          tipo={nuova}
          onClose={() => setNuova(null)}
          onCreata={(r) => {
            setNuova(null)
            void ricarica()
            setScelta({ companyUuid: r.company_uuid, requestUuid: r.uuid })
          }}
        />
      )}
      {documenti && companyUuid && (
        <UploadDialog
          companyUuid={companyUuid}
          onClose={() => setDocumenti(false)}
          onFatto={() => {
            setDocumenti(false)
            void ricarica()
          }}
        />
      )}
    </div>
  )
}
