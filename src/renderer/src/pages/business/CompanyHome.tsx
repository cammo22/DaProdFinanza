import { useCallback, useEffect, useState } from 'react'
import { dimensione, type DocumentItem, type RequestItem } from '@shared/documents'
import type { Company } from '@shared/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dataIt, euro } from '../../lib/format'
import { useAlCambioRichieste } from '../../lib/inbox'
import type { Vista } from '../../components/Sidebar'
import { Alert, Button, Card } from '../../components/ui'
import { NewRequestDialog } from '../../components/NewRequestDialog'
import { StatoRichiesta, quandoBreve } from '../../components/RequestDetail'
import { UploadDialog } from '../../components/UploadDialog'
import { DocumentViewer } from '../../components/viewer/DocumentViewer'
import { Icona } from '../../components/icone'

/**
 * Il riepilogo dell'azienda — AGENTS.md §10.15 (versione 1.3.0).
 *
 * L'azienda è un utente, non un'altra copia del gestionale: entra e trova in
 * una pagina sola chi la segue, cosa può chiedere (una chiamata, una risposta,
 * mandare documenti), a che punto sono le sue richieste e i numeri che contano
 * per lei. Il resto lo apre dal menu, se il consulente gliel'ha acceso.
 */

interface Riepilogo {
  company: { name: string; business_type: string | null }
  studio: { nome: string; telefono: string; email: string }
  consulenti: { name: string; phone: string | null; email: string | null }[]
  permessi: { documenti: boolean; inviareDocumenti: boolean; richieste: boolean; richiedereChiamate: boolean; scrivereMessaggi: boolean }
  liquidita: { oggi: number; tra30: number; soglia: number | null; tensione: { date: string; days: number } | null } | null
  scadenze: { date: string; description: string; cents: number; direction: 'in' | 'out'; overdue: boolean }[] | null
  periodo: { label: string; ricavi: number; ebitda: number; utile: number; ytd: { label: string; ricavi: number; utile: number } | null } | null
  richieste: (RequestItem & { descrizione: string })[]
  documentiNuovi: DocumentItem[]
}

function Numero({ label, valore, sotto, tono }: { label: string; valore: string; sotto?: string; tono?: string }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tono ?? 'text-ink-100'}`}>{valore}</p>
      {sotto && <p className="mt-0.5 text-[11px] text-ink-400">{sotto}</p>}
    </div>
  )
}

export function CompanyHome({ company, onVista }: { company: Company; onVista: (v: Vista) => void }): React.JSX.Element {
  const { user } = useAuth()
  const [r, setR] = useState<Riepilogo | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<'chiamata' | 'domanda' | 'documenti' | null>(null)
  const [aperto, setAperto] = useState<DocumentItem | null>(null)

  const ricarica = useCallback(async () => {
    try {
      setR(await api.get<Riepilogo>(`/api/companies/${company.uuid}/summary`))
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Riepilogo non disponibile.')
    }
  }, [company.uuid])

  useEffect(() => {
    void ricarica()
  }, [ricarica])
  useAlCambioRichieste(ricarica)

  if (errore) return <Alert>{errore}</Alert>
  if (!r) return <p className="text-sm text-ink-400">Caricamento…</p>

  const ora = new Date().getHours()
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const nome = user?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <section className="rounded-2xl border border-ink-700 bg-gradient-to-br from-brand-500/15 via-ink-850 to-ink-850 px-5 py-5 md:px-7">
        <p className="text-sm text-ink-300">
          {saluto}
          {nome ? `, ${nome}` : ''}
        </p>
        <h2 className="mt-0.5 text-xl font-semibold text-ink-100">{r.company.name}</h2>
        <p className="mt-2 text-sm text-ink-300">
          Ti segue {r.studio.nome || 'il tuo studio di consulenza'}
          {r.consulenti.length ? ` — ${r.consulenti.map((c) => c.name).join(', ')}` : ''}.
          {r.studio.telefono ? ` Telefono ${r.studio.telefono}.` : ''}
          {r.studio.email ? ` Email ${r.studio.email}.` : ''}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {r.permessi.richiedereChiamate && (
            <Button variant="primary" onClick={() => setDialogo('chiamata')}>
              <Icona nome="telefono" className="h-4 w-4" /> Chiedi una chiamata
            </Button>
          )}
          {r.permessi.inviareDocumenti && <Button onClick={() => setDialogo('documenti')}><Icona nome="graffetta" className="h-4 w-4" /> Manda documenti</Button>}
          {r.permessi.scrivereMessaggi && <Button onClick={() => setDialogo('domanda')}><Icona nome="messaggio" className="h-4 w-4" /> Scrivi una domanda</Button>}
        </div>
      </section>

      {(r.liquidita || r.periodo) && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {r.liquidita && (
            <>
              <Numero label="In cassa oggi" valore={euro(r.liquidita.oggi)} sotto="conti e cassa" />
              <Numero
                label="Fra 30 giorni"
                valore={euro(r.liquidita.tra30)}
                sotto={r.liquidita.tensione ? `sotto la soglia fra ${r.liquidita.tensione.days} giorni` : 'secondo le scadenze'}
                tono={r.liquidita.tensione ? 'text-warning' : undefined}
              />
            </>
          )}
          {r.periodo && (
            <>
              <Numero label={`Ricavi di ${r.periodo.label}`} valore={euro(r.periodo.ricavi)} sotto={r.periodo.ytd ? `${r.periodo.ytd.label}: ${euro(r.periodo.ytd.ricavi)}` : undefined} />
              <Numero
                label={`Risultato di ${r.periodo.label}`}
                valore={euro(r.periodo.utile)}
                sotto={r.periodo.ytd ? `${r.periodo.ytd.label}: ${euro(r.periodo.ytd.utile)}` : undefined}
                tono={r.periodo.utile < 0 ? 'text-negative' : 'text-positive'}
              />
            </>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {r.permessi.richieste && (
          <Card
            title="Le tue richieste"
            actions={
              <Button className="px-2.5 py-1 text-xs" onClick={() => onVista('richieste')}>
                Tutte
              </Button>
            }
          >
            {r.richieste.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-400">Nessuna richiesta. Quando ne fai una, qui vedi se lo studio l’ha vista e chi se ne occupa.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {r.richieste.map((q) => (
                  <li key={q.uuid}>
                    <button type="button" className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-ink-800/50" onClick={() => onVista('richieste')}>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {q.unread_company ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-400" /> : null}
                          <span className="truncate text-sm text-ink-100">{q.subject}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-400">{q.descrizione}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <StatoRichiesta status={q.status} />
                        <span className="mt-1 block text-[11px] text-ink-500">{quandoBreve(q.last_event_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {r.permessi.documenti && (
          <Card
            title="Documenti nuovi dallo studio"
            actions={
              <Button className="px-2.5 py-1 text-xs" onClick={() => onVista('documenti')}>
                Tutti
              </Button>
            }
          >
            {r.documentiNuovi.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-400">Niente di nuovo. I documenti che lo studio condivide con te compaiono qui.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {r.documentiNuovi.map((d) => (
                  <li key={d.uuid}>
                    <button type="button" className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-800/50" onClick={() => setAperto(d)}>
                      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm text-ink-100"><Icona nome="documento" className="h-4 w-4 text-ink-400" /> <span className="truncate">{d.name}</span></span>
                      <span className="shrink-0 text-[11px] text-ink-400">
                        {dimensione(d.size_bytes)} · {quandoBreve(d.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {r.scadenze && r.scadenze.length > 0 && (
          <Card
            title="Prossime scadenze"
            actions={
              <Button className="px-2.5 py-1 text-xs" onClick={() => onVista('tesoreria')}>
                Tesoreria
              </Button>
            }
          >
            <ul className="divide-y divide-ink-800">
              {r.scadenze.map((s, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className={`w-20 shrink-0 font-mono text-xs ${s.overdue ? 'text-negative' : 'text-ink-400'}`}>
                    {s.overdue ? 'scaduta' : dataIt(s.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-200">{s.description}</span>
                  <span className={`shrink-0 font-mono text-xs tabular-nums ${s.direction === 'in' ? 'text-positive' : 'text-ink-100'}`}>
                    {s.direction === 'in' ? '+' : '−'}
                    {euro(s.cents)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {(dialogo === 'chiamata' || dialogo === 'domanda') && (
        <NewRequestDialog
          companyUuid={company.uuid}
          tipo={dialogo}
          onClose={() => setDialogo(null)}
          onCreata={() => {
            setDialogo(null)
            void ricarica()
          }}
        />
      )}
      {dialogo === 'documenti' && (
        <UploadDialog
          companyUuid={company.uuid}
          onClose={() => setDialogo(null)}
          onFatto={() => {
            setDialogo(null)
            void ricarica()
          }}
        />
      )}
      {aperto && (
        <DocumentViewer
          companyUuid={company.uuid}
          documento={aperto}
          onClose={() => {
            setAperto(null)
            void ricarica()
          }}
        />
      )}
    </div>
  )
}
