import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Role } from '@shared/enums'
import type { DemoCredential, LoginResponse, SessionUser, SetupState } from '@shared/types'
import { api, ApiRequestError, EVENTO_SESSIONE, initApi, setToken } from './api'

interface AuthContextValue {
  ready: boolean
  version: string
  /** false al primo avvio assoluto: va creato l'account Consulente. */
  configured: boolean
  /** Credenziali dimostrative, solo nelle build di sviluppo. */
  demo: DemoCredential[] | null
  /** true nella versione dimostrativa costruita da `npm run dist:demo`. */
  demoBuild: boolean
  user: SessionUser | null
  login: (username: string, password: string, role?: Role) => Promise<void>
  setupConsultant: (username: string, password: string, fullName: string) => Promise<void>
  logout: () => void
  /** Dopo una modifica del proprio profilo: il nome in alto si aggiorna subito. */
  updateUser: (user: SessionUser) => void
  /** Perché si è tornati all'ingresso senza aver premuto "Esci" (sessione scaduta…). */
  motivoUscita: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState('')
  const [configured, setConfigured] = useState(false)
  const [demo, setDemo] = useState<DemoCredential[] | null>(null)
  const [demoBuild, setDemoBuild] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      const info = await initApi()
      const state = await api.get<SetupState>('/api/auth/setup')
      if (cancelled) return

      setVersion(info.version)
      setDemoBuild(info.demoBuild)
      setConfigured(state.configured)
      setDemo(state.demo)

      // Sessione già aperta in questa finestra (token in sessionStorage).
      try {
        const me = await api.get<SessionUser>('/api/auth/me')
        if (!cancelled) setUser(me)
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) setToken(null)
      }

      if (!cancelled) setReady(true)
    }

    bootstrap().catch(() => setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  // Sessione scaduta o accesso disattivato: si torna all'ingresso, col motivo.
  const [motivoUscita, setMotivoUscita] = useState<string | null>(null)
  useEffect(() => {
    const finita = (e: Event): void => {
      setMotivoUscita((e as CustomEvent<string>).detail ?? 'Sessione scaduta.')
      setToken(null)
      setUser(null)
    }
    window.addEventListener(EVENTO_SESSIONE, finita)
    return () => window.removeEventListener(EVENTO_SESSIONE, finita)
  }, [])

  const login = useCallback(async (username: string, password: string, role?: Role) => {
    const response = await api.post<LoginResponse>('/api/auth/login', { username, password, role })
    setToken(response.token)
    setMotivoUscita(null)
    setUser(response.user)
  }, [])

  const setupConsultant = useCallback(
    async (username: string, password: string, fullName: string) => {
      const response = await api.post<LoginResponse>('/api/auth/setup', {
        username,
        password,
        full_name: fullName
      })
      setToken(response.token)
      setUser(response.user)
      setConfigured(true)
    },
    []
  )

  const logout = useCallback(() => {
    setToken(null)
    setMotivoUscita(null)
    setUser(null)
  }, [])

  const updateUser = useCallback((next: SessionUser) => {
    setUser({
      uuid: next.uuid,
      username: next.username,
      full_name: next.full_name,
      role: next.role,
      company_uuid: next.company_uuid
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      version,
      configured,
      demo,
      demoBuild,
      user,
      login,
      setupConsultant,
      logout,
      updateUser,
      motivoUscita
    }),
    [ready, version, configured, demo, demoBuild, user, login, setupConsultant, logout, updateUser, motivoUscita]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth va usato dentro <AuthProvider>.')
  return context
}
