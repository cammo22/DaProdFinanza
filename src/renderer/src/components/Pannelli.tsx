import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode
} from 'react'
import { Icona } from './icone'

/**
 * Schermate a pannelli liberi: ogni riquadro è un pannello indipendente su una
 * griglia a incastro, che si sposta dalla maniglia e si ridimensiona dai
 * bordi. La disposizione si salva per schermata e per larghezza di schermo.
 *
 * Come funziona la griglia:
 * - 12 colonne; in verticale righe da 10 px. Un pannello è {x, y, w, h}.
 * - **Incastro**: dopo ogni cambiamento i pannelli "cadono verso l'alto" fino
 *   al primo posto libero, così non restano buchi (compattazione verticale).
 * - Un pannello mai ridimensionato in altezza è **automatico**: la sua altezza
 *   segue il contenuto. Ridimensionato a mano, l'altezza resta quella scelta e
 *   il contenuto scorre dentro.
 * - Trascinando o ridimensionando vicino al bordo alto o basso, la pagina
 *   scorre da sola. Le posizioni si ricalcolano a ogni fotogramma dalla
 *   posizione del puntatore, quindi scorrere non fa "saltare" il pannello.
 *
 * I figli diretti diventano pannelli a tutta larghezza. Una `<Griglia>` fra i
 * figli si scioglie: i suoi figli diventano pannelli affiancati (due o tre per
 * riga). Le chiavi dei pannelli sono quelle che React assegna per posizione
 * nel codice, stabili anche quando un pannello compare solo a volte.
 *
 * Dalla 1.3.0 ogni pannello si **nasconde** o si **comprime** (resta solo il
 * titolo) dal suo angolo in alto a destra; i nascosti si rimettono dal menu
 * "Pannelli" della schermata. Nascosti e compressi valgono per la schermata,
 * su qualunque larghezza di schermo.
 */

const COLS = 12
const RIGA = 10
const GAP = 20
const MIN_W = 2
const MIN_H = 6
const BORDO_SCROLL = 70
const VELOCITA_SCROLL = 14
/** Movimento minimo (px) prima che lo scorrimento automatico possa partire. */
const AVVIO_SCROLL = 12
const PREFIX = 'daprodfinanza.pannelli.'
export const EVENTO_RIPRISTINA = 'daprod:ripristina-pannelli'
const CHIAVE_BLOCCO = 'daprodfinanza.pannelli-bloccati'
export const EVENTO_BLOCCO = 'daprod:blocco-pannelli'
const PREFIX_STATO = 'daprodfinanza.pannelli-stato.'
/** Altezza (in righe) di un pannello compresso: la sola barra del titolo. */
const H_COMPRESSO = 5

// --- nascosti e compressi, per schermata ---------------------------------------------

interface StatoPannelli {
  nascosti: string[]
  compressi: string[]
}

const VUOTO: StatoPannelli = { nascosti: [], compressi: [] }
const stati = new Map<string, StatoPannelli>()
const titoli = new Map<string, { i: string; titolo: string }[]>()
const ascoltatori = new Set<() => void>()
let versione = 0

function avvisa(): void {
  versione++
  ascoltatori.forEach((f) => f())
}

function statoDi(vista: string): StatoPannelli {
  let st = stati.get(vista)
  if (!st) {
    try {
      const v = JSON.parse(localStorage.getItem(PREFIX_STATO + vista) ?? 'null')
      st = {
        nascosti: Array.isArray(v?.nascosti) ? v.nascosti.filter((x: unknown) => typeof x === 'string') : [],
        compressi: Array.isArray(v?.compressi) ? v.compressi.filter((x: unknown) => typeof x === 'string') : []
      }
    } catch {
      st = VUOTO
    }
    stati.set(vista, st)
  }
  return st
}

function scriviStato(vista: string, st: StatoPannelli): void {
  stati.set(vista, st)
  try {
    localStorage.setItem(PREFIX_STATO + vista, JSON.stringify(st))
  } catch {
    // resta per questa sessione
  }
  avvisa()
}

function cambia(vista: string, campo: keyof StatoPannelli, i: string, acceso: boolean): void {
  const st = statoDi(vista)
  const lista = st[campo].filter((x) => x !== i)
  if (acceso) lista.push(i)
  scriviStato(vista, { ...st, [campo]: lista })
}

export const nascondiPannello = (vista: string, i: string, nascosto: boolean): void => cambia(vista, 'nascosti', i, nascosto)
export const comprimiPannello = (vista: string, i: string, compresso: boolean): void => cambia(vista, 'compressi', i, compresso)

/** Si rileggono stato e titoli quando cambiano (in qualunque componente). */
function useVersionePannelli(): number {
  return useSyncExternalStore(
    (f) => {
      ascoltatori.add(f)
      return () => ascoltatori.delete(f)
    },
    () => versione
  )
}

/** Il titolo di un pannello: quello della Card che contiene, se c'è. */
function titoloDi(nodo: ReactElement, n: number): string {
  const props = nodo.props as { title?: unknown; titolo?: unknown }
  const t = props.title ?? props.titolo
  return typeof t === 'string' && t.trim() ? t : `Pannello ${n + 1}`
}

interface Item {
  i: string
  x: number
  y: number
  w: number
  h: number
  /** Altezza che segue il contenuto (non ridimensionata a mano). */
  auto: boolean
}

type Bordo = 'e' | 'w' | 's' | 'se' | 'sw'

/** Segnaposto: i figli di una Griglia diventano pannelli affiancati. */
export function Griglia({ children }: { colonne?: 2 | 3 | 4; children: ReactNode }): React.JSX.Element {
  return <>{children}</>
}

// --- disposizione ---------------------------------------------------------------

const collide = (a: Item, b: Item): boolean =>
  a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Incastro: i pannelli fissi restano dove sono, gli altri — dall'alto in
 * basso, da sinistra a destra — salgono al primo posto libero.
 */
function compatta(items: Item[], fissi: Set<string> = new Set()): Item[] {
  const piazzati: Item[] = items.filter((it) => fissi.has(it.i)).map((it) => ({ ...it }))
  const resto = items
    .filter((it) => !fissi.has(it.i))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  for (const it of resto) {
    const c = { ...it, y: 0 }
    while (piazzati.some((p) => collide(c, p))) c.y++
    piazzati.push(c)
  }
  const ordine = new Map(items.map((it, n) => [it.i, n]))
  return piazzati.sort((a, b) => ordine.get(a.i)! - ordine.get(b.i)!)
}

/** Disposizione di partenza: in fila, andando a capo quando la riga è piena. */
function predefinita(pannelli: { i: string; w: number }[], altezze: Map<string, number>): Item[] {
  let x = 0
  let riga = 0
  const out: Item[] = []
  for (const p of pannelli) {
    if (x + p.w > COLS) {
      x = 0
      riga++
    }
    out.push({ i: p.i, x, y: riga, w: p.w, h: altezze.get(p.i) ?? 20, auto: true })
    x += p.w
    if (x >= COLS) {
      x = 0
      riga++
    }
  }
  return compatta(out)
}

/** Sotto questa larghezza (telefono) i pannelli vanno uno sotto l'altro. */
const TELEFONO = 700

function fascia(larghezza: number): string {
  if (larghezza > 0 && larghezza < TELEFONO) return 'telefono'
  return larghezza < 1100 ? 'stretto' : larghezza < 2000 ? 'standard' : 'ampio'
}

function leggi(chiave: string): Item[] | null {
  try {
    const raw = localStorage.getItem(chiave)
    const v = raw ? JSON.parse(raw) : null
    return Array.isArray(v) ? (v as Item[]).filter((it) => typeof it?.i === 'string') : null
  } catch {
    return null
  }
}

function scrivi(chiave: string, items: Item[] | null): void {
  try {
    if (items) localStorage.setItem(chiave, JSON.stringify(items))
    else localStorage.removeItem(chiave)
  } catch {
    // resta per questa sessione
  }
}

/**
 * Senza una scelta, sul telefono i pannelli partono bloccati: scorrendo col dito
 * si finiva per prendere un bordo e ridimensionare un pannello per sbaglio.
 */
export function pannelliBloccati(): boolean {
  try {
    const v = localStorage.getItem(CHIAVE_BLOCCO)
    if (v !== null) return v === '1'
  } catch {
    // niente: vale la scelta predefinita
  }
  return window.innerWidth < 768
}

/** Stato del blocco, allineato fra tutti i componenti che lo mostrano. */
function useBloccati(): boolean {
  const [bloccati, setBloccati] = useState(pannelliBloccati)
  useEffect(() => {
    const f = (e: Event): void => setBloccati(Boolean((e as CustomEvent).detail))
    window.addEventListener(EVENTO_BLOCCO, f)
    return () => window.removeEventListener(EVENTO_BLOCCO, f)
  }, [])
  return bloccati
}

/** Lucchetto sempre a portata di dito: blocca e sblocca i pannelli con un tocco. */
export function BloccoPannelli({ className = '' }: { className?: string }): React.JSX.Element {
  const bloccati = useBloccati()
  return (
    <button
      type="button"
      onClick={() => bloccaPannelli(!bloccati)}
      aria-pressed={bloccati}
      aria-label={bloccati ? 'Sblocca i pannelli' : 'Blocca i pannelli'}
      title={bloccati ? 'Pannelli bloccati: tocca per poterli spostare e ridimensionare' : 'Pannelli sbloccati: tocca per bloccarli'}
      className={`shrink-0 rounded-lg border p-1.5 text-xs ${
        bloccati ? 'border-ink-700 bg-ink-800 text-ink-300' : 'border-warning/50 bg-warning/10 text-warning'
      } ${className}`}
    >
      <Icona nome={bloccati ? 'lucchetto' : 'sbloccato'} className="h-4 w-4" />
    </button>
  )
}

export function bloccaPannelli(bloccati: boolean): void {
  try {
    localStorage.setItem(CHIAVE_BLOCCO, bloccati ? '1' : '0')
  } catch {
    // niente
  }
  window.dispatchEvent(new CustomEvent(EVENTO_BLOCCO, { detail: bloccati }))
}

function contenitoreCheScorre(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if (oy === 'auto' || oy === 'scroll') return n
  }
  return null
}

function Pallini(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 10" className="h-2.5 w-[18px]" aria-hidden="true">
      {[3, 9, 15].flatMap((x) =>
        [2.5, 7.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="currentColor" />)
      )}
    </svg>
  )
}

// --- componente -----------------------------------------------------------------

interface Operazione {
  tipo: 'sposta' | 'ridimensiona'
  i: string
  bordo?: Bordo
  inizio: Item
  /** Punto di presa dentro il pannello (px), per lo spostamento. */
  presaX: number
  presaY: number
  x0: number
  y0: number
  scroll0: number
}

export function Pannelli({ vista, children }: { vista: string; children: ReactNode }): React.JSX.Element {
  // --- pannelli dai figli ---
  const pannelli = useMemo(() => {
    const out: { i: string; w: number; nodo: ReactElement }[] = []
    for (const c of Children.toArray(children)) {
      if (!isValidElement(c)) continue
      if (c.type === Griglia) {
        const props = c.props as { colonne?: number; children?: ReactNode }
        const w = Math.floor(COLS / (props.colonne ?? 2))
        for (const g of Children.toArray(props.children)) {
          if (!isValidElement(g)) continue
          // Un riquadro "col-span" in una griglia resta largo quanto chiede.
          const cls = (g.props as { className?: unknown }).className
          const span = typeof cls === 'string' ? /col-span-(\d+|full)/.exec(cls) : null
          const largo = span ? (span[1] === 'full' ? COLS : Math.min(COLS, w * Number(span[1]))) : w
          out.push({ i: `${String(c.key)}/${String(g.key)}`, w: largo, nodo: g })
        }
      } else {
        out.push({ i: String(c.key), w: COLS, nodo: c })
      }
    }
    return out
  }, [children])

  useVersionePannelli()
  const stato = statoDi(vista)
  const compressi = new Set(stato.compressi)

  // Il menu "Pannelli" dell'intestazione elenca i pannelli di questa schermata.
  useEffect(() => {
    const elenco = pannelli.map((p, n) => ({ i: p.i, titolo: titoloDi(p.nodo, n) }))
    const prima = JSON.stringify(titoli.get(vista) ?? [])
    if (prima !== JSON.stringify(elenco)) {
      titoli.set(vista, elenco)
      avvisa()
    }
  }, [pannelli, vista])

  const griglia = useRef<HTMLDivElement>(null)
  const [larghezza, setLarghezza] = useState(0)
  const chiave = `${PREFIX}${vista}.${fascia(larghezza)}`
  // Su un telefono due pannelli affiancati sarebbero larghi un dito ciascuno.
  const telefono = larghezza > 0 && larghezza < TELEFONO
  const firmaNascosti = stato.nascosti.join('|')
  const pannelliMostrati = useMemo(
    () =>
      (telefono ? pannelli.map((p) => ({ ...p, w: COLS })) : pannelli).filter(
        (p) => !firmaNascosti.split('|').includes(p.i)
      ),
    [pannelli, telefono, firmaNascosti]
  )
  const [salvata, setSalvata] = useState<Item[] | null>(null)
  const [altezze, setAltezze] = useState<Map<string, number>>(new Map())
  const [op, setOp] = useState<Operazione | null>(null)
  const [anteprima, setAnteprima] = useState<Item[] | null>(null)
  const [puntatore, setPuntatore] = useState<{ x: number; y: number } | null>(null)
  const [bloccati, setBloccati] = useState(pannelliBloccati)
  const opRef = useRef<Operazione | null>(null)
  const pRef = useRef({ x: 0, y: 0 })
  const frame = useRef<number | null>(null)
  const scroller = useRef<HTMLElement | null>(null)

  // Larghezza della griglia: decide le colonne in pixel e la fascia di schermo.
  useLayoutEffect(() => {
    const el = griglia.current
    if (!el) return
    const ro = new ResizeObserver(() => setLarghezza(el.clientWidth))
    ro.observe(el)
    setLarghezza(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (larghezza > 0) setSalvata(leggi(chiave))
  }, [chiave, larghezza > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ripristina = (e: Event): void => {
      if ((e as CustomEvent).detail !== vista) return
      scrivi(chiave, null)
      setSalvata(null)
    }
    const blocco = (e: Event): void => setBloccati(Boolean((e as CustomEvent).detail))
    window.addEventListener(EVENTO_RIPRISTINA, ripristina)
    window.addEventListener(EVENTO_BLOCCO, blocco)
    return () => {
      window.removeEventListener(EVENTO_RIPRISTINA, ripristina)
      window.removeEventListener(EVENTO_BLOCCO, blocco)
    }
  }, [vista, chiave])

  // --- disposizione corrente ---
  const layout = useMemo(() => {
    const presenti = new Set(pannelliMostrati.map((p) => p.i))
    if (!salvata) return predefinita(pannelliMostrati, altezze)
    const noti = salvata.filter((it) => presenti.has(it.i))
    const nuovi = pannelliMostrati.filter((p) => !noti.some((it) => it.i === p.i))
    const fondo = noti.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    const aggiunti = predefinita(nuovi, altezze).map((it) => ({ ...it, y: it.y + fondo }))
    const insieme = [...noti, ...aggiunti].map((it) =>
      it.auto && altezze.has(it.i) ? { ...it, h: altezze.get(it.i)! } : it
    )
    return compatta(insieme)
  }, [pannelliMostrati, salvata, altezze])

  // Un pannello compresso occupa solo la barra del titolo (la sua altezza vera resta salvata).
  const firmaCompressi = stato.compressi.join('|')
  const layoutMostrato = useMemo(() => {
    if (!firmaCompressi) return layout
    const set = new Set(firmaCompressi.split('|'))
    return compatta(layout.map((it) => (set.has(it.i) ? { ...it, h: H_COMPRESSO, auto: false } : it)))
  }, [layout, firmaCompressi])

  const mostrato = anteprima ?? layoutMostrato

  // --- misure ---
  const colW = larghezza > 0 ? (larghezza - (COLS - 1) * GAP) / COLS : 0
  const px = (it: Item): { left: number; top: number; width: number; height: number } => ({
    left: it.x * (colW + GAP),
    top: it.y * RIGA,
    width: it.w * colW + (it.w - 1) * GAP,
    height: Math.max(0, it.h * RIGA - GAP)
  })

  // Altezze automatiche: si misura il contenuto di ogni pannello.
  const osservatori = useRef(new Map<string, ResizeObserver>())
  const misura = useCallback((i: string, el: HTMLDivElement | null) => {
    const vecchio = osservatori.current.get(i)
    if (vecchio) {
      vecchio.disconnect()
      osservatori.current.delete(i)
    }
    if (!el) return
    const ro = new ResizeObserver(() => {
      const h = Math.max(MIN_H, Math.ceil((el.offsetHeight + GAP) / RIGA))
      setAltezze((m) => (m.get(i) === h ? m : new Map(m).set(i, h)))
    })
    ro.observe(el)
    osservatori.current.set(i, ro)
  }, [])

  // --- trascinamento e ridimensionamento ---
  const calcola = useCallback((): Item[] | null => {
    const o = opRef.current
    const el = griglia.current
    if (!o || !el) return null
    const r = el.getBoundingClientRect()
    const cw = (el.clientWidth - (COLS - 1) * GAP) / COLS
    const passoX = cw + GAP
    const { x: cx, y: cy } = pRef.current
    const base = layoutMostrato.map((it) => (it.i === o.i ? { ...o.inizio } : it))
    let mosso: Item
    if (o.tipo === 'sposta') {
      const left = cx - r.left - o.presaX
      const top = cy - r.top - o.presaY
      mosso = {
        ...o.inizio,
        x: Math.min(COLS - o.inizio.w, Math.max(0, Math.round(left / passoX))),
        y: Math.max(0, Math.round(top / RIGA))
      }
    } else {
      const scrollDelta = (scroller.current?.scrollTop ?? 0) - o.scroll0
      const dx = Math.round((cx - o.x0) / passoX)
      const dy = Math.round((cy - o.y0 + scrollDelta) / RIGA)
      const b = o.bordo!
      const s = o.inizio
      mosso = { ...s }
      if (b.includes('e')) mosso.w = Math.min(COLS - s.x, Math.max(MIN_W, s.w + dx))
      if (b.includes('w')) {
        const x = Math.min(s.x + s.w - MIN_W, Math.max(0, s.x + dx))
        mosso.x = x
        mosso.w = s.w + (s.x - x)
      }
      if (b.includes('s')) {
        mosso.h = Math.max(MIN_H, s.h + dy)
        mosso.auto = false
      }
    }
    const conMosso = base.map((it) => (it.i === o.i ? mosso : it))
    return compatta(conMosso, new Set([o.i]))
  }, [layoutMostrato])

  const ciclo = useCallback(() => {
    const o = opRef.current
    if (!o) {
      frame.current = null
      return
    }
    const sc = scroller.current
    // Si scorre solo dopo un vero movimento, e mai allargando di lato: così
    // prendere un pannello vicino al bordo non fa partire la pagina da sola.
    const mossoDavvero = Math.abs(pRef.current.y - o.y0) >= AVVIO_SCROLL
    const soloLato = o.tipo === 'ridimensiona' && (o.bordo === 'e' || o.bordo === 'w')
    if (sc && mossoDavvero && !soloLato) {
      const r = sc.getBoundingClientRect()
      const y = pRef.current.y
      // Accelerazione graduale: lenta appena si entra nella fascia, piena sul bordo.
      const quota = (d: number): number => Math.min(1, Math.max(0, d / BORDO_SCROLL)) ** 2
      let passo = 0
      if (y < r.top + BORDO_SCROLL) passo = -Math.ceil(quota(r.top + BORDO_SCROLL - y) * VELOCITA_SCROLL)
      else if (y > r.bottom - BORDO_SCROLL) passo = Math.ceil(quota(y - (r.bottom - BORDO_SCROLL)) * VELOCITA_SCROLL)
      if (passo !== 0) sc.scrollTop += passo
    }
    const nuovo = calcola()
    if (nuovo) setAnteprima(nuovo)
    frame.current = requestAnimationFrame(ciclo)
  }, [calcola])

  const inizia = (e: React.PointerEvent<HTMLElement>, it: Item, tipo: Operazione['tipo'], bordo?: Bordo): void => {
    if (e.button !== 0 || bloccati) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = griglia.current!.getBoundingClientRect()
    const pos = px(it)
    scroller.current = contenitoreCheScorre(griglia.current)
    const o: Operazione = {
      tipo,
      i: it.i,
      bordo,
      inizio: { ...it },
      presaX: e.clientX - r.left - pos.left,
      presaY: e.clientY - r.top - pos.top,
      x0: e.clientX,
      y0: e.clientY,
      scroll0: scroller.current?.scrollTop ?? 0
    }
    opRef.current = o
    pRef.current = { x: e.clientX, y: e.clientY }
    setOp(o)
    setPuntatore({ x: e.clientX, y: e.clientY })
    document.body.style.cursor = tipo === 'sposta' ? 'grabbing' : getComputedStyle(e.currentTarget).cursor
    document.body.style.userSelect = 'none'
    if (frame.current === null) frame.current = requestAnimationFrame(ciclo)
  }

  const muovi = (e: React.PointerEvent<HTMLElement>): void => {
    if (!opRef.current) return
    pRef.current = { x: e.clientX, y: e.clientY }
    setPuntatore({ x: e.clientX, y: e.clientY })
  }

  const fine = (e: React.PointerEvent<HTMLElement>): void => {
    if (!opRef.current) return
    e.stopPropagation()
    const finale = calcola()
    opRef.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setOp(null)
    setAnteprima(null)
    setPuntatore(null)
    if (finale) {
      const vere = finale.map((it) => {
        if (!compressi.has(it.i)) return it
        const prima = layout.find((x) => x.i === it.i)
        return prima ? { ...it, h: prima.h, auto: prima.auto } : it
      })
      scrivi(chiave, vere)
      setSalvata(vere)
    }
  }

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      osservatori.current.forEach((ro) => ro.disconnect())
    },
    []
  )

  // Altezza della griglia: il pannello più basso, più spazio per trascinare oltre.
  const fondo = mostrato.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  const extra = op ? 40 : 0
  const altezzaGriglia = (fondo + extra) * RIGA

  const perId = new Map(pannelli.map((p) => [p.i, p]))
  // Lo schermo, non la griglia: una griglia stretta su un computer si usa ancora col mouse.
  const schermoTelefono = window.innerWidth < 768
  const rGriglia = griglia.current?.getBoundingClientRect()

  return (
    <div ref={griglia} className="relative" style={{ height: altezzaGriglia }}>
      {larghezza > 0 &&
        mostrato.map((it) => {
          const p = perId.get(it.i)
          if (!p) return null
          const pos = px(it)
          const attivo = op?.i === it.i
          const spostando = attivo && op?.tipo === 'sposta'
          // Il pannello preso segue il puntatore; al suo posto resta la sagoma.
          const libero =
            spostando && puntatore && rGriglia
              ? { left: puntatore.x - rGriglia.left - op!.presaX, top: puntatore.y - rGriglia.top - op!.presaY }
              : null
          return (
            <div key={it.i} className="contents">
              {attivo && (
                <div
                  className="pointer-events-none absolute rounded-xl border-2 border-dashed border-brand-400/80 bg-brand-500/10 shadow-[0_0_18px] shadow-brand-500/30"
                  style={pos}
                />
              )}
              <div
                data-pannello={it.i}
                className={`group/pannello absolute rounded-xl outline-2 outline-offset-2 outline-transparent transition-[outline-color] has-[[data-bordo]:hover]:outline-brand-400/60 ${
                  attivo ? 'z-40' : 'z-0 hover:z-10 focus-within:z-10'
                } ${op && !attivo ? 'transition-[left,top,width,height] duration-200 ease-out' : ''}`}
                style={{
                  left: libero ? libero.left : pos.left,
                  top: libero ? libero.top : pos.top,
                  width: pos.width,
                  height: it.auto && !attivo ? undefined : pos.height
                }}
              >
                <div
                  className={`h-full rounded-xl ${
                    spostando
                      ? 'opacity-85 shadow-2xl shadow-black/60 ring-2 ring-brand-400'
                      : attivo
                        ? 'ring-2 ring-brand-400 shadow-[0_0_24px] shadow-brand-500/40'
                        : ''
                  } ${it.auto && !attivo ? '' : 'overflow-y-auto overflow-x-hidden'}`}
                >
                  {compressi.has(it.i) ? (
                    <button
                      type="button"
                      onClick={() => comprimiPannello(vista, it.i, false)}
                      className="flex h-full w-full items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-5 text-left text-xs font-semibold uppercase tracking-wider text-ink-300 hover:border-ink-600 hover:text-ink-100"
                      title="Riapri il pannello"
                    >
                      <Icona nome="destra" className="h-3.5 w-3.5" />
                      <span className="truncate">{titoloDi(p.nodo, pannelli.indexOf(p))}</span>
                    </button>
                  ) : (
                    <div ref={(el) => misura(it.i, el)} className="[&>*]:min-h-full">
                      {p.nodo}
                    </div>
                  )}
                </div>

                {/* Comprimi e nascondi: nell'angolo, compaiono passandoci sopra (sempre, sul telefono). */}
                {!compressi.has(it.i) && !op && (
                  <div
                    className={`absolute top-2 right-2 z-20 flex gap-0.5 rounded-lg border border-ink-700 bg-ink-900/90 p-0.5 shadow-lg backdrop-blur transition-opacity ${
                      // Sul telefono si vedono coi pannelli sbloccati (modalità modifica).
                      schermoTelefono ? (bloccati ? 'hidden' : 'opacity-100') : 'opacity-0 group-hover/pannello:opacity-100 focus-within:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => comprimiPannello(vista, it.i, true)}
                      className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                      title="Comprimi: resta solo il titolo"
                      aria-label="Comprimi il pannello"
                    >
                      <Icona nome="su" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => nascondiPannello(vista, it.i, true)}
                      className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                      title="Nascondi: si rimette dal menu Pannelli"
                      aria-label="Nascondi il pannello"
                    >
                      <Icona nome="occhio-chiuso" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {!bloccati && (
                  <>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label="Sposta il pannello"
                      title="Trascina per spostare il pannello"
                      onPointerDown={(e) => inizia(e, it, 'sposta')}
                      onPointerMove={muovi}
                      onPointerUp={fine}
                      onPointerCancel={fine}
                      className={`absolute left-1/2 -top-3 z-30 flex h-5 w-10 -translate-x-1/2 touch-none select-none items-center justify-center rounded-md border transition-all ${
                        spostando
                          ? 'cursor-grabbing border-brand-400 bg-brand-500/40 text-brand-100 shadow-[0_0_12px] shadow-brand-500/60'
                          : 'cursor-grab border-ink-700/70 bg-ink-850 text-ink-400 opacity-0 group-hover/pannello:opacity-70 hover:!opacity-100 hover:scale-110 hover:border-brand-400/80 hover:bg-brand-500/25 hover:text-brand-200 hover:shadow-[0_0_10px] hover:shadow-brand-500/50'
                      }`}
                    >
                      <Pallini />
                    </span>
                    {(['e', 'w', 's', 'se', 'sw'] as Bordo[]).map((b) => (
                      <span
                        key={b}
                        data-bordo
                        aria-hidden="true"
                        title="Trascina per ridimensionare"
                        onPointerDown={(e) => inizia(e, it, 'ridimensiona', b)}
                        onPointerMove={muovi}
                        onPointerUp={fine}
                        onPointerCancel={fine}
                        className={`group/bordo absolute z-20 touch-none ${
                          b === 'e'
                            ? '-right-1.5 top-3 bottom-3 w-3 cursor-ew-resize'
                            : b === 'w'
                              ? '-left-1.5 top-3 bottom-3 w-3 cursor-ew-resize'
                              : b === 's'
                                ? '-bottom-1.5 left-3 right-3 h-3 cursor-ns-resize'
                                : b === 'se'
                                  ? '-bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize'
                                  : '-bottom-1.5 -left-1.5 h-4 w-4 cursor-nesw-resize'
                        }`}
                      >
                        <span
                          className={`pointer-events-none absolute rounded-full transition-all ${
                            attivo && op?.bordo === b
                              ? 'bg-brand-300 opacity-100 shadow-[0_0_14px] shadow-brand-400'
                              : 'bg-brand-400 opacity-0 shadow-[0_0_12px] shadow-brand-500 group-hover/bordo:opacity-90'
                          } ${
                            b === 'e' || b === 'w'
                              ? 'left-1/2 top-0 bottom-0 w-[3px] -translate-x-1/2'
                              : b === 's'
                                ? 'top-1/2 left-0 right-0 h-[3px] -translate-y-1/2'
                                : 'inset-0.5 rounded-full'
                          }`}
                        />
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })}
    </div>
  )
}

/** Menu "Pannelli" dell'intestazione: quali pannelli si vedono, ripristino, blocco. */
export function MenuPannelli({ vista }: { vista: string }): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const bloccati = useBloccati()
  useVersionePannelli()
  const elenco = titoli.get(vista) ?? []
  const stato = statoDi(vista)
  const nascosti = stato.nascosti.filter((i) => elenco.some((p) => p.i === i)).length
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aperto) return
    const chiudi = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', chiudi)
    return () => document.removeEventListener('mousedown', chiudi)
  }, [aperto])
  const voce = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-ink-200 hover:bg-brand-500/15 hover:text-ink-100'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAperto((a) => !a)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-100 hover:bg-ink-700"
        title="Quali pannelli vedere e come disporli"
        aria-expanded={aperto}
      >
        <Icona nome={bloccati ? 'lucchetto' : 'pannelli'} className="h-3.5 w-3.5" /> Pannelli
        {nascosti > 0 && (
          <span className="rounded-full bg-ink-600 px-1.5 text-[10px] leading-4 text-ink-100" title="Pannelli nascosti">
            {nascosti}
          </span>
        )}
      </button>
      {aperto && (
        <div className="compare absolute right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 py-1 text-xs shadow-2xl shadow-black/50">
          {elenco.length > 0 && (
            <>
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                Pannelli di questa schermata
              </p>
              <div className="max-h-72 overflow-y-auto">
                {elenco.map((p) => {
                  const visibile = !stato.nascosti.includes(p.i)
                  const compresso = stato.compressi.includes(p.i)
                  return (
                    <div key={p.i} className="flex items-center gap-1 pr-2 hover:bg-ink-800/60">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left"
                        onClick={() => nascondiPannello(vista, p.i, visibile)}
                        title={visibile ? 'Nascondi' : 'Mostra'}
                      >
                        <Icona
                          nome={visibile ? 'occhio' : 'occhio-chiuso'}
                          className={`h-4 w-4 ${visibile ? 'text-brand-300' : 'text-ink-500'}`}
                        />
                        <span className={`truncate ${visibile ? 'text-ink-100' : 'text-ink-500 line-through'}`}>{p.titolo}</span>
                      </button>
                      {visibile && (
                        <button
                          type="button"
                          onClick={() => comprimiPannello(vista, p.i, !compresso)}
                          className="rounded-md p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                          title={compresso ? 'Riapri' : 'Comprimi'}
                        >
                          <Icona nome={compresso ? 'giu' : 'su'} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="my-1 border-t border-ink-700" />
            </>
          )}
          <button
            type="button"
            className={voce}
            onClick={() => {
              window.dispatchEvent(new CustomEvent(EVENTO_RIPRISTINA, { detail: vista }))
              scriviStato(vista, VUOTO)
              setAperto(false)
            }}
          >
            <Icona nome="aggiorna" className="h-4 w-4 text-ink-400" />
            Ripristina la disposizione (e mostra tutto)
          </button>
          <button
            type="button"
            className={voce}
            onClick={() => {
              bloccaPannelli(!bloccati)
              setAperto(false)
            }}
          >
            <Icona nome={bloccati ? 'sbloccato' : 'lucchetto'} className="h-4 w-4 text-ink-400" />
            {bloccati ? 'Sblocca: sposta e ridimensiona' : 'Blocca (niente spostamenti per sbaglio)'}
          </button>
          <p className="border-t border-ink-700 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
            Sposta un pannello dalla maniglia in alto; ridimensionalo trascinando i bordi, che si
            illuminano. Passandoci sopra, nell'angolo, lo comprimi o lo nascondi.
          </p>
        </div>
      )}
    </div>
  )
}
