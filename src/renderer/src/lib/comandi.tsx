import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { NomeIcona } from '../components/icone'

/**
 * Comandi rapidi (versione 1.3.0): tutto quello che si può fare, cercabile da
 * qualsiasi schermata con Ctrl+K e, per le azioni più usate, a un clic dal
 * pulsante "Nuovo" (sul telefono, il tondo in basso a destra).
 *
 * Chi sa fare qualcosa lo dichiara: il guscio registra la navigazione e le
 * aziende, ogni schermata le sue azioni (`useRegistraComandi`). Una azione che
 * vive in una schermata non ancora aperta si chiede con `richiediAzione`: la
 * schermata, appena montata, la raccoglie con `useAzione` — così "Carica un
 * documento" dal telefono apre il cassetto e subito la finestra di caricamento.
 */

export type GruppoComando = 'Azioni' | 'Vai a' | 'Aziende' | 'Programma'

export interface Comando {
  id: string
  titolo: string
  gruppo: GruppoComando
  icona?: NomeIcona
  /** Altre parole con cui trovarlo ("f24", "upload"…). */
  parole?: string
  /** Riga sotto il titolo (es. il codice dell'azienda). */
  dettaglio?: string
  /** Scorciatoia da mostrare accanto (non la registra: la gestisce chi la dichiara). */
  scorciatoia?: string
  /** Compare fra le azioni rapide del pulsante "Nuovo". */
  rapido?: boolean
  /** Prima degli altri fra le azioni rapide (quelle della schermata aperta). */
  inPrimoPiano?: boolean
  esegui: () => void
}

interface Contesto {
  comandi: Comando[]
  registra: (sorgente: string, comandi: Comando[]) => void
  togli: (sorgente: string) => void
  tavolozza: { aperta: boolean; testo: string }
  apriTavolozza: (testo?: string) => void
  chiudiTavolozza: () => void
}

const ComandiContext = createContext<Contesto | null>(null)

export function ComandiProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [sorgenti, setSorgenti] = useState<Map<string, Comando[]>>(new Map())
  const [tavolozza, setTavolozza] = useState({ aperta: false, testo: '' })

  const registra = useCallback((sorgente: string, comandi: Comando[]) => {
    setSorgenti((m) => new Map(m).set(sorgente, comandi))
  }, [])
  const togli = useCallback((sorgente: string) => {
    setSorgenti((m) => {
      if (!m.has(sorgente)) return m
      const n = new Map(m)
      n.delete(sorgente)
      return n
    })
  }, [])

  const comandi = useMemo(() => {
    // A parità di id vince l'ultima sorgente registrata (la schermata sul guscio).
    const perId = new Map<string, Comando>()
    for (const lista of sorgenti.values()) for (const c of lista) perId.set(c.id, c)
    return [...perId.values()]
  }, [sorgenti])

  const apriTavolozza = useCallback((testo = '') => setTavolozza({ aperta: true, testo }), [])
  const chiudiTavolozza = useCallback(() => setTavolozza({ aperta: false, testo: '' }), [])

  const valore = useMemo(
    () => ({ comandi, registra, togli, tavolozza, apriTavolozza, chiudiTavolozza }),
    [comandi, registra, togli, tavolozza, apriTavolozza, chiudiTavolozza]
  )
  return <ComandiContext.Provider value={valore}>{children}</ComandiContext.Provider>
}

export function useComandi(): Contesto {
  const c = useContext(ComandiContext)
  if (!c) throw new Error('useComandi fuori da ComandiProvider')
  return c
}

/**
 * Dichiara i comandi di chi chiama, finché resta montato. `firma` dice quando
 * rigenerarli (le funzioni cambiano a ogni render: non si confrontano quelle).
 */
export function useRegistraComandi(sorgente: string, comandi: Comando[], firma: string): void {
  const { registra, togli } = useComandi()
  const ultimi = useRef(comandi)
  ultimi.current = comandi
  useEffect(() => {
    // Le azioni chiamano sempre la versione più recente delle funzioni.
    registra(
      sorgente,
      ultimi.current.map((c, i) => ({ ...c, esegui: () => ultimi.current[i]?.esegui() }))
    )
  }, [sorgente, firma, registra])
  useEffect(() => () => togli(sorgente), [sorgente, togli])
}

// --- azioni chieste a una schermata --------------------------------------------------

const EVENTO_AZIONE = 'daprod:azione-comando'
/** Un'azione chiesta vale per pochi secondi: se la schermata non arriva, si lascia perdere. */
const VALIDITA_MS = 6000
const inAttesa = new Map<string, number>()

export type AzioneSchermata =
  | 'carica-documento'
  | 'nuova-richiesta'
  | 'nuova-chiamata'
  | 'nuova-domanda'
  | 'registra-ore'
  | 'nuova-attivita'
  | 'nuova-azienda'
  | 'nuovo-cliente'

export function richiediAzione(nome: AzioneSchermata): void {
  inAttesa.set(nome, Date.now())
  // Rimandato di un giro: la schermata può montarsi proprio adesso.
  setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTO_AZIONE, { detail: nome })), 0)
}

/** La schermata raccoglie un'azione chiesta prima che si aprisse, o mentre è aperta. */
export function useAzione(nome: AzioneSchermata, esegui: () => void, attiva = true): void {
  const ref = useRef(esegui)
  ref.current = esegui
  useEffect(() => {
    if (!attiva) return
    const prova = (): void => {
      const quando = inAttesa.get(nome)
      if (quando === undefined) return
      inAttesa.delete(nome)
      if (Date.now() - quando <= VALIDITA_MS) ref.current()
    }
    prova()
    const f = (e: Event): void => {
      if ((e as CustomEvent).detail === nome) prova()
    }
    window.addEventListener(EVENTO_AZIONE, f)
    return () => window.removeEventListener(EVENTO_AZIONE, f)
  }, [nome, attiva])
}

// --- ricerca -------------------------------------------------------------------------

/** Minuscole e senza accenti: "attività" si trova scrivendo "attivita". */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Quanto un comando somiglia a quello che si è scritto: 0 = per niente. Tutte
 * le parole scritte devono comparire; vale di più se il titolo comincia così.
 */
export function punteggio(c: Comando, testo: string): number {
  const q = normalizza(testo).trim()
  if (!q) return 1
  const titolo = normalizza(c.titolo)
  const tutto = `${titolo} ${normalizza(c.parole ?? '')} ${normalizza(c.dettaglio ?? '')} ${normalizza(c.gruppo)}`
  const parole = q.split(/\s+/)
  if (!parole.every((p) => tutto.includes(p))) return 0
  let s = 1
  if (titolo.startsWith(q)) s += 10
  else if (titolo.includes(q)) s += 5
  if (parole.every((p) => titolo.split(/\s+/).some((w) => w.startsWith(p)))) s += 3
  return s
}
