import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ROLE_LABELS, type Role } from '@shared/enums'
import type { ClientWithCompanies, Company } from '@shared/types'
import { api } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import { ComandiProvider, richiediAzione, useComandi, useRegistraComandi, type Comando } from './lib/comandi'
import { ImpostazioniProvider, useImpostazioni } from './lib/impostazioni'
import { InboxProvider, useInbox } from './lib/inbox'
import { leggiRecenti, segnaRecente, type AziendaRecente } from './lib/recenti'
import { Campanello, IncomingCalls } from './components/IncomingCalls'
import {
  AzioniRapide,
  BarraBasso,
  CercaComandi,
  MenuUtente,
  PulsanteRapidoTelefono,
  SceltaAzienda,
  type SchedaBasso
} from './components/Guscio'
import { Icona, type NomeIcona } from './components/icone'
import { bloccaPannelli, pannelliBloccati } from './components/Pannelli'
import { RequestsBoard } from './components/RequestsBoard'
import {
  GRUPPI_CONSULENTE,
  nomeVista,
  Sidebar,
  useMenuCompatto,
  V,
  VISTE_AZIENDA_ORDINE,
  voceDi,
  type Vista
} from './components/Sidebar'
import { StatusBar, StrumentiTelefono } from './components/StatusBar'
import { TavolozzaComandi } from './components/TavolozzaComandi'
import { TimerBar, useTimerAcceso } from './components/TimerBar'
import { Alert } from './components/ui'
import { Avvisi, mostraAvviso } from './components/Avvisi'
import { avvisaTimer } from './pages/business/ActivitiesView'
import { LoginScreen, SetupScreen } from './pages/AuthScreen'
import { CompanyPage } from './pages/CompanyPage'
import { RegistryPage } from './pages/RegistryPage'
import { RoleGate } from './pages/RoleGate'
import { dimentica } from './lib/memoria'

const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

/**
 * Guscio dell'applicazione: menu laterale, intestazione, contenuto, barra di
 * stato — e dalla 1.3.0 i comandi rapidi (Ctrl+K), il pulsante "Nuovo", il
 * cambio d'azienda in alto e, sul telefono, la barra delle sezioni in basso.
 *
 * La navigazione vive qui e non dentro le pagine, così il menu resta fermo
 * mentre il contenuto cambia — è il comportamento dei mockup analizzati.
 */

/** Le pagine dello studio, fuori da un'azienda. */
const VISTE_STUDIO: Vista[] = ['anagrafica', 'impostazioni', 'profilo', 'richieste-studio']

interface AziendaElenco {
  uuid: string
  name: string
  code: string
  cliente: string
}

interface GruppoTelefono {
  id: string
  titolo: string
  icona: NomeIcona
  voci: Vista[]
  badge?: number
}

function Workspace({ onLogout }: { onLogout: () => void }): React.JSX.Element {
  const { user, version } = useAuth()
  const { pronte, portale, moduloAttivo, salvaUtente } = useImpostazioni()
  const { riepilogo } = useInbox()
  const { apriTavolozza, tavolozza } = useComandi()
  const consulente = user?.role === 'consultant'

  const [company, setCompany] = useState<Company | null>(null)
  // L'azienda entra nel suo riepilogo; il consulente nell'anagrafica.
  const [vista, setVista] = useState<Vista>(consulente ? 'anagrafica' : 'riepilogo')
  // Una richiesta da aprire nella casella (dal pannello delle chiamate o dal campanello).
  const [richiestaScelta, setRichiestaScelta] = useState<{ companyUuid: string; requestUuid: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Menu laterale sul telefono (sul computer è sempre aperto, magari a icone).
  const [menu, setMenu] = useState(false)
  const [compatto, setCompatto] = useMenuCompatto()
  const [recenti, setRecenti] = useState<AziendaRecente[]>(() => (user ? leggiRecenti(user.uuid) : []))
  const [aziende, setAziende] = useState<AziendaElenco[]>([])
  const [chiaro, setChiaro] = useState(() => document.documentElement.dataset.theme === 'light')
  const timer = useTimerAcceso()

  // L'operatore Azienda vede solo le viste che il consulente gli ha acceso
  // (§10.12): se quella aperta non c'è più, si va sulla prima disponibile.
  const visteAzienda = useMemo(() => portale?.viste ?? [], [portale])
  const permessiAzienda = portale?.permessi ?? null
  useEffect(() => {
    if (consulente || !pronte) return
    const sempre: Vista[] = ['profilo', 'riepilogo']
    if (permessiAzienda?.documenti) sempre.push('documenti')
    if (permessiAzienda?.richieste) sempre.push('richieste')
    if (!sempre.includes(vista) && !visteAzienda.includes(vista as never)) setVista('riepilogo')
  }, [consulente, pronte, vista, visteAzienda, permessiAzienda])

  const vai = useCallback((v: Vista) => {
    setVista(v)
    setMenu(false)
  }, [])

  const apriRichiesta = (companyUuid: string, requestUuid: string): void => {
    setRichiestaScelta({ companyUuid, requestUuid })
    vai(consulente ? 'richieste-studio' : 'richieste')
  }

  // L'operatore Azienda entra direttamente nella propria azienda (§4).
  useEffect(() => {
    if (consulente || !user?.company_uuid) return
    api
      .get<Company>(`/api/companies/${user.company_uuid}`)
      .then(setCompany)
      .catch((err) => setError(err instanceof Error ? err.message : 'Azienda non disponibile.'))
  }, [consulente, user?.company_uuid])

  const apriAzienda = useCallback(
    (scelta: Company, v: Vista = 'panoramica') => {
      setCompany(scelta)
      setVista(v)
      setMenu(false)
      setError(null)
      if (user) setRecenti(segnaRecente(user.uuid, scelta))
    },
    [user]
  )

  // Da un'altra azienda si resta sulla stessa sezione; dalle pagine dello studio si parte dalla panoramica.
  const apriAziendaUuid = useCallback(
    (uuid: string, v?: Vista) => {
      api
        .get<Company>(`/api/companies/${uuid}`)
        .then((scelta) => apriAzienda(scelta, v ?? (company && !VISTE_STUDIO.includes(vista) ? vista : 'panoramica')))
        .catch((err) => setError(err instanceof Error ? err.message : 'Azienda non disponibile.'))
    },
    [apriAzienda, company, vista]
  )

  // Elenco delle aziende per la ricerca (solo lo studio ne ha più d'una).
  const caricaAziende = useCallback(() => {
    if (!consulente) return
    api
      .get<ClientWithCompanies[]>('/api/clients?archived=false')
      .then((clienti) =>
        setAziende(
          clienti.flatMap((c) => c.companies.map((a) => ({ uuid: a.uuid, name: a.name, code: a.code, cliente: c.name })))
        )
      )
      .catch(() => undefined)
  }, [consulente])
  useEffect(() => {
    caricaAziende()
  }, [caricaAziende, vista === 'anagrafica'])
  useEffect(() => {
    if (tavolozza.aperta) caricaAziende()
  }, [tavolozza.aperta, caricaAziende])

  const anagrafica = useCallback(() => {
    setCompany(null)
    vai('anagrafica')
  }, [vai])

  const cambiaTema = useCallback(() => {
    const prossimo = !(document.documentElement.dataset.theme === 'light')
    setChiaro(prossimo)
    void salvaUtente({ tema: prossimo ? 'chiaro' : 'scuro' })
  }, [salvaUtente])

  // --- scorciatoie da tastiera ---
  const compattoRef = useRef(compatto)
  compattoRef.current = compatto
  useEffect(() => {
    const tasto = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.shiftKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        apriTavolozza()
      } else if (k === 'b') {
        e.preventDefault()
        setCompatto(!compattoRef.current)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [apriTavolozza, setCompatto])

  // --- sezioni visibili ---
  const visibile = useCallback(
    (v: Vista): boolean => {
      if (VISTE_STUDIO.includes(v)) return true
      const voce = V[v as keyof typeof V]
      if (voce?.modulo && !moduloAttivo(voce.modulo)) return false
      if (consulente) return v !== 'riepilogo'
      if (v === 'riepilogo') return true
      if (v === 'documenti') return Boolean(permessiAzienda?.documenti)
      if (v === 'richieste') return Boolean(permessiAzienda?.richieste)
      return visteAzienda.includes(v as never)
    },
    [consulente, moduloAttivo, permessiAzienda, visteAzienda]
  )

  // --- gruppi delle sezioni sul telefono (barra in basso) ---
  const gruppiTelefono = useMemo<GruppoTelefono[]>(() => {
    const perAzienda = riepilogo?.per_company ?? {}
    const grezzi: GruppoTelefono[] = consulente
      ? company
        ? [
            { id: 'analisi', titolo: 'Analisi', icona: 'grafico', voci: GRUPPI_CONSULENTE[0]!.voci },
            { id: 'cassa', titolo: 'Cassa', icona: 'cassa', voci: ['tesoreria', 'banche'] },
            { id: 'piani', titolo: 'Piani', icona: 'andamento', voci: ['simulazioni', 'personale', 'fiscale'] },
            {
              id: 'lavoro',
              titolo: 'Lavoro',
              icona: 'lavoro',
              voci: ['documenti', 'richieste', 'attivita'],
              badge: perAzienda[company.uuid] ?? 0
            },
            { id: 'dati', titolo: 'Dati', icona: 'database', voci: ['dati', 'impostazioni-azienda'] }
          ]
        : [
            { id: 'clienti', titolo: 'Clienti', icona: 'utenti', voci: ['anagrafica'] },
            { id: 'richieste', titolo: 'Richieste', icona: 'campanello', voci: ['richieste-studio'], badge: riepilogo?.unread ?? 0 },
            { id: 'impostazioni', titolo: 'Impostazioni', icona: 'impostazioni', voci: ['impostazioni'] }
          ]
      : [
          { id: 'riepilogo', titolo: 'Riepilogo', icona: 'casa', voci: ['riepilogo'] },
          { id: 'documenti', titolo: 'Documenti', icona: 'cartella', voci: ['documenti'] },
          { id: 'richieste', titolo: 'Richieste', icona: 'messaggio', voci: ['richieste'], badge: riepilogo?.unread ?? 0 },
          { id: 'numeri', titolo: 'Numeri', icona: 'grafico', voci: VISTE_AZIENDA_ORDINE }
        ]
    return grezzi.map((g) => ({ ...g, voci: g.voci.filter(visibile) })).filter((g) => g.voci.length > 0)
  }, [consulente, company, riepilogo, visibile])

  const gruppoCorrente = gruppiTelefono.find((g) => g.voci.includes(vista)) ?? null
  // Tornando su un gruppo si riapre la sezione dove si era rimasti.
  const ultimaDelGruppo = useRef<Record<string, Vista>>({})
  useEffect(() => {
    if (gruppoCorrente) ultimaDelGruppo.current[gruppoCorrente.id] = vista
  }, [gruppoCorrente, vista])

  const schedeBasso: SchedaBasso[] = [
    ...gruppiTelefono.slice(0, 4).map((g) => ({
      id: g.id,
      titolo: g.titolo,
      icona: g.icona,
      attiva: gruppoCorrente?.id === g.id,
      badge: g.badge,
      onClick: () => {
        const ultima = ultimaDelGruppo.current[g.id]
        vai(ultima && g.voci.includes(ultima) ? ultima : g.voci[0]!)
      }
    })),
    { id: 'menu', titolo: 'Menu', icona: 'menu', attiva: menu, onClick: () => setMenu(true) }
  ]

  // --- comandi rapidi del guscio ---
  const comandi: Comando[] = []
  const inPrimoPiano = (v: Vista): boolean => vista === v

  if (company) {
    const sezioni = consulente
      ? GRUPPI_CONSULENTE.flatMap((g) => g.voci)
      : (['riepilogo', 'documenti', 'richieste', ...VISTE_AZIENDA_ORDINE] as Vista[])
    for (const v of sezioni.filter(visibile)) {
      comandi.push({
        id: `vai-${v}`,
        titolo: nomeVista(v),
        gruppo: 'Vai a',
        icona: 'destra',
        dettaglio: company.name,
        esegui: () => vai(v)
      })
    }
  }
  if (consulente) {
    comandi.push(
      { id: 'vai-anagrafica', titolo: 'Clienti e Aziende', gruppo: 'Vai a', icona: 'utenti', parole: 'anagrafica elenco', esegui: anagrafica },
      { id: 'vai-impostazioni', titolo: 'Impostazioni', gruppo: 'Vai a', icona: 'impostazioni', parole: 'moduli utenti backup', esegui: () => vai('impostazioni') }
    )
    if (moduloAttivo('richieste')) {
      comandi.push({
        id: 'vai-richieste-studio',
        titolo: 'Richieste di tutte le aziende',
        gruppo: 'Vai a',
        icona: 'campanello',
        parole: 'chiamate casella',
        esegui: () => vai('richieste-studio')
      })
    }
    const recentiUuid = new Set(recenti.map((r) => r.uuid))
    const elenco: AziendaElenco[] = aziende.length
      ? aziende
      : recenti.map((r) => ({ ...r, cliente: '' }))
    for (const a of elenco) {
      comandi.push({
        id: `azienda-${a.uuid}`,
        titolo: a.name,
        gruppo: 'Aziende',
        icona: 'azienda',
        dettaglio: [a.code, a.cliente].filter(Boolean).join(' · '),
        parole: `apri azienda ${a.cliente}`,
        inPrimoPiano: recentiUuid.has(a.uuid),
        esegui: () => apriAziendaUuid(a.uuid)
      })
    }
  }
  comandi.push({
    id: 'vai-profilo',
    titolo: 'Il mio profilo',
    gruppo: 'Vai a',
    icona: 'utente',
    parole: 'password telefono email',
    esegui: () => vai('profilo')
  })

  // Azioni rapide: quelle della schermata aperta vanno in cima.
  const azione = (id: string, titolo: string, icona: NomeIcona, v: Vista, richiesta: Parameters<typeof richiediAzione>[0], parole = ''): void => {
    if (!visibile(v)) return
    comandi.push({
      id,
      titolo,
      gruppo: 'Azioni',
      icona,
      parole,
      rapido: true,
      inPrimoPiano: inPrimoPiano(v),
      dettaglio: company && consulente ? company.name : undefined,
      esegui: () => {
        vai(v)
        richiediAzione(richiesta)
      }
    })
  }
  if (consulente && !company) {
    comandi.push(
      {
        id: 'nuova-azienda',
        titolo: 'Nuova azienda',
        gruppo: 'Azioni',
        icona: 'azienda',
        rapido: true,
        inPrimoPiano: vista === 'anagrafica',
        esegui: () => {
          anagrafica()
          richiediAzione('nuova-azienda')
        }
      },
      {
        id: 'nuovo-cliente',
        titolo: 'Nuovo cliente',
        gruppo: 'Azioni',
        icona: 'utenti',
        rapido: true,
        inPrimoPiano: vista === 'anagrafica',
        esegui: () => {
          anagrafica()
          richiediAzione('nuovo-cliente')
        }
      }
    )
  }
  if (company && consulente) {
    azione('azione-carica', 'Carica un documento', 'carica', 'documenti', 'carica-documento', 'file upload pdf excel cassetto')
    azione('azione-richiesta', "Chiedi documenti all'azienda", 'graffetta', 'richieste', 'nuova-richiesta', 'richiesta')
    azione('azione-scrivi', "Scrivi all'azienda", 'messaggio', 'richieste', 'nuova-domanda', 'messaggio domanda')
    azione('azione-ore', 'Registra ore di lavoro', 'orologio', 'attivita', 'registra-ore', 'tempo tempi')
    azione('azione-attivita', 'Nuova attività da fare', 'spunta', 'attivita', 'nuova-attivita', 'compito scadenza')
    azione('azione-persona', 'Aggiungi una persona al personale', 'utente', 'personale', 'nuova-persona', 'dipendente assunzione')
    if (visibile('attivita')) {
      const quiAcceso = timer?.company_uuid === company.uuid
      comandi.push({
        id: 'timer',
        titolo: timer ? (quiAcceso ? 'Ferma il timer' : `Ferma il timer (${timer.company_name})`) : 'Avvia il timer su questa azienda',
        gruppo: 'Azioni',
        icona: timer ? 'stop' : 'play',
        parole: 'cronometro tempo',
        rapido: true,
        dettaglio: company.name,
        esegui: () => {
          const r = timer
            ? api.post('/api/timer/stop')
            : api.post(`/api/companies/${company.uuid}/timer/start`, { task_uuid: null, description: '' })
          r.then(() => {
            avvisaTimer()
            mostraAvviso(timer ? 'Timer fermato: tempo registrato.' : `Timer avviato su ${company.name}.`)
          }).catch((err) => mostraAvviso(err instanceof Error ? err.message : 'Timer non disponibile.', 'errore'))
        }
      })
    }
  }
  if (company && !consulente) {
    if (permessiAzienda?.richiedereChiamate) azione('azione-chiamata', 'Chiedi una chiamata', 'telefono', 'richieste', 'nuova-chiamata', 'telefono consulente')
    if (permessiAzienda?.inviareDocumenti) azione('azione-manda', 'Manda documenti allo studio', 'graffetta', 'documenti', 'carica-documento', 'file upload')
    if (permessiAzienda?.scrivereMessaggi) azione('azione-domanda', 'Scrivi una domanda', 'messaggio', 'richieste', 'nuova-domanda', 'messaggio')
  }

  // Programma.
  comandi.push(
    { id: 'tema', titolo: chiaro ? 'Passa al tema scuro' : 'Passa al tema chiaro', gruppo: 'Programma', icona: chiaro ? 'luna' : 'sole', parole: 'colori tema notte giorno', esegui: cambiaTema },
    {
      id: 'menu-compatto',
      titolo: compatto ? 'Apri il menu laterale' : 'Richiudi il menu laterale a icone',
      gruppo: 'Programma',
      icona: 'barra-laterale',
      scorciatoia: 'Ctrl B',
      esegui: () => setCompatto(!compatto)
    },
    {
      id: 'pannelli-blocco',
      titolo: pannelliBloccati() ? 'Sblocca i pannelli' : 'Blocca i pannelli',
      gruppo: 'Programma',
      icona: pannelliBloccati() ? 'sbloccato' : 'lucchetto',
      parole: 'disposizione sposta ridimensiona',
      esegui: () => bloccaPannelli(!pannelliBloccati())
    },
    { id: 'esci', titolo: 'Esci', gruppo: 'Programma', icona: 'esci', parole: 'logout disconnetti', esegui: onLogout }
  )
  if (consulente) {
    comandi.push({
      id: 'backup',
      titolo: 'Fai un backup del database',
      gruppo: 'Programma',
      icona: 'database',
      parole: 'copia sicurezza salva',
      esegui: () => {
        window.daprod
          .backupDatabase()
          .then((p) => setError(null) ?? alert(`Backup creato: ${p.split(/[\\/]/).pop()}`))
          .catch((err) => setError(err instanceof Error ? err.message : 'Backup non riuscito.'))
      }
    })
  }

  const firma = [
    vista,
    company?.uuid ?? '',
    consulente,
    aziende.length,
    recenti.map((r) => r.uuid).join(','),
    timer?.entry.uuid ?? '',
    chiaro,
    compatto,
    pronte,
    JSON.stringify(permessiAzienda),
    visteAzienda.join(',')
  ].join('|')
  useRegistraComandi('guscio', comandi, firma)

  const titoloStudio = VISTE_STUDIO.includes(vista) ? nomeVista(vista) : consulente ? 'Studio' : ''

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          company={company}
          vista={vista}
          onVista={vai}
          onAnagrafica={anagrafica}
          consulente={consulente}
          moduloAttivo={moduloAttivo}
          visteAzienda={visteAzienda}
          permessiAzienda={permessiAzienda}
          novita={{ totale: riepilogo?.unread ?? 0, perAzienda: riepilogo?.per_company ?? {} }}
          version={version}
          aperta={menu}
          onChiudi={() => setMenu(false)}
          compatto={compatto}
          onCompatto={setCompatto}
          strumenti={<StrumentiTelefono onEsci={onLogout} />}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-ink-700 bg-ink-900 px-2 md:h-13 md:gap-3 md:px-4">
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="rounded-lg p-2 text-ink-300 hover:bg-ink-800 md:hidden"
              aria-label="Apri il menu"
            >
              <Icona nome="menu" className="h-5 w-5" />
            </button>
            <SceltaAzienda
              corrente={company}
              titolo={titoloStudio}
              recenti={recenti}
              novita={riepilogo?.per_company ?? {}}
              consulente={consulente}
              onApri={(uuid) => apriAziendaUuid(uuid)}
              onTutte={anagrafica}
            />
            <div className="flex flex-1 justify-end md:min-w-0 md:justify-center">
              <CercaComandi />
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-0.5 md:gap-2">
              <AzioniRapide />
              {consulente && <TimerBar onApri={(uuid) => apriAziendaUuid(uuid, 'attivita')} />}
              <Campanello onClick={() => vai(consulente ? 'richieste-studio' : 'richieste')} />
              <MenuUtente
                nome={user?.full_name ?? ''}
                ruolo={user ? ROLE_LABELS[user.role] : ''}
                chiaro={chiaro}
                onTema={cambiaTema}
                voci={[
                  { icona: 'utente', titolo: 'Il mio profilo', onClick: () => vai('profilo') },
                  ...(consulente ? [{ icona: 'impostazioni' as const, titolo: 'Impostazioni', onClick: () => vai('impostazioni') }] : []),
                  { icona: 'cerca', titolo: 'Cerca o fai qualcosa (Ctrl+K)', onClick: () => apriTavolozza() }
                ]}
                onEsci={onLogout}
              />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<p className="p-8 text-sm text-ink-400">Caricamento…</p>}>
            {error ? (
              <div className="p-4 md:p-8">
                <Alert>{error}</Alert>
              </div>
            ) : vista === 'impostazioni' && consulente ? (
              <SettingsPage />
            ) : vista === 'richieste-studio' && consulente ? (
              <div className="flex h-full flex-col overflow-hidden">
                <header className="border-b border-ink-700 px-4 py-3 md:px-8 md:py-4">
                  <h1 className="text-lg font-semibold text-ink-100">Richieste</h1>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Chiamate, domande e documenti da tutte le aziende. Le novità hanno il pallino.
                  </p>
                </header>
                <div className="min-h-0 flex-1 px-3 py-4 md:px-8">
                  <RequestsBoard companyUuid={null} selezioneIniziale={richiestaScelta} />
                </div>
              </div>
            ) : vista === 'profilo' ? (
              <SettingsPage soloProfilo />
            ) : !pronte ? (
              <p className="p-8 text-sm text-ink-400">Caricamento…</p>
            ) : company ? (
              <CompanyPage
                key={company.uuid}
                company={company}
                vista={vista}
                onVista={vai}
                canImport={consulente}
                onCompanyChanged={setCompany}
                richiestaScelta={richiestaScelta}
                schede={gruppoCorrente && gruppoCorrente.voci.length > 1 ? gruppoCorrente.voci.map(voceDi) : []}
              />
            ) : consulente ? (
              <RegistryPage onOpenCompany={(c) => apriAzienda(c)} />
            ) : (
              <p className="p-8 text-sm text-ink-400">Caricamento…</p>
            )}
            </Suspense>
          </main>
        </div>
      </div>

      {consulente && <IncomingCalls onApri={apriRichiesta} />}
      <StatusBar version={version} />
      <PulsanteRapidoTelefono />
      <BarraBasso schede={schedeBasso} />
      <TavolozzaComandi />
      <Avvisi />
    </div>
  )
}

function Root(): React.JSX.Element {
  const { ready, configured, demo, user, version, logout, motivoUscita } = useAuth()
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
    return (
      <div className="flex h-full flex-col">
        {/* Sessione scaduta o accesso disattivato: si dice perché si è qui. */}
        {motivoUscita && (
          <div className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs text-warning">
            {motivoUscita}
            {/scadut/i.test(motivoUscita) ? ' Entra di nuovo per continuare.' : ''}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {role ? (
            <LoginScreen role={role} onBack={() => setRole(null)} />
          ) : (
            <RoleGate version={version} demo={demo} onPick={setRole} />
          )}
        </div>
      </div>
    )
  }

  // Uscendo si torna alla scelta iniziale, non al login dell'ultimo ruolo usato.
  return (
    <ImpostazioniProvider key={user.uuid}>
      <InboxProvider>
        <ComandiProvider>
          <Workspace
            onLogout={() => {
              // Chi entra dopo non deve trovare i numeri di chi è uscito.
              dimentica()
              logout()
              setRole(null)
            }}
          />
        </ComandiProvider>
      </InboxProvider>
    </ImpostazioniProvider>
  )
}

const CHIAVE_STRISCIA_DEMO = 'daprodfinanza.striscia-demo-chiusa'

/**
 * Nella versione dimostrativa una striscia in alto lo dice: chi la
 * prova non deve mai scambiare la Pizzeria DaProd per dati veri.
 */
function Frame(): React.JSX.Element {
  const { demoBuild } = useAuth()
  // Sul telefono la striscia si può chiudere con la ×: lo spazio conta, e che
  // sia una demo lo dicono già le schermate d'ingresso. Sul computer resta.
  const [chiusa, setChiusa] = useState(() => {
    try {
      return localStorage.getItem(CHIAVE_STRISCIA_DEMO) === '1'
    } catch {
      return false
    }
  })
  const chiudi = (): void => {
    setChiusa(true)
    try {
      localStorage.setItem(CHIAVE_STRISCIA_DEMO, '1')
    } catch {
      // resta chiusa per questa sessione
    }
  }
  return (
    <div className="flex h-full flex-col">
      {demoBuild && (
        <div
          className={`flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1 text-[11px] text-warning md:text-xs ${
            chiusa ? 'max-md:hidden' : ''
          }`}
        >
          <p className="flex-1 text-center">
            <span className="font-semibold">Versione dimostrativa</span> — i dati sono di esempio e
            restano separati da quelli di un&apos;installazione reale.
          </p>
          <button
            type="button"
            onClick={chiudi}
            className="-my-1 shrink-0 rounded px-2 py-1 hover:bg-warning/20 md:hidden"
            aria-label="Chiudi l'avviso"
          >
            <Icona nome="chiudi" className="h-4 w-4" />
          </button>
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
