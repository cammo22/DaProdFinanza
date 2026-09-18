/**
 * Elementi grafici dei cruscotti: barre a segmenti, barre con soglia, strisce
 * di indicatori. L'idea viene dalle dashboard di Ever Gauzy; il codice è nostro.
 */

/** Barra a segmenti: `quota` fra 0 e 1, riempie i pallini da sinistra. */
export function Segmenti({ quota, colore = 'bg-positive', n = 14 }: { quota: number; colore?: string; n?: number }): React.JSX.Element {
  const pieni = Math.round(Math.max(0, Math.min(1, quota)) * n)
  return (
    <div className="mt-3 flex gap-1" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < pieni ? colore : 'bg-ink-700'}`} />
      ))}
    </div>
  )
}

/** Barra continua con un segno per la soglia. */
export function Barra({
  quota,
  colore = 'bg-brand-500',
  soglia
}: {
  quota: number
  colore?: string
  /** Posizione della soglia fra 0 e 1. */
  soglia?: number
}): React.JSX.Element {
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-ink-700" aria-hidden="true">
      <div
        className={`h-full rounded-full ${colore}`}
        style={{ width: `${Math.max(0, Math.min(1, quota)) * 100}%` }}
      />
      {soglia !== undefined && (
        <span
          className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink-200"
          style={{ left: `${Math.max(0, Math.min(1, soglia)) * 100}%` }}
        />
      )}
    </div>
  )
}


/** Un indicatore della striscia: etichetta, numero grande, barra, riga sotto. */
export interface Indicatore {
  label: string
  valore: string
  sotto?: string
  /** 0-1: riempimento della barra; null = nessuna barra. */
  quota?: number | null
  /** 'segmenti' (pallini) o 'barra' (continua, con soglia opzionale). */
  stile?: 'segmenti' | 'barra'
  soglia?: number
  colore?: string
}

/** Striscia di indicatori in una sola card, separati da linee verticali. */
export function StrisciaIndicatori({ indicatori }: { indicatori: Indicatore[] }): React.JSX.Element {
  const colonne = indicatori.length >= 4 ? 'lg:grid-cols-4' : indicatori.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
  return (
    <section className={`grid grid-cols-2 rounded-xl border border-ink-700 bg-ink-850 lg:divide-x lg:divide-ink-700 ${colonne}`}>
      {indicatori.map((k) => (
        <div key={k.label} className="px-5 py-4">
          <p className="text-xs text-ink-300">{k.label}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-ink-100 tabular-nums">{k.valore}</p>
          {k.quota !== undefined && k.quota !== null &&
            (k.stile === 'barra' ? (
              <Barra quota={k.quota} soglia={k.soglia} colore={k.colore} />
            ) : (
              <Segmenti quota={k.quota} colore={k.colore} />
            ))}
          {k.sotto && <p className="mt-1.5 text-[11px] text-ink-400">{k.sotto}</p>}
        </div>
      ))}
    </section>
  )
}
