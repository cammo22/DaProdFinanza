import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Client, ClientWithCompanies, Company } from '@shared/types'
import { api } from '../lib/api'
import { NewClientModal } from '../components/NewClientModal'
import { NewCompanyModal } from '../components/NewCompanyModal'
import { NewCompanyUserModal } from '../components/NewCompanyUserModal'
import { Alert, Button, EmptyState, Scheletro } from '../components/ui'
import { iniziali, Separatore, Tendina, VoceMenu } from '../components/Guscio'
import { Icona } from '../components/icone'
import { useAzione } from '../lib/comandi'
import { useInbox } from '../lib/inbox'

/**
 * Anagrafica Clienti e Aziende — AGENTS.md §10.1.
 * È la schermata iniziale del Consulente: elenco Clienti, ognuno con le proprie
 * Aziende, creazione e rimozione. Un clic su un'azienda (tutta la riga, o
 * "Apri") entra nella suite Business; le azioni meno frequenti stanno nel
 * menu "⋯" di ogni riga, così l'elenco resta leggibile anche sul telefono.
 */

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('it-IT')
}

type Dialog =
  | { kind: 'new-client' }
  | { kind: 'edit-client'; client: Client }
  | { kind: 'new-company'; clientUuid?: string }
  | { kind: 'edit-company'; company: Company }
  | { kind: 'new-company-user'; company: Company }
  | null

export function RegistryPage({
  onOpenCompany
}: {
  onOpenCompany: (company: Company) => void
}): React.JSX.Element {
  const [clients, setClients] = useState<ClientWithCompanies[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { riepilogo } = useInbox()
  const novita = riepilogo?.per_company ?? {}

  // Dai comandi rapidi (Ctrl+K o il pulsante "Nuovo").
  useAzione('nuovo-cliente', () => setDialog({ kind: 'new-client' }))
  useAzione('nuova-azienda', () => setDialog(clients.length ? { kind: 'new-company' } : { kind: 'new-client' }), !loading)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setClients(
        await api.get<ClientWithCompanies[]>(`/api/clients?archived=${showArchived ? 'true' : 'false'}`)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caricamento non riuscito.')
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => {
    reload()
  }, [reload])

  const flash = (message: string): void => {
    setNotice(message)
    setTimeout(() => setNotice(null), 5000)
  }

  const act = async (run: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null)
    try {
      await run()
      await reload()
      flash(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  const removeClient = (client: ClientWithCompanies): void => {
    const count = client.companies.length
    const detail = count > 0 ? `\n\nVerranno rimosse anche ${count} azienda/e collegate.` : ''
    if (!confirm(`Rimuovere il cliente "${client.name}" (${client.code})?${detail}`)) return
    act(() => api.delete(`/api/clients/${client.uuid}`), `Cliente ${client.code} rimosso.`)
  }

  const removeCompany = (company: Company): void => {
    if (!confirm(`Rimuovere l'azienda "${company.name}" (${company.code})?`)) return
    act(() => api.delete(`/api/companies/${company.uuid}`), `Azienda ${company.code} rimossa.`)
  }

  const toggleClientArchive = (client: ClientWithCompanies): void =>
    void act(
      () => api.post(`/api/clients/${client.uuid}/archive`, { archived: !client.archived }),
      client.archived ? `Cliente ${client.code} ripristinato.` : `Cliente ${client.code} archiviato.`
    )

  const toggleCompanyArchive = (company: Company): void =>
    void act(
      () => api.post(`/api/companies/${company.uuid}/archive`, { archived: !company.archived }),
      company.archived
        ? `Azienda ${company.code} ripristinata.`
        : `Azienda ${company.code} archiviata.`
    )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return clients
    return clients
      .map((client) => ({
        ...client,
        companies: client.companies.filter(
          (company) =>
            company.name.toLowerCase().includes(needle) ||
            company.code.toLowerCase().includes(needle) ||
            (company.vat_number ?? '').includes(needle)
        )
      }))
      .filter(
        (client) =>
          client.name.toLowerCase().includes(needle) ||
          client.code.toLowerCase().includes(needle) ||
          client.companies.length > 0
      )
  }, [clients, search])

  const flatClients: Client[] = clients
  const totalCompanies = clients.reduce((sum, client) => sum + client.companies.length, 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-700 px-4 py-4 md:px-8 md:py-5">
        <div>
          <h1 className="text-lg font-semibold text-ink-100">Clienti e Aziende</h1>
          <p className="mt-0.5 text-xs text-ink-400">
            {clients.length} client{clients.length === 1 ? 'e' : 'i'} · {totalCompanies} aziend
            {totalCompanies === 1 ? 'a' : 'e'}
          </p>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, codice o P.IVA…"
          className="w-full rounded-lg md:ml-6 md:w-72 border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 outline-none focus:border-brand-500"
        />

        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-brand-500"
          />
          Mostra archiviati
        </label>

        <div className="flex gap-3 md:ml-auto">
          <Button onClick={() => setDialog({ kind: 'new-client' })}>
            <Icona nome="piu" className="h-4 w-4" /> Nuovo cliente
          </Button>
          <Button
            variant="primary"
            disabled={clients.length === 0}
            title={clients.length === 0 ? 'Crea prima un cliente' : undefined}
            onClick={() => setDialog({ kind: 'new-company' })}
          >
            <Icona nome="piu" className="h-4 w-4" /> Nuova azienda
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-8 md:py-6">
        {(error || notice) && (
          <div className="mb-5">
            {error ? <Alert>{error}</Alert> : <Alert tone="success">{notice}</Alert>}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-ink-700 bg-ink-850 p-5">
                <Scheletro className="h-4 w-48" />
                <Scheletro className="mt-4 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Nessun risultato' : 'Nessun cliente registrato'}
            description={
              search
                ? 'Nessun cliente o azienda corrisponde alla ricerca.'
                : 'Un cliente è una persona o un gruppo che può possedere più aziende. Crea il primo cliente, poi aggiungi le sue aziende.'
            }
            action={
              !search && (
                <Button variant="primary" onClick={() => setDialog({ kind: 'new-client' })}>
                  + Nuovo cliente
                </Button>
              )
            }
          />
        ) : (
          <div className="flex flex-col gap-5">
            {filtered.map((client) => (
              <section
                key={client.uuid}
                className="rounded-xl border border-ink-700 bg-ink-850 shadow-lg shadow-black/30"
              >
                <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700 px-4 py-4 md:px-5">
                  <div className="flex items-baseline gap-3">
                    <span className="rounded-md bg-ink-800 px-2 py-0.5 font-mono text-xs text-brand-300">
                      {client.code}
                    </span>
                    <h2 className="text-base font-semibold text-ink-100">{client.name}</h2>
                    {client.archived === 1 && (
                      <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning">
                        archiviato
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-ink-400">
                    {client.contact_person ?? 'nessun referente'}
                    {client.email ? ` · ${client.email}` : ''}
                    {client.phone ? ` · ${client.phone}` : ''}
                    {' · dal '}
                    {formatDate(client.start_date)}
                  </p>

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      className="px-3 py-1 text-xs"
                      onClick={() => setDialog({ kind: 'new-company', clientUuid: client.uuid })}
                    >
                      <Icona nome="piu" className="h-3.5 w-3.5" /> Azienda
                    </Button>
                    <Tendina
                      titolo="Altre azioni sul cliente"
                      larghezza="w-52"
                      classeBottone="rounded-lg border border-ink-700 bg-ink-800 p-1.5 text-ink-300 hover:bg-ink-700"
                      etichetta={<Icona nome="altro" className="h-4 w-4" />}
                    >
                      {(chiudi) => (
                        <>
                          <VoceMenu icona="matita" onClick={() => { chiudi(); setDialog({ kind: 'edit-client', client }) }}>
                            Modifica il cliente
                          </VoceMenu>
                          <VoceMenu icona="cartella" onClick={() => { chiudi(); toggleClientArchive(client) }}>
                            {client.archived ? 'Ripristina' : 'Archivia'}
                          </VoceMenu>
                          <Separatore />
                          <VoceMenu icona="cestino" pericolo onClick={() => { chiudi(); removeClient(client) }}>
                            Rimuovi
                          </VoceMenu>
                        </>
                      )}
                    </Tendina>
                  </div>
                </header>

                {client.companies.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-ink-400">
                    Nessuna azienda per questo cliente.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-800">
                    {client.companies.map((company) => (
                      <li
                        key={company.uuid}
                        className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-800/60 md:px-5"
                        onClick={(e) => {
                          // I pulsanti della riga fanno la loro cosa; il resto apre l'azienda.
                          if ((e.target as HTMLElement).closest('button')) return
                          onOpenCompany(company)
                        }}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-xs font-bold text-brand-300">
                          {iniziali(company.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink-100 group-hover:text-brand-200">{company.name}</span>
                            {company.archived === 1 && (
                              <span className="shrink-0 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] text-warning">archiviata</span>
                            )}
                            {(novita[company.uuid] ?? 0) > 0 && (
                              <span
                                className="shrink-0 rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold leading-4 text-white"
                                title="Richieste con novità"
                              >
                                {novita[company.uuid]}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-400">
                            <span className="font-mono">{company.code}</span>
                            {company.vat_number ? <span className="font-mono"> · P.IVA {company.vat_number}</span> : ''}
                            {company.legal_form ? ` · ${company.legal_form}` : ''}
                            {company.business_type ? ` · ${company.business_type}` : ''}
                            <span className="max-sm:hidden"> · dal {formatDate(company.start_date)}</span>
                          </p>
                        </div>
                        <Button
                          variant="primary"
                          className="shrink-0 px-3 py-1 text-xs max-sm:hidden"
                          onClick={() => onOpenCompany(company)}
                          title="Apri la suite Business"
                        >
                          Apri
                          <Icona nome="destra" className="h-3.5 w-3.5" />
                        </Button>
                        <Tendina
                          titolo="Altre azioni sull'azienda"
                          larghezza="w-60"
                          classeBottone="rounded-lg border border-ink-700 bg-ink-800 p-1.5 text-ink-300 hover:bg-ink-700"
                          etichetta={<Icona nome="altro" className="h-4 w-4" />}
                        >
                          {(chiudi) => (
                            <>
                              <VoceMenu icona="destra" onClick={() => { chiudi(); onOpenCompany(company) }}>
                                Apri
                              </VoceMenu>
                              <VoceMenu icona="matita" onClick={() => { chiudi(); setDialog({ kind: 'edit-company', company }) }}>
                                Modifica i dati
                              </VoceMenu>
                              <VoceMenu
                                icona="lucchetto"
                                dettaglio="Credenziali per l'app Azienda"
                                onClick={() => { chiudi(); setDialog({ kind: 'new-company-user', company }) }}
                              >
                                Accesso dell'azienda
                              </VoceMenu>
                              <VoceMenu icona="cartella" onClick={() => { chiudi(); toggleCompanyArchive(company) }}>
                                {company.archived ? 'Ripristina' : 'Archivia'}
                              </VoceMenu>
                              <Separatore />
                              <VoceMenu icona="cestino" pericolo onClick={() => { chiudi(); removeCompany(company) }}>
                                Rimuovi
                              </VoceMenu>
                            </>
                          )}
                        </Tendina>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {dialog?.kind === 'new-client' && (
        <NewClientModal
          onClose={() => setDialog(null)}
          onCreated={(client) => {
            setDialog(null)
            reload()
            flash(`Cliente ${client.code} creato.`)
          }}
        />
      )}

      {dialog?.kind === 'edit-client' && (
        <NewClientModal
          client={dialog.client}
          onClose={() => setDialog(null)}
          onCreated={(client) => {
            setDialog(null)
            reload()
            flash(`Cliente ${client.code} aggiornato.`)
          }}
        />
      )}

      {dialog?.kind === 'edit-company' && (
        <NewCompanyModal
          clients={flatClients}
          company={dialog.company}
          onClose={() => setDialog(null)}
          onCreated={(company) => {
            setDialog(null)
            reload()
            flash(`Azienda ${company.code} aggiornata.`)
          }}
        />
      )}

      {dialog?.kind === 'new-company' && (
        <NewCompanyModal
          clients={flatClients}
          defaultClientUuid={dialog.clientUuid}
          onClose={() => setDialog(null)}
          onCreated={(company) => {
            setDialog(null)
            reload()
            flash(`Azienda ${company.code} creata.`)
          }}
        />
      )}

      {dialog?.kind === 'new-company-user' && (
        <NewCompanyUserModal
          company={dialog.company}
          onClose={() => setDialog(null)}
          onCreated={(username) => {
            setDialog(null)
            flash(`Accesso "${username}" creato per ${dialog.company.name}.`)
          }}
        />
      )}
    </div>
  )
}
