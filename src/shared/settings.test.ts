import { describe, expect, it } from 'vitest'
import {
  appPredefinite,
  normalizzaApp,
  normalizzaPortale,
  normalizzaUtente,
  permessiAzienda,
  portalePredefinito,
  visteAzienda
} from './settings'

describe('impostazioni', () => {
  it('un valore mancante o rovinato torna al predefinito', () => {
    expect(normalizzaApp(undefined)).toEqual(appPredefinite())
    expect(normalizzaApp('non è un oggetto')).toEqual(appPredefinite())
    const rotto = normalizzaApp({ backupDaTenere: 'tanti', aggiornamentiAutomatici: 'sì', moduli: { personale: 1 } })
    expect(rotto.backupDaTenere).toBe(14)
    expect(rotto.aggiornamentiAutomatici).toBe(true)
    expect(rotto.moduli.personale).toBe(true)
  })

  it('una modifica parziale tocca solo quello che contiene', () => {
    const base = normalizzaApp({ moduli: { attivita: false }, backupDaTenere: 30 })
    const dopo = normalizzaApp({ aggiornamentiAutomatici: false }, base)
    expect(dopo.moduli.attivita).toBe(false)
    expect(dopo.backupDaTenere).toBe(30)
    expect(dopo.aggiornamentiAutomatici).toBe(false)
  })

  it('le copie di backup restano fra i limiti', () => {
    expect(normalizzaApp({ backupDaTenere: 1 }).backupDaTenere).toBe(3)
    expect(normalizzaApp({ backupDaTenere: 500 }).backupDaTenere).toBe(60)
  })

  it('il tema accetta solo i tre valori previsti', () => {
    expect(normalizzaUtente({ tema: 'chiaro' }).tema).toBe('chiaro')
    expect(normalizzaUtente({ tema: 'fucsia' }).tema).toBe('scuro')
    expect(normalizzaUtente({ accento: 'viola' }).accento).toBe('viola')
    expect(normalizzaUtente({ accento: 'fucsia' }).accento).toBe('blu')
  })

  it("di partenza l'azienda vede i numeri principali, non tutto il gestionale", () => {
    const viste = visteAzienda(portalePredefinito(), appPredefinite())
    expect(viste).toEqual(['panoramica', 'conto-economico', 'tesoreria', 'fiscale', 'marginalita'])
  })

  it('un modulo spento sparisce anche per le aziende che lo avevano acceso', () => {
    const portale = normalizzaPortale({ viste: { personale: true, simulazioni: true } })
    const app = normalizzaApp({ moduli: { personale: false } })
    const viste = visteAzienda(portale, app)
    expect(viste).toContain('simulazioni')
    expect(viste).not.toContain('personale')
  })

  it('i permessi seguono i moduli: senza Richieste non si chiedono chiamate', () => {
    const app = normalizzaApp({ moduli: { richieste: false } })
    const p = permessiAzienda(portalePredefinito(), app)
    expect(p.richiedereChiamate).toBe(false)
    expect(p.scrivereMessaggi).toBe(false)
    expect(p.inviareDocumenti).toBe(true)
  })
})
