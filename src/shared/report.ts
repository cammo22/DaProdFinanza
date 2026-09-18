import type { Scheme } from './engine'
import type { Scenario } from './types'

/** Cosa mettere nel report PDF: passa dalla finestra principale a quella nascosta. */
export interface ReportParams {
  companyUuid: string
  companyName: string
  companyCode: string
  periodUuid: string
  periodLabel: string
  scenario: Scenario
  scheme: Scheme
  /** Sessione di chi esporta: il report legge i dati con i suoi stessi permessi. */
  token: string
}
