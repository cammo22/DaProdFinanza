import { useState, type FormEvent } from 'react'
import type { Company } from '@shared/types'
import { api } from '../lib/api'
import { Alert, Button, Field, Modal, TextInput } from './ui'

/**
 * Credenziali per l'app Azienda (ruolo `company`) — AGENTS.md §4.
 * L'operatore creato qui vedrà soltanto questa azienda.
 */
export function NewCompanyUserModal({
  company,
  onClose,
  onCreated
}: {
  company: Company
  onClose: () => void
  onCreated: (username: string) => void
}): React.JSX.Element {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.post('/api/auth/users/company', {
        username,
        password,
        full_name: fullName,
        company_uuid: company.uuid,
        phone
      })
      onCreated(username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creazione non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Accesso Azienda"
      subtitle={`Credenziali per ${company.name}. Chi accede con questo account vede solo questa azienda.`}
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
            <Field label="Nome e cognome" required>
              <TextInput
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
                required
              />
            </Field>
          </div>

          <Field label="Username" required>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
            />
          </Field>

          <Field label="Password" hint="Almeno 8 caratteri." required>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>

          <div className="col-span-2">
            <Field label="Telefono" hint="Facoltativo: il numero a cui lo studio richiama quando l'azienda chiede una chiamata.">
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
          </div>
        </div>

        <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creazione…' : 'Crea accesso'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
