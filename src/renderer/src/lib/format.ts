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
