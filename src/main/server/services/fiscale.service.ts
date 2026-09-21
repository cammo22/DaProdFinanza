import {
  flussiFiscali,
  normalizzaFiscale,
  regimeDaForma,
  scadenzeFiscali,
  stimaFiscale,
  FISCALE_PREDEFINITO,
  type DatiBilancioFiscale,
  type ImpostazioniFiscali,
  type ScadenzaFiscale,
  type StimaFiscale,
  type TreasuryItemInput
} from '@shared/engine'
import { contoEconomicoRecente } from './bilancio.service'
import { getCompany } from './companies.service'
import { leggiImpostazione, scriviImpostazione } from './settings.service'

/**
 * Area fiscale e contributi — AGENTS.md §10.17. Le impostazioni stanno nella
 * tabella `settings` (chiave `fiscale`); la stima la fa il motore condiviso,
 * che gira anche nella schermata per ricalcolare a ogni modifica.
 */

const CHIAVE = 'fiscale'

export function getFiscaleSettings(companyUuid: string): ImpostazioniFiscali {
  const company = getCompany(companyUuid)
  // Senza impostazioni salvate, il regime si indovina dalla forma giuridica.
  const base = { ...FISCALE_PREDEFINITO, regime: regimeDaForma(company.legal_form) }
  return normalizzaFiscale(leggiImpostazione('company', companyUuid, CHIAVE), base)
}

export function saveFiscaleSettings(companyUuid: string, input: unknown): ImpostazioniFiscali {
  const nuove = normalizzaFiscale(input, getFiscaleSettings(companyUuid))
  scriviImpostazione('company', companyUuid, CHIAVE, nuove)
  return nuove
}

export interface BilancioFiscale extends DatiBilancioFiscale {
  label: string
  anno: number
}

export function bilancioFiscale(companyUuid: string): BilancioFiscale | null {
  const ce = contoEconomicoRecente(companyUuid)
  if (!ce) return null
  return {
    label: ce.label,
    anno: ce.anno,
    utileAnteImposte: ce.aggregates.utileAnteImposte,
    ebit: ce.aggregates.ebit,
    ricavi: ce.aggregates.ricaviOperativi
  }
}

export function fiscaleCalcolo(
  companyUuid: string,
  today: string
): { settings: ImpostazioniFiscali; bilancio: BilancioFiscale | null; stima: StimaFiscale | null; scadenze: ScadenzaFiscale[] } {
  const settings = getFiscaleSettings(companyUuid)
  const bilancio = bilancioFiscale(companyUuid)
  // Senza bilancio si può comunque stimare, se il reddito è scritto a mano.
  if (!bilancio && settings.redditoManualeCents === null) return { settings, bilancio, stima: null, scadenze: [] }
  const stima = stimaFiscale(bilancio ?? { utileAnteImposte: 0, ebit: settings.redditoManualeCents ?? 0, ricavi: 0 }, settings)
  return { settings, bilancio, stima, scadenze: scadenzeFiscali(stima, settings, today) }
}

/** Le scadenze fiscali nella previsione di tesoreria, se l'azienda le ha accese. */
export function fiscaleTreasuryItemsFor(companyUuid: string, today: string): TreasuryItemInput[] {
  const { settings, scadenze } = fiscaleCalcolo(companyUuid, today)
  return settings.inTesoreria ? flussiFiscali(scadenze) : []
}
