import { useEffect, useState } from 'react'
import { ROLE_LABELS, type Role } from '@shared/enums'
import type { Company } from '@shared/types'
import { api } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import { Logo } from './components/Logo'
import { StatusBar } from './components/StatusBar'
import { Alert, Button } from './components/ui'
import { LoginScreen, SetupScreen } from './pages/AuthScreen'
import { CompanyPage } from './pages/CompanyPage'
import { RegistryPage } from './pages/RegistryPage'
import { RoleGate } from './pages/RoleGate'

/** Vista del Consulente: anagrafica → azienda selezionata. */
function ConsultantShell(): React.JSX.Element {
  const [company, setCompany] = useState<Company | null>(null)

  return company ? (
    <CompanyPage company={company} onBack={() => setCompany(null)} />
  ) : (
    <RegistryPage onOpenCompany={setCompany} />
  )
}

/**
 * Vista dell'operatore Azienda: entra direttamente nella propria azienda,
 * senza anagrafica né accesso alle altre — AGENTS.md §4.
 */
function CompanyShell({ companyUuid }: { companyUuid: string }): React.JSX.Element {
  const [company, setCompany] = useState<Company | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Company>(`/api/companies/${companyUuid}`)
      .then(setCompany)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Azienda non disponibile.')
      )
  }, [companyUuid])

  if (error) {
    return (
      <div className="p-8">
        <Alert>{error}</Alert>
      </div>
    )
  }

  if (!company) return <div className="p-8 text-sm text-ink-400">Caricamento…</div>

  return <CompanyPage company={company} onBack={null} />
}

function AppShell({ onLogout }: { onLogout: () => void }): React.JSX.Element {
  const { user, version } = useAuth()
  if (!user) return <div className="p-8 text-sm text-ink-400">Sessione terminata.</div>

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <header className="flex items-center gap-4 border-b border-ink-700 bg-ink-900 px-6 py-3">
        <span className="flex items-center gap-2.5">
          <Logo size={30} />
          {/* Il wordmark sta in un solo elemento: altrimenti il `gap` del flex
              si infilerebbe anche fra "DaProd" e "Finanza". */}
          <span className="text-sm font-semibold tracking-tight text-ink-100">
            DaProd<span className="text-brand-300">Finanza</span>
          </span>
        </span>
        <span className="rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-300">
          {ROLE_LABELS[user.role]}
        </span>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-ink-300">{user.full_name}</span>
          <Button className="px-3 py-1 text-xs" onClick={onLogout}>
            Esci
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {user.role === 'consultant' ? (
          <ConsultantShell />
        ) : (
          <CompanyShell companyUuid={user.company_uuid!} />
        )}
      </main>

      <StatusBar version={version} />
    </div>
  )
}

function Root(): React.JSX.Element {
  const { ready, configured, demo, user, version, logout } = useAuth()
  // La scelta iniziale Consulente/Azienda: decide solo quale login mostrare.
  const [role, setRole] = useState<Role | null>(null)

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-400">
        Avvio di DaProdFinanza…
      </div>
    )
  }

  // Primo avvio assoluto: esiste una sola strada, creare il Consulente.
  if (!configured) return <SetupScreen />

  if (!user) {
    return role ? (
      <LoginScreen role={role} onBack={() => setRole(null)} />
    ) : (
      <RoleGate version={version} demo={demo} onPick={setRole} />
    )
  }

  // Uscendo si torna alla scelta iniziale, non al login dell'ultimo ruolo usato.
  return (
    <AppShell
      onLogout={() => {
        logout()
        setRole(null)
      }}
    />
  )
}

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
