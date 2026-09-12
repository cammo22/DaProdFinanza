import { useState, type FormEvent } from 'react'
import { ROLE_LABELS, type Role } from '@shared/enums'
import { useAuth } from '../lib/auth'
import { Logo } from '../components/Logo'
import { Alert, Button, Field, TextInput } from '../components/ui'

function Shell({
  title,
  subtitle,
  children,
  version,
  onBack
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  version: string
  onBack?: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-ink-950 p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={88} />
          <h1 className="sr-only">DaProdFinanza</h1>
          <p className="mt-3 text-xs uppercase tracking-widest text-ink-400">
            Controllo di gestione
          </p>
        </div>

        <div className="rounded-xl border border-ink-700 bg-ink-850 p-7 shadow-2xl shadow-black/50">
          <h2 className="text-base font-semibold text-ink-100">{title}</h2>
          <p className="mt-1 mb-6 text-sm text-ink-400">{subtitle}</p>
          {children}
        </div>

        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mx-auto mt-6 block text-xs text-ink-400 transition-colors hover:text-ink-100"
          >
            ← Cambia tipo di accesso
          </button>
        ) : (
          <p className="mt-6 text-center font-mono text-xs text-ink-600">v{version || '—'}</p>
        )}
      </div>
    </div>
  )
}

/** Primo avvio assoluto: creazione dell'account Consulente (Master) — §4/§10.1. */
export function SetupScreen(): React.JSX.Element {
  const { setupConsultant, version } = useAuth()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Le due password non coincidono.')
      return
    }

    setBusy(true)
    try {
      await setupConsultant(username, password, fullName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configurazione non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell
      version={version}
      title="Primo avvio"
      subtitle="Crea l'account del Consulente. È l'account Master: gestisce tutti i clienti, le aziende e la configurazione."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Nome e cognome" required>
          <TextInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Mario Rossi"
            autoFocus
            required
          />
        </Field>

        <Field label="Username" required>
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="mrossi"
            autoComplete="username"
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

        <Field label="Conferma password" required>
          <TextInput
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" variant="primary" disabled={busy} className="mt-2 w-full">
          {busy ? 'Creazione…' : 'Crea account e accedi'}
        </Button>
      </form>
    </Shell>
  )
}

export function LoginScreen({
  role,
  onBack
}: {
  role: Role
  onBack: () => void
}): React.JSX.Element {
  const { login, version, demo } = useAuth()
  const credential = demo?.find((account) => account.role === role)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (user: string, pass: string): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await login(user, pass, role)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accesso non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void submit(username, password)
  }

  return (
    <Shell
      version={version}
      onBack={onBack}
      title={`Accesso ${ROLE_LABELS[role]}`}
      subtitle={
        role === 'consultant'
          ? 'Le credenziali del professionista o del suo staff.'
          : "Le credenziali che il consulente ha creato per la tua azienda."
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Username" required>
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <Field label="Password" required>
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" variant="primary" disabled={busy} className="mt-2 w-full">
          {busy ? 'Accesso…' : 'Accedi'}
        </Button>

        {credential && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setUsername(credential.username)
              setPassword(credential.password)
              void submit(credential.username, credential.password)
            }}
            className="rounded-lg border border-dashed border-ink-700 px-3 py-2 font-mono text-[11px] text-ink-400 transition-colors hover:border-brand-500/60 hover:text-brand-300 disabled:opacity-50"
          >
            entra come demo · {credential.username} / {credential.password}
          </button>
        )}
      </form>
    </Shell>
  )
}
