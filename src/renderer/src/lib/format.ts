/**
 * Formattazione dei numeri per l'interfaccia.
 *
 * Il motore lavora in centesimi interi e usa `null` per un valore indefinito:
 * qui si torna a euro, e `null` diventa un trattino. Mai uno zero al posto di
 * un valore che non esiste — su un bilancio sarebbe una bugia.
 */
// `useGrouping: 'always'`: in italiano i numeri di quattro cifre si scrivono
// senza separatore, ma in una colonna di bilancio "2000 €" sopra "1.050.000 €"
// sembra un errore di battitura. In un prospetto conta la coerenza.
const EURO = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' })
const EURO_DECIMALI = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always'
})

export function euro(cents: number | null | undefined, decimali = false): string {
  if (cents === null || cents === undefined) return '—'
  const value = cents / 100
  return `${decimali ? EURO_DECIMALI.format(value) : EURO.format(value)} €`
}

export function percent(value: number | null | undefined, decimali = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(decimali).replace('.', ',')}%`
}

export function times(value: number | null | undefined, decimali = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(decimali).replace('.', ',')}x`
}

export function days(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(value)} gg`
}

/** Quota sul totale, per le colonne "% sui ricavi" di §10.3. */
export function share(cents: number, totalCents: number, decimali = 1): string {
  if (!totalCents) return '—'
  return percent((cents / totalCents) * 100, decimali)
}

/** Verde se il numero è buono, rosso se no. `higherIsBetter` ribalta il giudizio. */
export function tone(value: number | null, soglia: number, higherIsBetter = true): string {
  if (value === null || !Number.isFinite(value)) return 'text-ink-400'
  const buono = higherIsBetter ? value >= soglia : value <= soglia
  return buono ? 'text-positive' : 'text-negative'
}

/**
 * Da quello che si scrive in un campo ("1.234,56", "1234.5", "1 200") a
 * centesimi interi. null se non è un numero.
 */
export function parseEuro(text: string): number | null {
  const pulito = text.replace(/[\s€]/g, '')
  if (!pulito) return null
  // All'italiana se la virgola fa da decimale, o se il punto separa le migliaia.
  const italiano = /,\d{1,2}$/.test(pulito) || /^-?\d{1,3}(\.\d{3})+(,\d*)?$/.test(pulito)
  const normalizzato = italiano ? pulito.replace(/\./g, '').replace(',', '.') : pulito.replace(/,/g, '')
  const valore = Number(normalizzato)
  return Number.isFinite(valore) ? Math.round(valore * 100) : null
}

/** Centesimi → testo modificabile in un campo, senza separatori di migliaia. */
export function euroInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')
}

/** "2026-09-16" → "16/09/2026". */
export function dataIt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** "2026-09-16" → "16 set". */
export function dataBreve(iso: string): string {
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} ${mesi[Number(m) - 1]}`
}
