import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

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

function fascia(larghezza: number): string {
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

export function pannelliBloccati(): boolean {
  try {
    return localStorage.getItem(CHIAVE_BLOCCO) === '1'
  } catch {
    return false
  }
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

  const griglia = useRef<HTMLDivElement>(null)
  const [larghezza, setLarghezza] = useState(0)
  const chiave = `${PREFIX}${vista}.${fascia(larghezza)}`
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
    const presenti = new Set(pannelli.map((p) => p.i))
    if (!salvata) return predefinita(pannelli, altezze)
    const noti = salvata.filter((it) => presenti.has(it.i))
    const nuovi = pannelli.filter((p) => !noti.some((it) => it.i === p.i))
    const fondo = noti.reduce((m, it) => Math.max(m, it.y + it.h), 0)
    const aggiunti = predefinita(nuovi, altezze).map((it) => ({ ...it, y: it.y + fondo }))
    const insieme = [...noti, ...aggiunti].map((it) =>
      it.auto && altezze.has(it.i) ? { ...it, h: altezze.get(it.i)! } : it
    )
    return compatta(insieme)
  }, [pannelli, salvata, altezze])

  const mostrato = anteprima ?? layout

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
    const base = layout.map((it) => (it.i === o.i ? { ...o.inizio } : it))
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
  }, [layout])

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
      scrivi(chiave, finale)
      setSalvata(finale)
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
                className={`group/pannello absolute ${
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
                    spostando ? 'opacity-85 shadow-2xl shadow-black/60 ring-2 ring-brand-400' : ''
                  } ${it.auto && !attivo ? '' : 'overflow-y-auto overflow-x-hidden'}`}
                >
                  <div ref={(el) => misura(it.i, el)} className="[&>*]:min-h-full">
                    {p.nodo}
                  </div>
                </div>

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

/** Menu "Pannelli" dell'intestazione: ripristina la disposizione, blocca i pannelli. */
export function MenuPannelli({ vista }: { vista: string }): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const [bloccati, setBloccati] = useState(pannelliBloccati)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aperto) return
    const chiudi = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', chiudi)
    return () => document.removeEventListener('mousedown', chiudi)
  }, [aperto])
  const voce = 'block w-full px-3 py-2 text-left text-ink-200 hover:bg-brand-500/20 hover:text-brand-100'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAperto((a) => !a)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-100 hover:bg-ink-700"
        title="Disposizione dei pannelli di questa schermata"
      >
        {bloccati ? '🔒' : '▦'} Pannelli
      </button>
      {aperto && (
        <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 text-xs shadow-2xl">
          <button
            type="button"
            className={voce}
            onClick={() => {
              window.dispatchEvent(new CustomEvent(EVENTO_RIPRISTINA, { detail: vista }))
              setAperto(false)
            }}
          >
            Ripristina la disposizione di questa schermata
          </button>
          <button
            type="button"
            className={voce}
            onClick={() => {
              bloccaPannelli(!bloccati)
              setBloccati(!bloccati)
              setAperto(false)
            }}
          >
            {bloccati ? 'Sblocca i pannelli' : 'Blocca i pannelli (niente spostamenti per sbaglio)'}
          </button>
          <p className="border-t border-ink-700 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
            Sposta un pannello dalla maniglia in alto; ridimensionalo trascinando i bordi, che si
            illuminano. La disposizione si ricorda per ogni schermata.
          </p>
        </div>
      )}
    </div>
  )
}
