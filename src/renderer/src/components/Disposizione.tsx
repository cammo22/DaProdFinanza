import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Riquadri che si spostano, con l'ordine ricordato.
 *
 * Avvolge il contenitore di una schermata: ogni figlio diretto diventa un
 * blocco con una maniglia a pallini, sempre visibile e tenue, che si illumina
 * quando ci si passa sopra (e con lei il contorno del riquadro). Due modi:
 *
 * - **trascinare** la maniglia: gli altri riquadri si spostano mentre si
 *   trascina, e vicino al bordo alto o basso la pagina scorre da sola;
 * - **cliccare** la maniglia: un menu con In cima / Su / Giù / In fondo, per
 *   spostare con precisione senza trascinare niente.
 *
 * L'ordine si salva per schermata su questo computer, e la schermata si
 * riapre sempre così.
 *
 * Niente drag and drop del browser: con i soli eventi del puntatore il
 * riquadro segue il mouse ovunque. I blocchi si riconoscono dalla posizione
 * nel codice (la chiave che React assegna ai figli), non dall'ordine a video:
 * un riquadro che compare solo a volte non sposta gli altri.
 */

const PREFIX = 'daprodfinanza.disposizione.'
/** Distanza dal bordo (px) entro cui la pagina scorre da sola, e velocità massima. */
const BORDO = 90
const VELOCITA = 22
/** Sotto questo spostamento (px) la pressione è un clic, non un trascinamento. */
const SOGLIA_CLIC = 5

function leggi(vista: string): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + vista)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []
  } catch {
    return []
  }
}

function scrivi(vista: string, ordine: string[] | null): void {
  try {
    if (ordine) localStorage.setItem(PREFIX + vista, JSON.stringify(ordine))
    else localStorage.removeItem(PREFIX + vista)
  } catch {
    // archivio non disponibile: l'ordine vale finché la schermata resta aperta
  }
}

/** In una griglia, l'ampiezza di un riquadro (col-span) passa al suo contenitore. */
function span(b: React.ReactElement): string {
  const cls = (b.props as { className?: unknown }).className
  return typeof cls === 'string' ? (cls.match(/(?:\w+:)?col-span-\S+/g) ?? []).join(' ') : ''
}

/** Il primo antenato che scorre in verticale: è lui che va fatto scorrere. */
function contenitoreCheScorre(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return null
}

/** Maniglia: sei pallini su due righe, in orizzontale. */
function Pallini(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 10" className="h-2.5 w-[18px]" aria-hidden="true">
      {[3, 9, 15].flatMap((x) =>
        [2.5, 7.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="currentColor" />)
      )}
    </svg>
  )
}

type Presa = { key: string; ordine: string[] }

export function Disposizione({
  vista,
  className = 'flex flex-col gap-5',
  maniglia = 'lato',
  children
}: {
  /** Nome della schermata: ogni schermata ha il suo ordine. */
  vista: string
  className?: string
  /**
   * Dove sta la maniglia: a sinistra per i blocchi della pagina, sopra al
   * centro per i riquadri di una griglia, così non si sovrappone a quella
   * del blocco che li contiene.
   */
  maniglia?: 'lato' | 'sopra'
  children: ReactNode
}): React.JSX.Element {
  const [salvato, setSalvato] = useState<string[]>(() => leggi(vista))
  /** Durante il trascinamento: chi si muove e l'ordine provvisorio. */
  const [presa, setPresaState] = useState<Presa | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const presaRef = useRef<Presa | null>(null)
  const nodi = useRef(new Map<string, HTMLDivElement>())
  const puntatore = useRef({ x: 0, y: 0, x0: 0, y0: 0, mosso: false })
  const scorrimento = useRef<{ el: HTMLElement | null; frame: number | null }>({ el: null, frame: null })
  const menuRef = useRef<HTMLDivElement>(null)

  const setPresa = (p: Presa | null): void => {
    presaRef.current = p
    setPresaState(p)
  }

  const blocchi = Children.toArray(children).filter(isValidElement)
  const perChiave = new Map(blocchi.map((b) => [String(b.key), b]))
  const posizione = (key: string, i: number): number => {
    const s = salvato.indexOf(key)
    return s >= 0 ? s : salvato.length + i
  }
  const ordineSalvato = blocchi
    .map((b, i) => ({ key: String(b.key), rank: posizione(String(b.key), i) }))
    .sort((x, y) => x.rank - y.rank)
    .map((o) => o.key)
  const ordine = presa ? presa.ordine.filter((k) => perChiave.has(k)) : ordineSalvato

  const inGriglia = maniglia === 'sopra'

  const salva = (finale: string[]): void => {
    if (finale.join('|') === ordineSalvato.join('|')) return
    // Si conservano anche i blocchi non visibili ora, in coda, per non perderne il posto.
    const assenti = salvato.filter((k) => !finale.includes(k))
    const nuovo = [...finale, ...assenti]
    setSalvato(nuovo)
    scrivi(vista, nuovo)
  }

  // Il menu si chiude cliccando altrove.
  useEffect(() => {
    if (!menu) return
    const chiudi = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', chiudi)
    return () => document.removeEventListener('mousedown', chiudi)
  }, [menu])

  useEffect(() => () => {
    if (scorrimento.current.frame !== null) cancelAnimationFrame(scorrimento.current.frame)
  }, [])

  /** Riordina in base a dove sta il puntatore. */
  const riordina = (): void => {
    const p = presaRef.current
    if (!p) return
    const { x, y } = puntatore.current
    let meglio: { key: string; d: number; r: DOMRect } | null = null
    for (const key of p.ordine) {
      const el = nodi.current.get(key)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      const d = dx * dx + dy * dy
      if (!meglio || d < meglio.d) meglio = { key, d, r }
    }
    if (!meglio || meglio.key === p.key) return
    const da = p.ordine.indexOf(p.key)
    const a = p.ordine.indexOf(meglio.key)
    // Si scambia solo oltre la metà del bersaglio: niente sfarfallio avanti e indietro.
    const r = meglio.r
    const oltre = inGriglia
      ? a > da
        ? x > r.left + r.width / 2 || y > r.top + r.height / 2
        : x < r.left + r.width / 2 || y < r.top + r.height / 2
      : a > da
        ? y > r.top + r.height / 2
        : y < r.top + r.height / 2
    if (!oltre) return
    const nuovo = p.ordine.filter((k) => k !== p.key)
    nuovo.splice(a, 0, p.key)
    setPresa({ key: p.key, ordine: nuovo })
  }

  /** Vicino ai bordi la pagina scorre da sola, finché si tiene premuto. */
  const ciclo = (): void => {
    const s = scorrimento.current
    if (!presaRef.current) {
      s.frame = null
      return
    }
    const el = s.el
    if (el) {
      const r = el.getBoundingClientRect()
      const { y } = puntatore.current
      let passo = 0
      if (y < r.top + BORDO) passo = -Math.ceil(((r.top + BORDO - y) / BORDO) * VELOCITA)
      else if (y > r.bottom - BORDO) passo = Math.ceil(((y - (r.bottom - BORDO)) / BORDO) * VELOCITA)
      if (passo !== 0) {
        el.scrollTop += passo
        riordina()
      }
    }
    s.frame = requestAnimationFrame(ciclo)
  }

  const inizia = (key: string, e: React.PointerEvent<HTMLSpanElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    puntatore.current = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mosso: false }
    setMenu(null)
    setPresa({ key, ordine: ordineSalvato })
    scorrimento.current.el = contenitoreCheScorre(nodi.current.get(key) ?? null)
    if (scorrimento.current.frame === null) scorrimento.current.frame = requestAnimationFrame(ciclo)
  }

  const muovi = (e: React.PointerEvent<HTMLSpanElement>): void => {
    if (!presaRef.current) return
    const p = puntatore.current
    p.x = e.clientX
    p.y = e.clientY
    if (!p.mosso && Math.hypot(p.x - p.x0, p.y - p.y0) >= SOGLIA_CLIC) {
      p.mosso = true
      document.body.style.cursor = 'grabbing'
    }
    if (p.mosso) riordina()
  }

  const lascia = (key: string, e: React.PointerEvent<HTMLSpanElement>): void => {
    const p = presaRef.current
    if (!p) return
    e.stopPropagation()
    document.body.style.cursor = ''
    setPresa(null)
    // Pressione senza movimento: è un clic, si apre il menu.
    if (!puntatore.current.mosso) {
      setMenu((m) => (m === key ? null : key))
      return
    }
    salva(p.ordine)
  }

  const sposta = (key: string, dove: 'inizio' | 'su' | 'giu' | 'fine'): void => {
    const lista = ordineSalvato.filter((k) => k !== key)
    const i = ordineSalvato.indexOf(key)
    const nuovoIndice =
      dove === 'inizio' ? 0 : dove === 'fine' ? lista.length : dove === 'su' ? Math.max(0, i - 1) : Math.min(lista.length, i + 1)
    lista.splice(nuovoIndice, 0, key)
    salva(lista)
    setMenu(null)
    // Si accompagna il riquadro dove è andato a finire.
    requestAnimationFrame(() => nodi.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const voci: { dove: 'inizio' | 'su' | 'giu' | 'fine'; label: string }[] = inGriglia
    ? [
        { dove: 'inizio', label: '⇤ Per primo' },
        { dove: 'su', label: '← Prima' },
        { dove: 'giu', label: '→ Dopo' },
        { dove: 'fine', label: '⇥ Per ultimo' }
      ]
    : [
        { dove: 'inizio', label: '⤒ In cima' },
        { dove: 'su', label: '↑ Su' },
        { dove: 'giu', label: '↓ Giù' },
        { dove: 'fine', label: '⤓ In fondo' }
      ]

  return (
    <div className={className}>
      {ordine.map((key, indice) => {
        const b = perChiave.get(key)!
        const mosso = presa?.key === key && puntatore.current.mosso
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) nodi.current.set(key, el)
              else nodi.current.delete(key)
            }}
            className={`relative min-w-0 rounded-xl outline-2 outline-offset-4 transition-[outline-color,box-shadow,opacity] ${span(b)} ${
              mosso || menu === key
                ? 'z-10 shadow-2xl shadow-brand-500/20 outline-brand-400'
                : 'outline-transparent has-[>[data-maniglia]:hover]:outline-brand-400/60'
            } ${mosso ? 'opacity-90' : ''}`}
          >
            <span
              data-maniglia
              role="button"
              tabIndex={-1}
              aria-label="Sposta il riquadro"
              title="Trascina per spostare, oppure clicca per scegliere dove"
              onPointerDown={(e) => inizia(key, e)}
              onPointerMove={muovi}
              onPointerUp={(e) => lascia(key, e)}
              onPointerCancel={(e) => lascia(key, e)}
              className={`absolute z-20 flex touch-none select-none items-center justify-center rounded-md border transition-all ${
                mosso || menu === key
                  ? 'cursor-grabbing border-brand-400 bg-brand-500/30 text-brand-100 opacity-100 shadow-[0_0_12px] shadow-brand-500/60'
                  : 'cursor-grab border-ink-700/60 bg-ink-850 text-ink-400 opacity-60 hover:scale-110 hover:border-brand-400/80 hover:bg-brand-500/25 hover:text-brand-200 hover:opacity-100 hover:shadow-[0_0_10px] hover:shadow-brand-500/50'
              } ${inGriglia ? 'left-1/2 -top-3.5 h-5 w-9 -translate-x-1/2' : '-left-8 top-1.5 h-6 w-7'}`}
            >
              <Pallini />
            </span>
            {menu === key && (
              <div
                ref={menuRef}
                className={`absolute z-40 w-40 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 text-xs shadow-2xl ${
                  inGriglia ? 'left-1/2 top-3 -translate-x-1/2' : '-left-8 top-9'
                }`}
              >
                <p className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-ink-500">Sposta</p>
                {voci.map((v) => {
                  const spento =
                    ((v.dove === 'inizio' || v.dove === 'su') && indice === 0) ||
                    ((v.dove === 'fine' || v.dove === 'giu') && indice === ordine.length - 1)
                  return (
                    <button
                      key={v.dove}
                      type="button"
                      disabled={spento}
                      onClick={() => sposta(key, v.dove)}
                      className="block w-full px-3 py-1.5 text-left text-ink-200 hover:bg-brand-500/20 hover:text-brand-100 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
                    >
                      {v.label}
                    </button>
                  )
                })}
              </div>
            )}
            {b}
          </div>
        )
      })}
      {salvato.length > 0 && !presa && (
        <p className={`text-[11px] text-ink-500 ${inGriglia ? 'col-span-full' : ''}`}>
          Disposizione personalizzata ·{' '}
          <button
            type="button"
            className="text-brand-300 hover:underline"
            onClick={() => {
              setSalvato([])
              scrivi(vista, null)
            }}
          >
            ripristina l’ordine originale
          </button>
        </p>
      )}
    </div>
  )
}
