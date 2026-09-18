import { useState } from 'react'
import type { AccountRow, AccountSection, AccountType, Company } from '@shared/types'
import { api } from '../../lib/api'
import { Alert, Button, Card, EmptyState, Field, Modal, Select, TextInput } from '../../components/ui'

/**
 * Piano dei conti dell'azienda, modificabile nel programma.
 *
 * Scegliere la sezione decide dove finisce il conto nel bilancio riclassificato
 * (§2): è l'unica scelta che conta davvero, e il modulo la mette al centro.
 */

export function AccountsEditor({
  company,
  accounts,
  sections,
  canEdit,
  onChanged,
  onImport
}: {
  company: Company
  accounts: AccountRow[]
  sections: AccountSection[]
  canEdit: boolean
  onChanged: () => void
  onImport: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null)
  const [nuovaSezione, setNuovaSezione] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/companies/${company.uuid}`

  const pianoDiPartenza = async (): Promise<void> => {
    setError(null)
    try {
      await api.post(`${base}/accounts/starter`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creazione non riuscita.')
    }
  }

  const attiva = async (account: AccountRow, active: boolean): Promise<void> => {
    setError(null)
    try {
      await api.put(`${base}/accounts/${account.uuid}`, { active })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  const elimina = async (account: AccountRow): Promise<void> => {
    if (!window.confirm(`Eliminare il conto ${account.code} — ${account.name}?`)) return
    setError(null)
    try {
      await api.delete(`${base}/accounts/${account.uuid}`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    }
  }

  if (accounts.length === 0) {
    return (
      <Card>
        {error && (
          <div className="px-5 pt-5">
            <Alert>{error}</Alert>
          </div>
        )}
        <EmptyState
          title="Nessun conto per questa azienda"
          description="Parti da un piano già pronto (un conto per ciascuna delle 24 sezioni del modello, da rinominare e dettagliare), crea i conti uno per uno, oppure importali da un file Excel che hai già."
          action={
            canEdit && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="primary" onClick={pianoDiPartenza}>
                  Crea il piano di partenza
                </Button>
                <Button onClick={() => setEditing('new')}>Nuovo conto</Button>
                <Button onClick={onImport}>Importa da Excel</Button>
              </div>
            )
          }
        />
        {editing && (
          <AccountModal
            company={company}
            sections={sections}
            account={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              onChanged()
            }}
          />
        )}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <p className="text-sm text-ink-300">
          {accounts.length} conti · {accounts.filter((a) => !a.active).length} disattivati
        </p>
        {canEdit && (
          <Button variant="primary" className="ml-auto" onClick={() => setEditing('new')}>
            Nuovo conto
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}

      {sections.map((section) => {
        const righe = accounts.filter((a) => a.section_code === section.code)
        return (
          <Card
            key={section.code}
            title={
              <span>
                {section.label}
                <span className="ml-2 font-normal normal-case tracking-normal text-ink-500">
                  {section.statement === 'CE' ? 'Conto economico' : 'Stato patrimoniale'} ·{' '}
                  {righe.length} {righe.length === 1 ? 'conto' : 'conti'}
                </span>
              </span>
            }
            actions={
              canEdit && (
                <button
                  type="button"
                  className="text-xs text-brand-300 hover:text-brand-200"
                  onClick={() => {
                    setNuovaSezione(section.code)
                    setEditing('new')
                  }}
                >
                  + Aggiungi
                </button>
              )
            }
          >
            {righe.length === 0 ? (
              <p className="px-5 py-3 text-xs text-ink-500">Nessun conto in questa sezione.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {righe.map((account) => (
                  <li key={account.uuid} className="flex items-center gap-4 px-5 py-2">
                    <span className="w-24 shrink-0 font-mono text-xs text-ink-400">{account.code}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${account.active ? 'text-ink-200' : 'text-ink-500 line-through'}`}>
                      {account.name}
                    </span>
                    {account.account_type === "ATTIVITA' NEGATIVO" && (
                      <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">fondo, si sottrae</span>
                    )}
                    {account.detail_tag && (
                      <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-300">
                        {account.detail_tag}
                      </span>
                    )}
                    {account.direct_cost_pct !== null && (
                      <span className="text-[11px] text-ink-400">{account.direct_cost_pct}% diretto</span>
                    )}
                    <span className="w-20 text-right text-[11px] text-ink-500">
                      {account.balance_count > 0 ? `${account.balance_count} saldi` : 'nessun saldo'}
                    </span>
                    {canEdit && (
                      <span className="flex shrink-0 gap-3 text-xs">
                        <button type="button" className="text-ink-300 hover:text-ink-100" onClick={() => setEditing(account)}>
                          Modifica
                        </button>
                        {account.balance_count > 0 ? (
                          <button
                            type="button"
                            className="text-ink-400 hover:text-ink-100"
                            onClick={() => attiva(account, !account.active)}
                          >
                            {account.active ? 'Disattiva' : 'Riattiva'}
                          </button>
                        ) : (
                          <button type="button" className="text-negative/80 hover:text-negative" onClick={() => elimina(account)}>
                            Elimina
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      })}

      {editing && (
        <AccountModal
          company={company}
          sections={sections}
          account={editing === 'new' ? null : editing}
          defaultSection={nuovaSezione}
          onClose={() => {
            setEditing(null)
            setNuovaSezione(null)
          }}
          onSaved={() => {
            setEditing(null)
            setNuovaSezione(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

const TYPE_LABELS: Record<AccountType, string> = {
  RICAVO: 'Ricavo',
  COSTO: 'Costo',
  "ATTIVITA'": 'Attività',
  "ATTIVITA' NEGATIVO": 'Fondo (si sottrae dall’attivo)',
  "PASSIVITA'": 'Passività'
}

function AccountModal({
  company,
  sections,
  account,
  defaultSection,
  onClose,
  onSaved
}: {
  company: Company
  sections: AccountSection[]
  account: AccountRow | null
  defaultSection?: string | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [code, setCode] = useState(account?.code ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [sectionCode, setSectionCode] = useState(account?.section_code ?? defaultSection ?? '')
  const [accountType, setAccountType] = useState<AccountType | ''>(account?.account_type ?? '')
  const [detailTag, setDetailTag] = useState(account?.detail_tag ?? '')
  const [pct, setPct] = useState(account?.direct_cost_pct?.toString() ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const section = sections.find((s) => s.code === sectionCode) ?? null
  const tipi: AccountType[] = section
    ? section.account_type === "ATTIVITA'"
      ? ["ATTIVITA'", "ATTIVITA' NEGATIVO"]
      : [section.account_type]
    : []
  const tipo = accountType && tipi.includes(accountType) ? accountType : (tipi[0] ?? '')

  const salva = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const pctNum = pct.trim() === '' ? null : Number(pct.replace(',', '.'))
    if (pctNum !== null && !Number.isFinite(pctNum)) {
      setError('La % di costo diretto deve essere un numero.')
      setBusy(false)
      return
    }
    const body = {
      code,
      name,
      section_code: sectionCode,
      account_type: tipo,
      detail_tag: section?.detail_tags.includes(detailTag) ? detailTag : null,
      direct_cost_pct: section?.account_type === 'COSTO' ? pctNum : null,
      notes
    }
    try {
      if (account) await api.put(`/api/companies/${company.uuid}/accounts/${account.uuid}`, body)
      else await api.post(`/api/companies/${company.uuid}/accounts`, body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={account ? `Modifica conto ${account.code}` : 'Nuovo conto'}
      subtitle="La sezione decide dove finisce il conto nel conto economico e nello stato patrimoniale."
      onClose={onClose}
    >
      <form onSubmit={salva} className="flex flex-col gap-4 px-6 py-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-[10rem_1fr] gap-4">
          <Field label="Codice" required>
            <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="60.01" autoFocus />
          </Field>
          <Field label="Nome" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ricavi da vendite" />
          </Field>
        </div>

        <Field label="Sezione" required>
          <Select value={sectionCode} onChange={(e) => setSectionCode(e.target.value)}>
            <option value="">Scegli…</option>
            <optgroup label="Conto economico">
              {sections
                .filter((s) => s.statement === 'CE')
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Stato patrimoniale">
              {sections
                .filter((s) => s.statement === 'SP')
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
            </optgroup>
          </Select>
        </Field>

        {section && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipo">
              <Select
                value={tipo}
                disabled={tipi.length < 2}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
              >
                {tipi.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {section.detail_tags.length > 0 && (
              <Field label="Dettaglio" hint="Serve agli indici: i crediti commerciali per il DSO, i fornitori per il DPO…">
                <Select value={detailTag} onChange={(e) => setDetailTag(e.target.value)}>
                  <option value="">—</option>
                  {section.detail_tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {section.account_type === 'COSTO' && (
              <Field
                label="% di costo diretto"
                hint={`Vuoto = quella della sezione (${section.default_direct_cost_pct ?? 0}%).`}
              >
                <TextInput value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" placeholder={`${section.default_direct_cost_pct ?? 0}`} />
              </Field>
            )}
          </div>
        )}

        <Field label="Note">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <footer className="-mx-6 -mb-5 mt-2 flex justify-end gap-2 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {account ? 'Salva' : 'Crea conto'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
