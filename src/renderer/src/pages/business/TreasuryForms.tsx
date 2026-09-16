import { useState } from 'react'
import {
  PAYMENT_METHODS,
  TREASURY_CATEGORIES_IN,
  TREASURY_CATEGORIES_OUT
} from '@shared/enums'
import { dueDate, PAYMENT_DAYS, PAYMENT_TERMS, residual, type PaymentTerms } from '@shared/engine'
import type { TreasuryItem, TreasuryItemInput, TreasurySettings } from '@shared/types'
import { api } from '../../lib/api'
import { euro, euroInput, parseEuro } from '../../lib/format'
import { Alert, Button, Field, Modal, Select, TextInput } from '../../components/ui'

/**
 * Moduli della Tesoreria: una scadenza o una previsione, un incasso/pagamento,
 * le impostazioni. Il server valida comunque tutto: qui si aiuta a compilare.
 */

export function oggiLocale(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Footer({
  busy,
  onClose,
  label
}: {
  busy: boolean
  onClose: () => void
  label: string
}): React.JSX.Element {
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

export function ItemModal({
  companyUuid,
  source,
  item,
  onClose,
  onSaved
}: {
  companyUuid: string
  source: 'scadenziario' | 'manuale'
  item: TreasuryItem | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const scadenziario = source === 'scadenziario'
  const [direction, setDirection] = useState<'in' | 'out'>(item?.direction ?? 'in')
  const [category, setCategory] = useState(item?.category ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [counterparty, setCounterparty] = useState(item?.counterparty ?? '')
  const [documentRef, setDocumentRef] = useState(item?.document_ref ?? '')
  const [documentDate, setDocumentDate] = useState(item?.document_date ?? '')
  const [terms, setTerms] = useState<PaymentTerms | ''>(item?.payment_terms ?? '')
  const [days, setDays] = useState(String(item?.payment_days ?? 30))
  const [method, setMethod] = useState(item?.payment_method ?? '')
  const [due, setDue] = useState(item?.due_date ?? '')
  const [amount, setAmount] = useState(euroInput(item?.amount_cents))
  const [monthly, setMonthly] = useState(item?.recurrence === 'monthly')
  const [until, setUntil] = useState(item?.recurrence_until ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const categorie = direction === 'in' ? TREASURY_CATEGORIES_IN : TREASURY_CATEGORIES_OUT

  // La scadenza si propone dalle condizioni, ma resta modificabile.
  const ricalcola = (data: string, t: PaymentTerms | '', g: string): void => {
    if (data && t) setDue(dueDate(data, t, Number(g) || 0))
  }

  const salva = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const cents = parseEuro(amount)
    if (cents === null || cents <= 0) {
      setError("Scrivi un importo maggiore di zero, per esempio 1.250,00.")
      return
    }
    const body: TreasuryItemInput = {
      source,
      direction,
      category: category || categorie[0],
      description,
      counterparty: counterparty || null,
      document_ref: scadenziario ? documentRef || null : null,
      document_date: scadenziario ? documentDate || null : null,
      payment_terms: scadenziario && terms ? terms : null,
      payment_days: scadenziario && terms ? Number(days) || 0 : null,
      payment_method: method || null,
      due_date: due || undefined,
      amount_cents: cents,
      recurrence: !scadenziario && monthly ? 'monthly' : 'none',
      recurrence_until: !scadenziario && monthly ? until || null : null,
      notes: notes || null
    }
    setBusy(true)
    setError(null)
    try {
      if (item) {
        await api.put(`/api/companies/${companyUuid}/treasury/items/${item.uuid}`, body)
      } else {
        await api.post(`/api/companies/${companyUuid}/treasury/items`, body)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  const titolo = scadenziario
    ? item
      ? 'Modifica scadenza'
      : 'Nuova scadenza'
    : item
      ? 'Modifica previsione'
      : 'Nuova previsione'

  return (
    <Modal
      title={titolo}
      subtitle={
        scadenziario
          ? 'Una fattura da incassare o da pagare, con la sua scadenza.'
          : 'Un movimento atteso che non è ancora una fattura: stipendi, affitto, incassi di cassa…'
      }
      onClose={onClose}
    >
      <form onSubmit={salva}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}

          <Field label="Tipo" required>
            <Select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as 'in' | 'out')
                setCategory('')
              }}
            >
              <option value="in">{scadenziario ? 'Da incassare' : 'Entrata'}</option>
              <option value="out">{scadenziario ? 'Da pagare' : 'Uscita'}</option>
            </Select>
          </Field>

          <Field label="Categoria" required>
            <Select value={category || categorie[0]} onChange={(e) => setCategory(e.target.value)}>
              {[...new Set([...categorie, ...(category ? [category] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <div className="col-span-2">
            <Field label="Descrizione" required>
              <TextInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={scadenziario ? 'es. Fornitura farine' : 'es. Stipendi del mese'}
                autoFocus
              />
            </Field>
          </div>

          <Field label={direction === 'in' ? 'Cliente' : 'Fornitore / beneficiario'}>
            <TextInput value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </Field>

          <Field label="Importo (€)" required>
            <TextInput
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>

          {scadenziario && (
            <>
              <Field label="Numero documento">
                <TextInput value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="es. FT 2026/041" />
              </Field>
              <Field label="Data documento">
                <TextInput
                  type="date"
                  value={documentDate}
                  onChange={(e) => {
                    setDocumentDate(e.target.value)
                    ricalcola(e.target.value, terms, days)
                  }}
                />
              </Field>
              <Field label="Condizioni di pagamento">
                <Select
                  value={terms}
                  onChange={(e) => {
                    const t = e.target.value as PaymentTerms | ''
                    setTerms(t)
                    ricalcola(documentDate, t, days)
                  }}
                >
                  <option value="">— scadenza a mano —</option>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} · {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Giorni">
                <Select
                  value={days}
                  disabled={!terms}
                  onChange={(e) => {
                    setDays(e.target.value)
                    ricalcola(documentDate, terms, e.target.value)
                  }}
                >
                  {PAYMENT_DAYS.map((g) => (
                    <option key={g} value={g}>
                      {g} giorni
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <Field
            label={monthly ? 'Prima scadenza' : 'Scadenza'}
            required
            hint={scadenziario && terms ? 'Calcolata dalle condizioni: si può correggere.' : undefined}
          >
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>

          <Field label="Modalità di pagamento">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>

          {!scadenziario && (
            <>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-200">
                <input
                  type="checkbox"
                  checked={monthly}
                  onChange={(e) => setMonthly(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                Si ripete ogni mese
              </label>
              {monthly && (
                <Field label="Fino al" hint="Vuoto = senza fine.">
                  <TextInput type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </Field>
              )}
            </>
          )}

          <div className="col-span-2">
            <Field label="Note">
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        <Footer busy={busy} onClose={onClose} label={item ? 'Salva le modifiche' : 'Aggiungi'} />
      </form>
    </Modal>
  )
}

export function PaymentModal({
  companyUuid,
  item,
  onClose,
  onSaved
}: {
  companyUuid: string
  item: TreasuryItem
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const residuo = residual(item)
  const [amount, setAmount] = useState(euroInput(residuo))
  const [date, setDate] = useState(oggiLocale())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const incasso = item.direction === 'in'

  const salva = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const cents = parseEuro(amount)
    if (cents === null) {
      setError('Importo non valido.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post(`/api/companies/${companyUuid}/treasury/items/${item.uuid}/payments`, {
        amount_cents: cents,
        date
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrazione non riuscita.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={incasso ? 'Registra un incasso' : 'Registra un pagamento'}
      subtitle={`${item.description}${item.counterparty ? ` · ${item.counterparty}` : ''} — residuo ${euro(residuo)}`}
      onClose={onClose}
    >
      <form onSubmit={salva}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <Field label="Importo (€)" required hint="Un importo minore del residuo lo lascia aperto per la differenza.">
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={incasso ? 'Data incasso' : 'Data pagamento'} required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Footer busy={busy} onClose={onClose} label="Registra" />
      </form>
    </Modal>
  )
}

export function SettingsModal({
  companyUuid,
  settings,
  onClose,
  onSaved
}: {
  companyUuid: string
  settings: TreasurySettings
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [soglia, setSoglia] = useState(euroInput(settings.min_liquidity_cents))
  const [saldo, setSaldo] = useState(euroInput(settings.opening_cash_cents))
  const [data, setData] = useState(settings.opening_cash_date ?? oggiLocale())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const salva = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const sogliaCents = soglia.trim() ? parseEuro(soglia) : null
    const saldoCents = saldo.trim() ? parseEuro(saldo) : null
    if ((soglia.trim() && sogliaCents === null) || (saldo.trim() && saldoCents === null)) {
      setError('Controlla gli importi: per esempio 25.000 oppure 25000,00.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.put(`/api/companies/${companyUuid}/treasury/settings`, {
        min_liquidity_cents: sogliaCents,
        opening_cash_cents: saldoCents,
        opening_cash_date: saldoCents === null ? null : data
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Impostazioni di tesoreria"
      subtitle="Il saldo di partenza della previsione e la soglia sotto cui scatta l'avviso."
      onClose={onClose}
    >
      <form onSubmit={salva}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <Field
            label="Saldo di banca e cassa (€)"
            hint="Vuoto = si usano le liquidità dell'ultimo bilancio caricato."
          >
            <TextInput value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Alla data">
            <TextInput type="date" value={data} max={oggiLocale()} onChange={(e) => setData(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field
              label="Soglia minima di liquidità (€)"
              hint="Se la previsione ci scende sotto, la Panoramica avvisa con quanti giorni di anticipo."
            >
              <TextInput value={soglia} onChange={(e) => setSoglia(e.target.value)} inputMode="decimal" />
            </Field>
          </div>
        </div>
        <Footer busy={busy} onClose={onClose} label="Salva" />
      </form>
    </Modal>
  )
}
