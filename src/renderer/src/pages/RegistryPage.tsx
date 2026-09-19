import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Client, ClientWithCompanies, Company } from '@shared/types'
import { api } from '../lib/api'
import { NewClientModal } from '../components/NewClientModal'
import { NewCompanyModal } from '../components/NewCompanyModal'
import { NewCompanyUserModal } from '../components/NewCompanyUserModal'
import { Alert, Button, EmptyState } from '../components/ui'

/**
 * Anagrafica Clienti e Aziende — AGENTS.md §10.1.
 * È la schermata iniziale del Consulente: elenco Clienti, ognuno con le proprie
 * Aziende, creazione e rimozione. Il click su un'azienda entrerà nella suite
 * Business (Fase 4+).
 */

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('it-IT')
}

type Dialog =
  | { kind: 'new-client' }
  | { kind: 'new-company'; clientUuid?: string }
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
          <Button onClick={() => setDialog({ kind: 'new-client' })}>+ Nuovo cliente</Button>
          <Button
            variant="primary"
            disabled={clients.length === 0}
            title={clients.length === 0 ? 'Crea prima un cliente' : undefined}
            onClick={() => setDialog({ kind: 'new-company' })}
          >
            + Nuova azienda
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
          <p className="text-sm text-ink-400">Caricamento…</p>
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

                  <div className="flex gap-2 md:ml-auto">
                    <Button
                      className="px-3 py-1 text-xs"
                      onClick={() => setDialog({ kind: 'new-company', clientUuid: client.uuid })}
                    >
                      + Azienda
                    </Button>
                    <Button
                      className="px-3 py-1 text-xs"
                      onClick={() => toggleClientArchive(client)}
                    >
                      {client.archived ? 'Ripristina' : 'Archivia'}
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3 py-1 text-xs"
                      onClick={() => removeClient(client)}
                    >
                      Rimuovi
                    </Button>
                  </div>
                </header>

                {client.companies.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-ink-400">
                    Nessuna azienda per questo cliente.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-ink-400">
                          <th className="px-5 py-2 font-medium">Codice</th>
                          <th className="px-5 py-2 font-medium">Ragione sociale</th>
                          <th className="px-5 py-2 font-medium">P.IVA</th>
                          <th className="px-5 py-2 font-medium">Forma</th>
                          <th className="px-5 py-2 font-medium">Tipo di attività</th>
                          <th className="px-5 py-2 font-medium">Dal</th>
                          <th className="px-5 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {client.companies.map((company) => (
                          <tr
                            key={company.uuid}
                            className="border-t border-ink-800 transition-colors hover:bg-ink-800/60"
                          >
                            <td className="px-5 py-3 font-mono text-xs text-ink-300">
                              {company.code}
                            </td>
                            <td className="px-5 py-3">
                              <button
                                type="button"
                                onClick={() => onOpenCompany(company)}
                                className="font-medium text-ink-100 hover:text-brand-300"
                                title="Apri la suite Business"
                              >
                                {company.name}
                              </button>
                              {company.archived === 1 && (
                                <span className="ml-2 rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning">
                                  archiviata
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 font-mono text-xs text-ink-300">
                              {company.vat_number ?? '—'}
                            </td>
                            <td className="px-5 py-3 text-ink-300">{company.legal_form ?? '—'}</td>
                            <td className="px-5 py-3 text-ink-300">{company.business_type ?? '—'}</td>
                            <td className="px-5 py-3 text-ink-300">
                              {formatDate(company.start_date)}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex justify-end gap-2">
                                <Button
                                  className="px-2.5 py-1 text-xs"
                                  onClick={() => setDialog({ kind: 'new-company-user', company })}
                                  title="Crea le credenziali per l'app Azienda"
                                >
                                  Accesso
                                </Button>
                                <Button
                                  className="px-2.5 py-1 text-xs"
                                  onClick={() => toggleCompanyArchive(company)}
                                >
                                  {company.archived ? 'Ripristina' : 'Archivia'}
                                </Button>
                                <Button
                                  variant="danger"
                                  className="px-2.5 py-1 text-xs"
                                  onClick={() => removeCompany(company)}
                                >
                                  Rimuovi
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
