import { useState, type FormEvent } from 'react'
import { BUSINESS_TYPES, LEGAL_FORMS } from '@shared/enums'
import type { Client, Company } from '@shared/types'
import { api } from '../lib/api'
import { Alert, Button, Field, Modal, Select, TextInput } from './ui'

/**
 * Wizard rapido "+ Nuova azienda" — AGENTS.md §10.1:
 * ragione sociale, P.IVA/CF, forma giuridica, tipo di attività,
 * data inizio collaborazione. Con `company` modifica quella esistente (1.3.0):
 * il cliente e il codice non cambiano.
 */
export function NewCompanyModal({
  clients,
  defaultClientUuid,
  company,
  onClose,
  onCreated
}: {
  clients: Client[]
  defaultClientUuid?: string
  company?: Company
  onClose: () => void
  onCreated: (company: Company) => void
}): React.JSX.Element {
  const [form, setForm] = useState({
    client_uuid: company?.client_uuid ?? defaultClientUuid ?? clients[0]?.uuid ?? '',
    name: company?.name ?? '',
    vat_number: company?.vat_number ?? '',
    tax_code: company?.tax_code ?? '',
    legal_form: company?.legal_form ?? '',
    business_type: company?.business_type ?? '',
    start_date: company?.start_date ?? '',
    notes: company?.notes ?? ''
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const update =
    (key: keyof typeof form) =>
    (value: string): void =>
      setForm((prev) => ({ ...prev, [key]: value }))

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onCreated(
        company
          ? await api.put<Company>(`/api/companies/${company.uuid}`, form)
          : await api.post<Company>('/api/companies', form)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={company ? `Modifica ${company.code}` : 'Nuova azienda'}
      subtitle="L'azienda è l'unità su cui gira tutto il modulo Business: ha un proprio piano dei conti, un proprio bilancio, una propria cassa."
      onClose={onClose}
    >
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {error && (
            <div className="col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}

          <div className="col-span-2">
            <Field label="Cliente" required>
              <Select
                value={form.client_uuid}
                onChange={(e) => update('client_uuid')(e.target.value)}
                disabled={Boolean(company)}
                required
              >
                {clients.map((client) => (
                  <option key={client.uuid} value={client.uuid}>
                    {client.code} — {client.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="col-span-2">
            <Field label="Ragione sociale" required>
              <TextInput
                value={form.name}
                onChange={(e) => update('name')(e.target.value)}
                placeholder="Rossi Meccanica S.r.l."
                autoFocus
                required
              />
            </Field>
          </div>

          <Field label="Partita IVA" hint="11 cifre. È la chiave naturale dell'azienda.">
            <TextInput
              value={form.vat_number}
              onChange={(e) => update('vat_number')(e.target.value)}
              placeholder="01234567890"
              inputMode="numeric"
            />
          </Field>

          <Field label="Codice fiscale">
            <TextInput value={form.tax_code} onChange={(e) => update('tax_code')(e.target.value)} />
          </Field>

          <Field label="Forma giuridica" hint="Decide il calcolo di imposte e contributi.">
            <Select value={form.legal_form} onChange={(e) => update('legal_form')(e.target.value)}>
              <option value="">— non specificata —</option>
              {LEGAL_FORMS.map((legalForm) => (
                <option key={legalForm} value={legalForm}>
                  {legalForm}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Tipo di attività"
            hint="Decide cosa mostra la Marginalità e le % di costo diretto."
          >
            <Select
              value={form.business_type}
              onChange={(e) => update('business_type')(e.target.value)}
            >
              <option value="">— non specificato —</option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Inizio collaborazione">
            <TextInput
              type="date"
              value={form.start_date}
              onChange={(e) => update('start_date')(e.target.value)}
            />
          </Field>

          <Field label="Note">
            <TextInput value={form.notes} onChange={(e) => update('notes')(e.target.value)} />
          </Field>
        </div>

        <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !form.client_uuid}>
            {busy ? 'Salvataggio…' : company ? 'Salva' : 'Crea azienda'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
