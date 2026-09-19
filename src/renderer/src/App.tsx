import { useEffect, useState } from 'react'
import { ROLE_LABELS, type Role } from '@shared/enums'
import type { Company } from '@shared/types'
import { api } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import { Sidebar, type Vista } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TimerBar } from './components/TimerBar'
import { Alert, Button } from './components/ui'
import { LoginScreen, SetupScreen } from './pages/AuthScreen'
import { CompanyPage } from './pages/CompanyPage'
import { RegistryPage } from './pages/RegistryPage'
import { RoleGate } from './pages/RoleGate'

/**
 * Guscio dell'applicazione: menu laterale, contenuto, status bar.
 *
 * La navigazione vive qui e non dentro le pagine, così il menu resta fermo
 * mentre il contenuto cambia — è il comportamento dei mockup analizzati.
 */
function Workspace({ onLogout }: { onLogout: () => void }): React.JSX.Element {
  const { user, version } = useAuth()
  const consulente = user?.role === 'consultant'

  const [company, setCompany] = useState<Company | null>(null)
  const [vista, setVista] = useState<Vista>(consulente ? 'anagrafica' : 'panoramica')
  const [error, setError] = useState<string | null>(null)
  // Menu laterale sul telefono (sul computer è sempre aperto).
  const [menu, setMenu] = useState(false)

  // L'operatore Azienda entra direttamente nella propria azienda (§4).
  useEffect(() => {
    if (consulente || !user?.company_uuid) return
    api
      .get<Company>(`/api/companies/${user.company_uuid}`)
      .then(setCompany)
      .catch((err) => setError(err instanceof Error ? err.message : 'Azienda non disponibile.'))
  }, [consulente, user?.company_uuid])

  const apriAzienda = (scelta: Company): void => {
    setCompany(scelta)
    setVista('panoramica')
  }

  // Dal timer in alto: le attività dell'azienda su cui sta contando.
  const apriAttivita = (uuid: string): void => {
    api
      .get<Company>(`/api/companies/${uuid}`)
      .then((scelta) => {
        setCompany(scelta)
        setVista('attivita')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Azienda non disponibile.'))
  }

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          company={company}
          vista={vista}
          onVista={(v) => {
            setVista(v)
            setMenu(false)
          }}
          onAnagrafica={() => {
            setCompany(null)
            setVista('anagrafica')
            setMenu(false)
          }}
          mostraAnagrafica={consulente}
          mostraImport={consulente}
          version={version}
          aperta={menu}
          onChiudi={() => setMenu(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-ink-700 bg-ink-900 px-3 py-2.5 md:gap-4 md:px-6">
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="rounded-md px-2 py-0.5 text-lg leading-none text-ink-300 hover:bg-ink-800 md:hidden"
              aria-label="Apri il menu"
            >
              ☰
            </button>
            <span className="rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-300">
              {user ? ROLE_LABELS[user.role] : ''}
            </span>
            <div className="ml-auto flex min-w-0 items-center gap-2 md:gap-4">
              {consulente && <TimerBar onApri={apriAttivita} />}
              <span className="hidden text-xs text-ink-300 sm:inline">{user?.full_name}</span>
              <Button className="px-3 py-1 text-xs" onClick={onLogout}>
                Esci
              </Button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden">
            {error ? (
              <div className="p-8">
                <Alert>{error}</Alert>
              </div>
            ) : company ? (
              <CompanyPage
                company={company}
                vista={vista}
                onVista={setVista}
                canImport={consulente}
              />
            ) : consulente ? (
              <RegistryPage onOpenCompany={apriAzienda} />
            ) : (
              <p className="p-8 text-sm text-ink-400">Caricamento…</p>
            )}
          </main>
        </div>
      </div>

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
    <Workspace
      key={user.uuid}
      onLogout={() => {
        logout()
        setRole(null)
      }}
    />
  )
}

/**
 * Nella versione dimostrativa una striscia sempre visibile lo dice: chi la
 * prova non deve mai scambiare la Pizzeria DaProd per dati veri.
 */
function Frame(): React.JSX.Element {
  const { demoBuild } = useAuth()
  return (
    <div className="flex h-full flex-col">
      {demoBuild && (
        <div className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-xs text-warning">
          <span className="font-semibold">Versione dimostrativa</span> — i dati sono di esempio e
          restano separati da quelli di un&apos;installazione reale.
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Root />
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <Frame />
    </AuthProvider>
  )
}
