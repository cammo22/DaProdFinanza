/**
 * Le ultime aziende aperte, per passare dall'una all'altra senza tornare
 * all'anagrafica (menu dell'azienda in alto, Ctrl+K). Si ricordano nel
 * browser, per ogni utente: sono una comodità, non un dato.
 */

export interface AziendaRecente {
  uuid: string
  name: string
  code: string
}

const MASSIMO = 6
const chiave = (utente: string): string => `daprodfinanza.aziende-recenti.${utente}`

export function leggiRecenti(utente: string): AziendaRecente[] {
  try {
    const v = JSON.parse(localStorage.getItem(chiave(utente)) ?? '[]')
    return Array.isArray(v) ? v.filter((a) => typeof a?.uuid === 'string').slice(0, MASSIMO) : []
  } catch {
    return []
  }
}

export function segnaRecente(utente: string, azienda: AziendaRecente): AziendaRecente[] {
  const lista = [
    { uuid: azienda.uuid, name: azienda.name, code: azienda.code },
    ...leggiRecenti(utente).filter((a) => a.uuid !== azienda.uuid)
  ].slice(0, MASSIMO)
  try {
    localStorage.setItem(chiave(utente), JSON.stringify(lista))
  } catch {
    // resta per questa sessione
  }
  return lista
}
