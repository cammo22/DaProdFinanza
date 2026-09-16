import {
  balanceSheet,
  DEFAULT_SCHEME,
  incomeStatement,
  movingAverage,
  periodDays,
  ratios,
  snapshot,
  workingCapitalNotes,
  type WorkingCapitalSnapshot
} from '@shared/engine'
import type { WorkingCapitalPoint, WorkingCapitalView } from '@shared/analysis'
import type { FiscalPeriod, Scenario } from '@shared/types'
import { engineAccounts, findPeriod, getPeriod, listPeriods } from './analysis.service'
import { agingFor } from './treasury.service'

/**
 * Vista Capitale Circolante — AGENTS.md §10.5.
 *
 * Tutto quello che mostra è già nel motore: qui si scelgono i periodi da
 * confrontare e si mette in fila la storia.
 */

function snapshotOf(
  companyUuid: string,
  period: FiscalPeriod,
  scenario: Scenario
): WorkingCapitalSnapshot | null {
  const accounts = engineAccounts(companyUuid, period.uuid, scenario)
  if (accounts.length === 0) return null
  const income = incomeStatement(accounts, DEFAULT_SCHEME).aggregates
  const balance = balanceSheet(accounts)
  const r = ratios({ accounts, income, balance, days: periodDays(period.year, period.month) })
  return snapshot(balance, r)
}

export function workingCapitalView(
  companyUuid: string,
  periodUuid: string,
  options: { scenario?: Scenario } = {}
): WorkingCapitalView {
  const scenario = options.scenario ?? 'actual'
  const period = getPeriod(companyUuid, periodUuid)
  const periods = listPeriods(companyUuid)

  const current = snapshotOf(companyUuid, period, scenario) ?? {
    creditiCommerciali: 0,
    magazzino: 0,
    altriCrediti: 0,
    debitiFornitori: 0,
    altriDebitiCorrenti: 0,
    capitaleCircolanteNetto: 0,
    dso: null,
    dio: null,
    dpo: null,
    ccc: null
  }

  // Stesso periodo dell'anno prima, a consuntivo — come nel conto economico.
  const annoPrima = findPeriod(periods, period.year - 1, period.month)
  const previousYearSnapshot = annoPrima ? snapshotOf(companyUuid, annoPrima, 'actual') : null

  // Fine dell'anno precedente: dicembre se c'è, altrimenti il bilancio annuale.
  const fineAnno =
    findPeriod(periods, period.year - 1, 12) ?? findPeriod(periods, period.year - 1, null)
  const previousYearEndSnapshot = fineAnno ? snapshotOf(companyUuid, fineAnno, 'actual') : null

  // Storia: solo mesi, fino al periodo scelto, al massimo 24.
  const mesi = periods
    .filter(
      (p) =>
        p.period_type === 'month' &&
        p.scenarios?.includes(scenario) &&
        p.year * 100 + (p.month ?? 0) <= period.year * 100 + (period.month ?? 12)
    )
    .slice(0, 24)
    .reverse()

  const punti = mesi
    .map((p) => ({ p, s: snapshotOf(companyUuid, p, scenario) }))
    .filter((x): x is { p: FiscalPeriod; s: WorkingCapitalSnapshot } => x.s !== null)
  // La media mobile si calcola su mesi consecutivi: se ne manca uno, i mesi
  // che lo scavalcherebbero restano senza media invece di mescolare periodi
  // lontani.
  const indice = (p: FiscalPeriod): number => p.year * 12 + (p.month ?? 1) - 1
  const primo = punti.length > 0 ? indice(punti[0]!.p) : 0
  const continua: (number | null)[] = []
  for (const { p, s } of punti) continua[indice(p) - primo] = s.ccc
  const medieContinue = movingAverage(Array.from(continua, (v) => v ?? null), 3)
  const medie = punti.map(({ p }) => medieContinue[indice(p) - primo] ?? null)

  const series: WorkingCapitalPoint[] = punti.map(({ p, s }, i) => ({
    period_uuid: p.uuid,
    label: p.label,
    dso: s.dso,
    dio: s.dio,
    dpo: s.dpo,
    ccc: s.ccc,
    cccMedia: medie[i] ?? null,
    ccn: s.capitaleCircolanteNetto
  }))

  const aging = agingFor(companyUuid)

  return {
    period,
    scenario,
    current,
    previousYear:
      annoPrima && previousYearSnapshot
        ? { label: annoPrima.label, snapshot: previousYearSnapshot }
        : null,
    previousYearEnd:
      fineAnno && previousYearEndSnapshot
        ? { label: fineAnno.label, snapshot: previousYearEndSnapshot }
        : null,
    series,
    notes: workingCapitalNotes({
      current,
      previousYear: previousYearSnapshot,
      receivablesOpenCents: aging.openCents,
      receivablesOverdue60Cents: aging.overdueCents
    }),
    aging
  }
}
