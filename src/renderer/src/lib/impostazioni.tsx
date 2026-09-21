import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  appPredefinite,
  normalizzaApp,
  utentePredefinite,
  type AppSettings,
  type Modulo,
  type UserSettings,
  type VistaCondivisibile
} from '@shared/settings'
import { api } from './api'
import { useAuth } from './auth'
import { applicaTema } from './tema'

/**
 * Impostazioni lette una volta dopo l'ingresso e condivise da tutte le
 * schermate (§10.12): quelle del programma, quelle di chi è entrato e — per
 * l'operatore Azienda — cosa gli ha acceso il consulente.
 */

export interface PortaleAzienda {
  viste: VistaCondivisibile[]
  permessi: {
    documenti: boolean
    inviareDocumenti: boolean
    richieste: boolean
    richiedereChiamate: boolean
    scrivereMessaggi: boolean
  }
}

interface ImpostazioniValue {
  pronte: boolean
  app: AppSettings
  utente: UserSettings
  /** Solo per l'operatore Azienda; null per il consulente. */
  portale: PortaleAzienda | null
  moduloAttivo: (m: Modulo) => boolean
  salvaApp: (parziale: Partial<AppSettings>) => Promise<AppSettings>
  salvaUtente: (parziale: Partial<UserSettings>) => Promise<UserSettings>
  ricarica: () => Promise<void>
}

const Ctx = createContext<ImpostazioniValue | null>(null)

export function ImpostazioniProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const [pronte, setPronte] = useState(false)
  const [app, setApp] = useState<AppSettings>(appPredefinite)
  const [utente, setUtente] = useState<UserSettings>(utentePredefinite)
  const [portale, setPortale] = useState<PortaleAzienda | null>(null)

  // Dipende da chi è entrato, non dal suo nome: rinominarsi dal profilo non
  // deve ricaricare tutto.
  const uuid = user?.uuid
  const aziendaUuid = user?.role === 'company' ? user.company_uuid : null
  const ricarica = useCallback(async () => {
    if (!uuid) return
    try {
      const [a, u, p] = await Promise.all([
        api.get<Partial<AppSettings>>('/api/settings/app'),
        api.get<UserSettings>('/api/auth/me/settings'),
        aziendaUuid ? api.get<PortaleAzienda>(`/api/companies/${aziendaUuid}/portal`) : Promise.resolve(null)
      ])
      // L'azienda riceve solo moduli e studio: il resto resta ai predefiniti.
      setApp(normalizzaApp(a))
      setUtente(u)
      applicaTema(u.tema)
      setPortale(p)
    } catch {
      // Senza impostazioni valgono i predefiniti: il programma resta usabile.
    } finally {
      setPronte(true)
    }
  }, [uuid, aziendaUuid])

  useEffect(() => {
    setPronte(false)
    void ricarica()
  }, [ricarica])

  // Per l'operatore Azienda: se il consulente accende o spegne una sezione, il
  // menu si aggiorna da solo (al ritorno sulla finestra e ogni minuto).
  useEffect(() => {
    if (!aziendaUuid) return
    const aggiorna = (): void => void ricarica()
    window.addEventListener('focus', aggiorna)
    const timer = setInterval(aggiorna, 60_000)
    return () => {
      window.removeEventListener('focus', aggiorna)
      clearInterval(timer)
    }
  }, [aziendaUuid, ricarica])

  const salvaApp = useCallback(async (parziale: Partial<AppSettings>) => {
    const next = await api.put<AppSettings>('/api/settings/app', parziale)
    setApp(next)
    return next
  }, [])

  const salvaUtente = useCallback(async (parziale: Partial<UserSettings>) => {
    const next = await api.put<UserSettings>('/api/auth/me/settings', parziale)
    setUtente(next)
    applicaTema(next.tema)
    return next
  }, [])

  const value = useMemo<ImpostazioniValue>(
    () => ({
      pronte,
      app,
      utente,
      portale,
      moduloAttivo: (m) => app.moduli[m],
      salvaApp,
      salvaUtente,
      ricarica
    }),
    [pronte, app, utente, portale, salvaApp, salvaUtente, ricarica]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useImpostazioni(): ImpostazioniValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useImpostazioni va usato dentro <ImpostazioniProvider>.')
  return ctx
}
