import { useMemo, useState } from 'react'
import {
  CREDIT_LINE_LABELS,
  FREQUENCY_LABELS,
  LOAN_LABELS,
  schedule,
  validateLoan,
  type CreditLineKind,
  type Frequency,
  type LoanKind
} from '@shared/engine'
import type { Bank, CreditLine, Loan } from '@shared/types'
import { api } from '../../lib/api'
import { euro, euroInput, parseEuro } from '../../lib/format'
import { Alert, Button, Field, Modal, Select, TextInput } from '../../components/ui'
import { oggiLocale } from './TreasuryForms'

/**
 * Moduli del modulo Banche: istituto, linea di credito, finanziamento.
 * Il finanziamento mostra la rata mentre lo si compila: è il modo più rapido
 * per accorgersi di un tasso o di un numero di rate sbagliato.
 */

function Footer({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }): React.JSX.Element {
  return (
    <footer className="flex justify-end gap-2 border-t border-ink-700 px-6 py-4">
      <Button type="button" onClick={onClose}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Salvataggio…' : label}
      </Button>
    </footer>
  )
}

function useSalva(onSaved: () => void) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const salva = async (fn: () => Promise<unknown>): Promise<void> => {
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
  return { error, setError, busy, salva }
}

/** "4,2" → 4.2; null se vuoto o non numerico. */
function parseTasso(text: string): number | null {
  const t = text.trim().replace('%', '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function BankModal({
  companyUuid,
  bank,
  onClose,
  onSaved
}: {
  companyUuid: string
  bank: Bank | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [name, setName] = useState(bank?.name ?? '')
  const [branch, setBranch] = useState(bank?.branch ?? '')
  const [contact, setContact] = useState(bank?.contact ?? '')
  const [notes, setNotes] = useState(bank?.notes ?? '')
  const { error, busy, salva } = useSalva(onSaved)

  const invia = (event: React.FormEvent): void => {
    event.preventDefault()
    const body = { name, branch, contact, notes }
    void salva(() =>
      bank
        ? api.put(`/api/companies/${companyUuid}/banks/${bank.uuid}`, body)
        : api.post(`/api/companies/${companyUuid}/banks`, body)
    )
  }

  return (
    <Modal
      title={bank ? 'Modifica istituto' : 'Nuovo istituto'}
      subtitle="Banca, società di leasing o finanziaria con cui l'azienda lavora."
      onClose={onClose}
    >
      <form onSubmit={invia}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="col-span-2">
            <Field label="Nome" required>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
          </div>
          <Field label="Filiale">
            <TextInput value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>
          <Field label="Referente">
            <TextInput value={contact} onChange={(e) => setContact(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Note">
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        <Footer busy={busy} onClose={onClose} label={bank ? 'Salva' : 'Aggiungi'} />
      </form>
    </Modal>
  )
}

export function LineModal({
  companyUuid,
  banks,
  line,
  onClose,
  onSaved
}: {
  companyUuid: string
  banks: Bank[]
  line: CreditLine | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [bankUuid, setBankUuid] = useState(line?.bank_uuid ?? banks[0]?.uuid ?? '')
  const [kind, setKind] = useState<CreditLineKind>(line?.kind ?? 'fido_cassa')
  const [label, setLabel] = useState(line?.label ?? '')
  const [granted, setGranted] = useState(euroInput(line?.granted_cents))
  const [used, setUsed] = useState(euroInput(line?.used_cents ?? 0))
  const [usedAsOf, setUsedAsOf] = useState(line?.used_as_of ?? oggiLocale())
  const [rate, setRate] = useState(line?.annual_rate_percent?.toString().replace('.', ',') ?? '')
  const [expiry, setExpiry] = useState(line?.expiry_date ?? '')
  const [notes, setNotes] = useState(line?.notes ?? '')
  const { error, setError, busy, salva } = useSalva(onSaved)

  const invia = (event: React.FormEvent): void => {
    event.preventDefault()
    const grantedCents = parseEuro(granted)
    const usedCents = used.trim() ? parseEuro(used) : 0
    if (grantedCents === null || usedCents === null) {
      setError('Controlla accordato e utilizzato: per esempio 30.000 oppure 8.500,00.')
      return
    }
    const body = {
      bank_uuid: bankUuid,
      kind,
      label: label || CREDIT_LINE_LABELS[kind],
      granted_cents: grantedCents,
      used_cents: usedCents,
      used_as_of: usedAsOf || null,
      annual_rate_percent: parseTasso(rate),
      expiry_date: expiry || null,
      notes
    }
    void salva(() =>
      line
        ? api.put(`/api/companies/${companyUuid}/credit-lines/${line.uuid}`, body)
        : api.post(`/api/companies/${companyUuid}/credit-lines`, body)
    )
  }

  return (
    <Modal
      title={line ? 'Modifica linea di credito' : 'Nuova linea di credito'}
      subtitle="Fido, anticipo fatture, carta: quanto è accordato e quanto è usato."
      onClose={onClose}
    >
      <form onSubmit={invia}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <Field label="Istituto" required>
            <Select value={bankUuid} onChange={(e) => setBankUuid(e.target.value)}>
              {banks.map((b) => (
                <option key={b.uuid} value={b.uuid}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value as CreditLineKind)}>
              {(Object.keys(CREDIT_LINE_LABELS) as CreditLineKind[]).map((k) => (
                <option key={k} value={k}>
                  {CREDIT_LINE_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Descrizione">
              <TextInput
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={CREDIT_LINE_LABELS[kind]}
              />
            </Field>
          </div>
          <Field label="Accordato (€)" required>
            <TextInput value={granted} onChange={(e) => setGranted(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Utilizzato (€)">
            <TextInput value={used} onChange={(e) => setUsed(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Utilizzo alla data">
            <TextInput type="date" value={usedAsOf} onChange={(e) => setUsedAsOf(e.target.value)} />
          </Field>
          <Field label="Tasso annuo (%)">
            <TextInput value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="es. 6,9" />
          </Field>
          <Field label="Scadenza / revisione">
            <TextInput type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
          <Field label="Note">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <Footer busy={busy} onClose={onClose} label={line ? 'Salva' : 'Aggiungi'} />
      </form>
    </Modal>
  )
}

export function LoanModal({
  companyUuid,
  banks,
  loan,
  onClose,
  onSaved
}: {
  companyUuid: string
  banks: Bank[]
  loan: Loan | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [bankUuid, setBankUuid] = useState(loan?.bank_uuid ?? banks[0]?.uuid ?? '')
  const [kind, setKind] = useState<LoanKind>(loan?.kind ?? 'finanziamento')
  const [label, setLabel] = useState(loan?.label ?? '')
  const [principal, setPrincipal] = useState(euroInput(loan?.principal_cents))
  const [rate, setRate] = useState(loan?.annual_rate_percent.toString().replace('.', ',') ?? '')
  const [firstDue, setFirstDue] = useState(loan?.first_due_date ?? '')
  const [installments, setInstallments] = useState(String(loan?.installments ?? 60))
  const [frequency, setFrequency] = useState<Frequency>(loan?.frequency ?? 'monthly')
  const [grace, setGrace] = useState(String(loan?.grace_installments ?? 0))
  const [amortization, setAmortization] = useState(loan?.amortization ?? 'francese')
  const [balloon, setBalloon] = useState(euroInput(loan?.balloon_cents ?? 0))
  const [notes, setNotes] = useState(loan?.notes ?? '')
  const { error, setError, busy, salva } = useSalva(onSaved)

  const bozza = useMemo(() => {
    const principalCents = parseEuro(principal)
    const tasso = parseTasso(rate)
    if (principalCents === null || tasso === null || !firstDue) return null
    return {
      uuid: 'bozza',
      kind,
      label,
      principal_cents: principalCents,
      annual_rate_percent: tasso,
      first_due_date: firstDue,
      installments: Number(installments),
      frequency,
      grace_installments: Number(grace) || 0,
      amortization,
      balloon_cents: kind === 'leasing' ? (parseEuro(balloon) ?? 0) : 0
    }
  }, [principal, rate, firstDue, installments, frequency, grace, amortization, balloon, kind, label])

  const anteprima = useMemo(() => {
    if (!bozza) return null
    const check = validateLoan(bozza)
    if (!check.ok) return { errore: check.error }
    const piano = schedule(bozza)
    const primaVera = piano.find((r) => !r.grace) ?? piano[0]!
    const interessi = piano.reduce((s, r) => s + r.interest, 0)
    return { rata: primaVera.total, ultima: piano[piano.length - 1]!.date, interessi }
  }, [bozza])

  const invia = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!bozza) {
      setError('Servono importo, tasso e data della prima rata.')
      return
    }
    const body = { ...bozza, bank_uuid: bankUuid, label: label || LOAN_LABELS[kind], notes }
    void salva(() =>
      loan
        ? api.put(`/api/companies/${companyUuid}/loans/${loan.uuid}`, body)
        : api.post(`/api/companies/${companyUuid}/loans`, body)
    )
  }

  return (
    <Modal
      title={loan ? 'Modifica finanziamento' : 'Nuovo finanziamento'}
      subtitle="Mutuo, finanziamento o leasing. Le rate entrano da sole nella previsione di cassa."
      onClose={onClose}
    >
      <form onSubmit={invia}>
        <div className="grid grid-cols-3 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <Field label="Istituto" required>
            <Select value={bankUuid} onChange={(e) => setBankUuid(e.target.value)}>
              {banks.map((b) => (
                <option key={b.uuid} value={b.uuid}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value as LoanKind)}>
              <option value="mutuo">Mutuo</option>
              <option value="finanziamento">Finanziamento</option>
              <option value="leasing">Leasing</option>
            </Select>
          </Field>
          <Field label="Descrizione">
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="es. Mutuo sede" />
          </Field>

          <Field label="Importo finanziato (€)" required>
            <TextInput value={principal} onChange={(e) => setPrincipal(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Tasso nominale annuo (%)" required>
            <TextInput value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="es. 4,2" />
          </Field>
          <Field label="Prima rata" required>
            <TextInput type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </Field>

          <Field label="Numero di rate" required hint="Preammortamento compreso.">
            <TextInput value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Periodicità">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ammortamento">
            <Select value={amortization} onChange={(e) => setAmortization(e.target.value as 'francese' | 'italiano')}>
              <option value="francese">Francese (rata costante)</option>
              <option value="italiano">Italiano (quota capitale costante)</option>
            </Select>
          </Field>

          <Field label="Rate di preammortamento" hint="Solo interessi, all'inizio.">
            <TextInput value={grace} onChange={(e) => setGrace(e.target.value)} inputMode="numeric" />
          </Field>
          {kind === 'leasing' ? (
            <Field label="Riscatto finale (€)">
              <TextInput value={balloon} onChange={(e) => setBalloon(e.target.value)} inputMode="decimal" />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Note">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="col-span-3 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm">
            {!anteprima ? (
              <span className="text-ink-400">Compila importo, tasso e prima rata per vedere la rata.</span>
            ) : anteprima.errore ? (
              <span className="text-negative">{anteprima.errore}</span>
            ) : (
              <span className="text-ink-300">
                Rata <strong className="text-ink-100">{euro(anteprima.rata ?? 0, true)}</strong>
                {Number(grace) > 0 && ' dopo il preammortamento'} · ultima rata il{' '}
                <strong className="text-ink-100">{anteprima.ultima?.split('-').reverse().join('/')}</strong> ·
                interessi totali <strong className="text-ink-100">{euro(anteprima.interessi ?? 0)}</strong>
              </span>
            )}
          </div>
        </div>
        <Footer busy={busy} onClose={onClose} label={loan ? 'Salva' : 'Aggiungi'} />
      </form>
    </Modal>
  )
}
