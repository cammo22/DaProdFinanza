import { useState, type FormEvent } from 'react'
import type { Client } from '@shared/types'
import { api } from '../lib/api'
import { Alert, Button, Field, Modal, TextInput } from './ui'

/** "+ Nuovo cliente" — AGENTS.md §10.1. Con `client` modifica quello esistente (1.3.0). */
export function NewClientModal({
  client,
  onClose,
  onCreated
}: {
  client?: Client
  onClose: () => void
  onCreated: (client: Client) => void
}): React.JSX.Element {
  const [form, setForm] = useState({
    name: client?.name ?? '',
    contact_person: client?.contact_person ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    start_date: client?.start_date ?? '',
    notes: client?.notes ?? ''
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onCreated(
        client
          ? await api.put<Client>(`/api/clients/${client.uuid}`, form)
          : await api.post<Client>('/api/clients', form)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={client ? `Modifica ${client.code}` : 'Nuovo cliente'}
      subtitle="Un cliente dello studio: può possedere più aziende."
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
            <Field label="Denominazione" required>
              <TextInput
                value={form.name}
                onChange={(e) => update('name')(e.target.value)}
                placeholder="Gruppo Rossi"
                autoFocus
                required
              />
            </Field>
          </div>

          <Field label="Referente">
            <TextInput
              value={form.contact_person}
              onChange={(e) => update('contact_person')(e.target.value)}
              placeholder="Mario Rossi"
            />
          </Field>

          <Field label="Inizio collaborazione">
            <TextInput
              type="date"
              value={form.start_date}
              onChange={(e) => update('start_date')(e.target.value)}
            />
          </Field>

          <Field label="Email">
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => update('email')(e.target.value)}
            />
          </Field>

          <Field label="Telefono">
            <TextInput value={form.phone} onChange={(e) => update('phone')(e.target.value)} />
          </Field>

          <div className="col-span-2">
            <Field label="Note">
              <TextInput value={form.notes} onChange={(e) => update('notes')(e.target.value)} />
            </Field>
          </div>
        </div>

        <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Salvataggio…' : client ? 'Salva' : 'Crea cliente'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
