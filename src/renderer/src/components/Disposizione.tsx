import { Children, isValidElement, useRef, useState, type ReactNode } from 'react'

/**
 * Riquadri che si spostano trascinandoli, con l'ordine ricordato.
 *
 * Avvolge il contenitore di una schermata: ogni figlio diretto diventa un
 * blocco con una maniglia a pallini, sempre visibile e tenue, che si illumina
 * quando ci si passa sopra (e con lei il contorno del riquadro). Si prende la
 * maniglia e si trascina: gli altri riquadri si spostano **mentre** si
 * trascina, così si vede subito dove si finisce. Lasciando, l'ordine si salva
 * per schermata su questo computer, e la schermata si riapre sempre così.
 *
 * Niente drag and drop del browser: con i soli eventi del puntatore il
 * riquadro segue il mouse ovunque, anche fuori dalle zone "giuste".
 *
 * I blocchi si riconoscono dalla posizione nel codice (la chiave che React
 * assegna ai figli), non dall'ordine a video: un riquadro che compare solo a
 * volte non sposta gli altri.
 */

const PREFIX = 'daprodfinanza.disposizione.'

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
  const [presa, setPresa] = useState<{ key: string; ordine: string[] } | null>(null)
  const nodi = useRef(new Map<string, HTMLDivElement>())

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

  const inizia = (key: string, e: React.PointerEvent<HTMLSpanElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setPresa({ key, ordine: ordineSalvato })
    document.body.style.cursor = 'grabbing'
  }

  const muovi = (e: React.PointerEvent<HTMLSpanElement>): void => {
    if (!presa) return
    const { clientX: x, clientY: y } = e
    // Il riquadro sotto il puntatore; se nessuno, il più vicino.
    let meglio: { key: string; d: number; r: DOMRect } | null = null
    for (const key of presa.ordine) {
      const el = nodi.current.get(key)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      const d = dx * dx + dy * dy
      if (!meglio || d < meglio.d) meglio = { key, d, r }
    }
    if (!meglio || meglio.key === presa.key) return
    const da = presa.ordine.indexOf(presa.key)
    const a = presa.ordine.indexOf(meglio.key)
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
    const nuovo = presa.ordine.filter((k) => k !== presa.key)
    nuovo.splice(a, 0, presa.key)
    setPresa({ key: presa.key, ordine: nuovo })
  }

  const lascia = (e: React.PointerEvent<HTMLSpanElement>): void => {
    if (!presa) return
    e.stopPropagation()
    document.body.style.cursor = ''
    const finale = presa.ordine
    setPresa(null)
    if (finale.join('|') === ordineSalvato.join('|')) return
    // Si conservano anche i blocchi non visibili ora, in coda, per non perderne il posto.
    const assenti = salvato.filter((k) => !finale.includes(k))
    const nuovo = [...finale, ...assenti]
    setSalvato(nuovo)
    scrivi(vista, nuovo)
  }

  return (
    <div className={className}>
      {ordine.map((key) => {
        const b = perChiave.get(key)!
        const mosso = presa?.key === key
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) nodi.current.set(key, el)
              else nodi.current.delete(key)
            }}
            className={`relative min-w-0 rounded-xl outline-2 outline-offset-4 transition-[outline-color,box-shadow,opacity] ${span(b)} ${
              mosso
                ? 'z-10 opacity-90 shadow-2xl shadow-brand-500/20 outline-brand-400'
                : 'outline-transparent has-[>[data-maniglia]:hover]:outline-brand-400/60'
            }`}
          >
            <span
              data-maniglia
              role="button"
              tabIndex={-1}
              aria-label="Trascina per spostare"
              title="Trascina per spostare questo riquadro"
              onPointerDown={(e) => inizia(key, e)}
              onPointerMove={muovi}
              onPointerUp={lascia}
              onPointerCancel={lascia}
              className={`absolute z-20 flex touch-none select-none items-center justify-center rounded-md border transition-all ${
                mosso
                  ? 'cursor-grabbing border-brand-400 bg-brand-500/30 text-brand-100 opacity-100 shadow-[0_0_12px] shadow-brand-500/60'
                  : 'cursor-grab border-ink-700/60 bg-ink-850 text-ink-400 opacity-60 hover:scale-110 hover:border-brand-400/80 hover:bg-brand-500/25 hover:text-brand-200 hover:opacity-100 hover:shadow-[0_0_10px] hover:shadow-brand-500/50'
              } ${inGriglia ? 'left-1/2 -top-3.5 h-5 w-9 -translate-x-1/2' : '-left-8 top-1.5 h-6 w-7'}`}
            >
              <Pallini />
            </span>
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
