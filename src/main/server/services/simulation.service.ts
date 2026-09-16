import ExcelJS from 'exceljs'
import { writeFile } from 'node:fs/promises'
import {
  cashToday,
  impactRows,
  INCOME_SECTIONS,
  PARAMETRI_ZERO,
  simulate,
  type EngineAccount,
  type SimulationBase,
  type SimulationParams
} from '@shared/engine'
import type { Scenario, SimulationScenario } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { engineAccounts, getPeriod, listPeriods } from './analysis.service'
import { listLoans } from './banks.service'
import { getCompany } from './companies.service'
import { listItems, openingCash, todayLocal } from './treasury.service'

/**
 * Analisi & Simulazioni — AGENTS.md §10.8.
 *
 * Il server prepara la base (12 mesi, stato patrimoniale, liquidità di oggi,
 * finanziamenti); lo scenario lo calcola il motore condiviso, che gira anche
 * nella schermata per rispondere subito a ogni variazione.
 */

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

/** Somma i saldi di più periodi, conto per conto. */
function sommaConti(liste: EngineAccount[][]): EngineAccount[] {
  const perCodice = new Map<string, EngineAccount>()
  for (const lista of liste) {
    for (const a of lista) {
      const c = perCodice.get(a.code)
      if (c) c.amount_cents += a.amount_cents
      else perCodice.set(a.code, { ...a })
    }
  }
  return [...perCodice.values()]
}

export function simulationBase(
  companyUuid: string,
  periodUuid: string,
  scenario: Scenario = 'actual',
  today = todayLocal()
): SimulationBase {
  getCompany(companyUuid)
  const period = getPeriod(companyUuid, periodUuid)
  const tutti = engineAccounts(companyUuid, periodUuid, scenario)
  if (tutti.length === 0) {
    throw new HttpError(422, `${period.label} non ha saldi per lo scenario scelto.`)
  }
  const isIncome = (a: EngineAccount): boolean => INCOME_SECTIONS.includes(a.section_code)

  let incomeAccounts: EngineAccount[]
  let label: string
  if (period.month === null) {
    incomeAccounts = tutti.filter(isIncome)
    label = `Anno ${period.year}`
  } else {
    // Gli ultimi 12 mesi che terminano col periodo scelto: servono tutti.
    const periodi = listPeriods(companyUuid)
    const liste: EngineAccount[][] = []
    const mancanti: string[] = []
    for (let i = 11; i >= 0; i--) {
      const indice = period.year * 12 + (period.month - 1) - i
      const anno = Math.floor(indice / 12)
      const mese = (indice % 12) + 1
      const p = periodi.find((x) => x.period_type === 'month' && x.year === anno && x.month === mese)
      const conti = p ? engineAccounts(companyUuid, p.uuid, scenario).filter(isIncome) : []
      if (conti.length === 0) mancanti.push(`${MESI[mese - 1]} ${anno}`)
      liste.push(conti)
    }
    if (mancanti.length > 0) {
      throw new HttpError(
        422,
        `La simulazione ragiona su un anno: servono i 12 mesi che terminano con ${period.label}, ` +
          `ne mancano ${mancanti.length} (${mancanti.slice(0, 3).join(', ')}${mancanti.length > 3 ? '…' : ''}). ` +
          'Scegli un altro mese o un bilancio annuale.'
      )
    }
    incomeAccounts = sommaConti(liste)
    label = `12 mesi fino a ${period.label}`
  }

  return {
    label,
    incomeAccounts,
    balanceAccounts: tutti.filter((a) => !isIncome(a)),
    liquiditaOggi: cashToday(openingCash(companyUuid, today), listItems(companyUuid), today),
    loans: listLoans(companyUuid),
    today
  }
}

// --- scenari salvati -----------------------------------------------------------

/** Tiene solo i parametri noti, con i tipi giusti: il JSON arriva dal client. */
export function cleanParams(input: unknown): SimulationParams {
  const raw = (input ?? {}) as Record<string, unknown>
  const out = { ...PARAMETRI_ZERO }
  for (const key of Object.keys(PARAMETRI_ZERO) as (keyof SimulationParams)[]) {
    const v = raw[key]
    const nullable = key === 'dsoTarget' || key === 'dioTarget' || key === 'dpoTarget'
    if (nullable && (v === null || v === undefined || v === '')) {
      ;(out as Record<string, unknown>)[key] = null
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      ;(out as Record<string, unknown>)[key] = v
    } else if (v !== undefined) {
      throw new HttpError(400, `Parametro di simulazione non valido: ${key}.`)
    }
  }
  return out
}

export function listScenarios(companyUuid: string): SimulationScenario[] {
  getCompany(companyUuid)
  return getDatabase()
    .prepare(
      `SELECT * FROM simulation_scenarios WHERE company_uuid = ? AND deleted = 0
        ORDER BY name COLLATE NOCASE`
    )
    .all(companyUuid) as SimulationScenario[]
}

function getScenario(companyUuid: string, uuid: string): SimulationScenario {
  const row = getDatabase()
    .prepare('SELECT * FROM simulation_scenarios WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as SimulationScenario | undefined
  if (!row) throw new HttpError(404, 'Scenario non trovato.')
  return row
}

export function saveScenario(
  companyUuid: string,
  input: { name?: unknown; params?: unknown; notes?: unknown },
  uuid?: string
): SimulationScenario {
  getCompany(companyUuid)
  const current = uuid ? getScenario(companyUuid, uuid) : null
  const name = typeof input.name === 'string' ? input.name.trim() : (current?.name ?? '')
  if (!name) throw new HttpError(400, 'Dai un nome allo scenario.')
  const params = JSON.stringify(
    input.params === undefined && current ? JSON.parse(current.params) : cleanParams(input.params)
  )
  const notes = typeof input.notes === 'string' ? input.notes.trim() || null : (current?.notes ?? null)

  const db = getDatabase()
  const doppione = db
    .prepare(
      `SELECT uuid FROM simulation_scenarios
        WHERE company_uuid = ? AND name = ? COLLATE NOCASE AND deleted = 0 AND uuid <> ?`
    )
    .get(companyUuid, name, uuid ?? '') as { uuid: string } | undefined
  if (doppione) throw new HttpError(409, `Esiste già uno scenario "${name}".`)

  const now = nowIso()
  if (current) {
    db.prepare(
      `UPDATE simulation_scenarios SET name = ?, params = ?, notes = ?, updated_at = ?, synced = 0
        WHERE uuid = ?`
    ).run(name, params, notes, now, current.uuid)
    return getScenario(companyUuid, current.uuid)
  }
  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO simulation_scenarios (uuid, company_uuid, name, params, notes,
                                       created_at, updated_at, synced, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
  ).run(nuovo, companyUuid, name, params, notes, now, now)
  return getScenario(companyUuid, nuovo)
}

export function deleteScenario(companyUuid: string, uuid: string): { uuid: string } {
  getScenario(companyUuid, uuid)
  getDatabase()
    .prepare('UPDATE simulation_scenarios SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

// --- esportazione ----------------------------------------------------------------

/**
 * "Esporta scenario": un foglio con le variazioni, il confronto e il dettaglio
 * degli impatti, calcolato con lo stesso motore della schermata.
 */
export async function exportScenario(
  companyUuid: string,
  input: { periodUuid: string; scenario?: Scenario; params: unknown; name?: string; filePath: string }
): Promise<{ path: string }> {
  const company = getCompany(companyUuid)
  const params = cleanParams(input.params)
  const base = simulationBase(companyUuid, input.periodUuid, input.scenario ?? 'actual')
  const attuale = simulate(base, PARAMETRI_ZERO)
  const simulato = simulate(base, params)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'DaProdFinanza'
  const ws = wb.addWorksheet('Scenario')
  ws.columns = [{ width: 42 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 48 }]
  const euro = '#,##0 "€";[Red]-#,##0 "€"'

  const titolo = ws.addRow([`${company.name} — ${input.name?.trim() || 'Scenario'}`])
  titolo.font = { bold: true, size: 14 }
  ws.addRow([`Base: ${base.label} · proiezione a 12 mesi da ${base.today.split('-').reverse().join('/')}`])
  ws.addRow([])

  const intestazione = (testo: string): void => {
    const r = ws.addRow([testo])
    r.font = { bold: true }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
  }

  intestazione('Variazioni')
  const variazioni: [string, string | number][] = [
    ['Ricavi', `${params.ricaviPercent}%`],
    ['Prezzo merci', `${params.costoMercePercent}%`],
    ['Costi di produzione', `${params.costiVariabiliPercent}%`],
    ['Dipendenti in più', params.nuoviDipendenti],
    ['Costo annuo per dipendente', params.costoDipendenteCents / 100],
    ['Altri costi fissi', `${params.altriCostiFissiPercent}%`],
    ['DSO obiettivo (giorni)', params.dsoTarget ?? 'invariato'],
    ['DIO obiettivo (giorni)', params.dioTarget ?? 'invariato'],
    ['DPO obiettivo (giorni)', params.dpoTarget ?? 'invariato'],
    ['Nuovo investimento', params.investimentoCents / 100],
    ['Anni di ammortamento', params.investimentoAnni],
    ['Nuovo finanziamento', params.finanziamentoCents / 100],
    ['Durata (mesi)', params.finanziamentoMesi],
    ['Tasso annuo', `${params.finanziamentoTasso}%`],
    ['Preammortamento (mesi)', params.finanziamentoPreammortamentoMesi]
  ]
  for (const [k, v] of variazioni) {
    const r = ws.addRow([k, v])
    if (typeof v === 'number' && /investimento|finanziamento|Costo annuo/i.test(k)) r.getCell(2).numFmt = euro
  }
  ws.addRow([])

  intestazione('Confronto')
  const h = ws.addRow(['Indicatore', 'Attuale', 'Scenario', 'Differenza'])
  h.font = { bold: true }
  const confronto: [string, number | null, number | null][] = [
    ['Ricavi', attuale.ricavi, simulato.ricavi],
    ['EBITDA / MOL', attuale.ebitda, simulato.ebitda],
    ['Utile netto', attuale.utile, simulato.utile],
    ['Break-even', attuale.breakEven, simulato.breakEven],
    ['Cash flow annuo', attuale.cashFlowAnnuo, simulato.cashFlowAnnuo],
    ['Liquidità fra 12 mesi', attuale.liquiditaFinale, simulato.liquiditaFinale],
    ['Posizione finanziaria netta fra 12 mesi', attuale.posizioneFinanziariaNetta, simulato.posizioneFinanziariaNetta]
  ]
  for (const [k, a, s] of confronto) {
    const r = ws.addRow([
      k,
      a === null ? null : a / 100,
      s === null ? null : s / 100,
      a === null || s === null ? null : (s - a) / 100
    ])
    for (const c of [2, 3, 4]) r.getCell(c).numFmt = euro
  }
  const margine = ws.addRow([
    'Margine lordo %',
    attuale.margineLordoPercent === null ? null : attuale.margineLordoPercent / 100,
    simulato.margineLordoPercent === null ? null : simulato.margineLordoPercent / 100
  ])
  margine.getCell(2).numFmt = '0.0%'
  margine.getCell(3).numFmt = '0.0%'
  ws.addRow([])

  intestazione('Dettaglio impatti')
  const h2 = ws.addRow(['Voce', 'Attuale', 'Scenario', 'Differenza', 'Nota'])
  h2.font = { bold: true }
  for (const riga of impactRows(attuale, simulato, params)) {
    const r = ws.addRow([
      riga.label,
      riga.attuale / 100,
      riga.simulato / 100,
      (riga.simulato - riga.attuale) / 100,
      riga.nota
    ])
    for (const c of [2, 3, 4]) r.getCell(c).numFmt = euro
  }
  ws.addRow([])

  intestazione('Liquidità mese per mese')
  const h3 = ws.addRow(['Mese', 'Attuale', 'Scenario'])
  h3.font = { bold: true }
  attuale.curva.forEach((v, i) => {
    const r = ws.addRow([i === 0 ? 'Oggi' : `+${i} ${i === 1 ? 'mese' : 'mesi'}`, v / 100, simulato.curva[i]! / 100])
    r.getCell(2).numFmt = euro
    r.getCell(3).numFmt = euro
  })

  ws.addRow([])
  ws.addRow([
    'Simulazione indicativa: i costi variabili seguono i ricavi, le imposte usano l\'aliquota effettiva della base, il cash flow è un rendiconto semplificato.'
  ]).font = { italic: true, color: { argb: 'FF64748B' } }

  await writeFile(input.filePath, Buffer.from(await wb.xlsx.writeBuffer()))
  return { path: input.filePath }
}
