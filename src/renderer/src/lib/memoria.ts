/**
 * Memoria breve dei dati già letti (versione 1.3.0): tornando su una sezione o
 * su un'azienda appena vista, i numeri compaiono subito e intanto si
 * aggiornano. Vive finché resta aperta la finestra; all'uscita si svuota.
 */

const memoria = new Map<string, unknown>()
const MASSIMO = 80

export function ricorda<T>(chiave: string, dati: T): T {
  memoria.delete(chiave)
  memoria.set(chiave, dati)
  // Le più vecchie se ne vanno: è una comodità, non un archivio.
  while (memoria.size > MASSIMO) memoria.delete(memoria.keys().next().value as string)
  return dati
}

export function ricordato<T>(chiave: string): T | null {
  return memoria.has(chiave) ? (memoria.get(chiave) as T) : null
}

export function dimentica(): void {
  memoria.clear()
}
