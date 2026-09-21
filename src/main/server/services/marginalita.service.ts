import {
  costoDipendente,
  inForza,
  KIND_RIGHE,
  KIND_VOCI,
  marginalitaPredefinita,
  normalizzaMarginalita,
  riepilogoPersonale,
  tipoDaAttivita,
  type ImpostazioniMarginalita
} from '@shared/engine'
import type { MarginItem, MarginLine, MarginMaterial } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'
import { getPersonaleSettings, listEmployees } from './personale.service'
import { leggiImpostazione, scriviImpostazione } from './settings.service'

/**
 * Marginalità — AGENTS.md §10.18. Listino, voci (ricette, prodotti, commesse)
 * e le loro righe; i conti li fa il motore condiviso, anche nella schermata.
 */

const CHIAVE = 'marginalita'
const STATI = ['attiva', 'preventivo', 'in_corso', 'chiusa', 'archiviata'] as const

export function getMarginSettings(companyUuid: string): ImpostazioniMarginalita {
  const company = getCompany(companyUuid)
  // Senza impostazioni salvate, il tipo si indovina dall'attività dell'anagrafica.
  return normalizzaMarginalita(
    leggiImpostazione('company', companyUuid, CHIAVE),
    marginalitaPredefinita(tipoDaAttivita(company.business_type))
  )
}

export function saveMarginSettings(companyUuid: string, input: unknown): ImpostazioniMarginalita {
  const nuove = normalizzaMarginalita(input, getMarginSettings(companyUuid))
  scriviImpostazione('company', companyUuid, CHIAVE, nuove)
  return nuove
}

// --- validazione -----------------------------------------------------------------

const testo = (v: unknown, max = 120): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

function numero(v: unknown, campo: string, min: number, max: number, base?: number): number {
  if ((v === undefined || v === null || v === '') && base !== undefined) return base
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${campo}: valore non valido.`)
  return n
}

function facoltativo(v: unknown, campo: string, min: number, max: number): number | null {
  return v === undefined || v === null || v === '' ? null : numero(v, campo, min, max)
}

function data(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// --- listino ---------------------------------------------------------------------

export function listMaterials(companyUuid: string): MarginMaterial[] {
  getCompany(companyUuid)
  return getDatabase()
    .prepare(
      `SELECT * FROM margin_materials WHERE company_uuid = ? AND deleted = 0
        ORDER BY ifnull(category, 'zzz') COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all(companyUuid) as MarginMaterial[]
}

function getMaterial(companyUuid: string, uuid: string): MarginMaterial {
  const row = getDatabase()
    .prepare('SELECT * FROM margin_materials WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
    .get(uuid, companyUuid) as MarginMaterial | undefined
  if (!row) throw new HttpError(404, 'Voce del listino non trovata.')
  return row
}

export function saveMaterial(companyUuid: string, input: Record<string, unknown>, uuid?: string): MarginMaterial {
  getCompany(companyUuid)
  const prima = uuid ? getMaterial(companyUuid, uuid) : null
  const v = (k: keyof MarginMaterial): unknown => (input[k] !== undefined ? input[k] : prima?.[k])
  const name = testo(v('name'))
  if (!name) throw new HttpError(400, 'Scrivi il nome.')
  const riga = {
    name,
    unit: testo(v('unit'), 12) ?? 'kg',
    unit_cost_cents: Math.round(numero(v('unit_cost_cents'), 'Costo', 0, 1_000_000_000, 0)),
    waste_pct: numero(v('waste_pct'), 'Scarto', 0, 95, 0),
    category: testo(v('category'), 60),
    supplier: testo(v('supplier'), 80),
    notes: testo(v('notes'), 500)
  }
  const db = getDatabase()
  const now = nowIso()
  if (prima) {
    db.prepare(
      `UPDATE margin_materials SET name = @name, unit = @unit, unit_cost_cents = @unit_cost_cents,
              waste_pct = @waste_pct, category = @category, supplier = @supplier, notes = @notes,
              updated_at = @now, synced = 0
        WHERE uuid = @uuid`
    ).run({ ...riga, now, uuid: prima.uuid })
    return getMaterial(companyUuid, prima.uuid)
  }
  const nuovo = newUuid()
  db.prepare(
    `INSERT INTO margin_materials (uuid, company_uuid, name, unit, unit_cost_cents, waste_pct, category,
                                   supplier, notes, created_at, updated_at, synced, deleted)
     VALUES (@uuid, @company, @name, @unit, @unit_cost_cents, @waste_pct, @category, @supplier, @notes,
             @now, @now, 0, 0)`
  ).run({ ...riga, uuid: nuovo, company: companyUuid, now })
  return getMaterial(companyUuid, nuovo)
}

export function deleteMaterial(companyUuid: string, uuid: string): { uuid: string } {
  getMaterial(companyUuid, uuid)
  const usi = getDatabase()
    .prepare(
      `SELECT count(DISTINCT l.item_uuid) AS n FROM margin_lines l
         JOIN margin_items i ON i.uuid = l.item_uuid AND i.deleted = 0
        WHERE l.material_uuid = ? AND l.deleted = 0`
    )
    .get(uuid) as { n: number }
  if (usi.n > 0) {
    throw new HttpError(409, `È usato in ${usi.n === 1 ? 'una voce' : `${usi.n} voci`}: toglilo prima da lì, o cambiane solo il costo.`)
  }
  getDatabase()
    .prepare('UPDATE margin_materials SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

// --- voci -------------------------------------------------------------------------

export function listMarginItems(companyUuid: string): MarginItem[] {
  getCompany(companyUuid)
  const db = getDatabase()
  const voci = db
    .prepare(
      `SELECT * FROM margin_items WHERE company_uuid = ? AND deleted = 0
        ORDER BY kind, ifnull(category, 'zzz') COLLATE NOCASE, name COLLATE NOCASE`
    )
    .all(companyUuid) as Omit<MarginItem, 'lines'>[]
  const righe = db
    .prepare(`SELECT * FROM margin_lines WHERE company_uuid = ? AND deleted = 0 ORDER BY phase, position`)
    .all(companyUuid) as MarginLine[]
  const perVoce = new Map<string, MarginLine[]>()
  for (const r of righe) {
    const l = perVoce.get(r.item_uuid) ?? []
    l.push(r)
    perVoce.set(r.item_uuid, l)
  }
  return voci.map((v) => ({ ...v, lines: perVoce.get(v.uuid) ?? [] }))
}

function getItem(companyUuid: string, uuid: string): MarginItem {
  const item = listMarginItems(companyUuid).find((i) => i.uuid === uuid)
  if (!item) throw new HttpError(404, 'Voce non trovata.')
  return item
}

/**
 * Crea o aggiorna una voce. Se arrivano le righe, sostituiscono quelle di
 * prima (la voce si modifica tutta insieme, come in un foglio).
 */
export function saveMarginItem(companyUuid: string, input: Record<string, unknown>, uuid?: string): MarginItem {
  getCompany(companyUuid)
  const prima = uuid ? getItem(companyUuid, uuid) : null
  const v = (k: keyof MarginItem): unknown => (input[k] !== undefined ? input[k] : prima?.[k])
  const name = testo(v('name'))
  if (!name) throw new HttpError(400, 'Scrivi il nome.')
  const kind = v('kind') ?? 'prodotto'
  if (!KIND_VOCI.includes(kind as never)) throw new HttpError(400, 'Tipo di voce non valido.')
  const status = v('status') ?? 'attiva'
  if (!STATI.includes(status as never)) throw new HttpError(400, 'Stato non valido.')
  const riga = {
    kind: kind as string,
    name,
    code: testo(v('code'), 40),
    category: testo(v('category'), 60),
    price_cents: Math.round(numero(v('price_cents'), 'Prezzo', 0, 10_000_000_000, 0)),
    vat_pct: numero(v('vat_pct'), 'IVA', 0, 30, 22),
    yield_qty: numero(v('yield_qty'), 'Resa', 0.0001, 1_000_000, 1),
    monthly_volume: facoltativo(v('monthly_volume'), 'Vendite al mese', 0, 100_000_000),
    overhead_pct: facoltativo(v('overhead_pct'), 'Costi generali', 0, 300),
    status: status as string,
    customer: testo(v('customer'), 120),
    start_date: data(v('start_date')),
    end_date: data(v('end_date')),
    notes: testo(v('notes'), 1000)
  }

  const materiali = new Set(listMaterials(companyUuid).map((m) => m.uuid))
  const persone = new Set(listEmployees(companyUuid).map((e) => e.uuid))
  const righe = Array.isArray(input.lines)
    ? (input.lines as Record<string, unknown>[]).map((l, i) => {
        const k = l.kind
        if (!KIND_RIGHE.includes(k as never)) throw new HttpError(400, `Riga ${i + 1}: tipo non valido.`)
        const materiale = k === 'materiale' && typeof l.material_uuid === 'string' && materiali.has(l.material_uuid) ? l.material_uuid : null
        const persona = k === 'manodopera' && typeof l.employee_uuid === 'string' && persone.has(l.employee_uuid) ? l.employee_uuid : null
        return {
          phase: l.phase === 'consuntivo' ? 'consuntivo' : 'preventivo',
          kind: k as string,
          material_uuid: materiale,
          employee_uuid: persona,
          description: testo(l.description, 200),
          qty: numero(l.qty, `Riga ${i + 1}: quantità`, 0, 100_000_000, 0),
          unit: testo(l.unit, 12),
          unit_cost_cents:
            l.unit_cost_cents === null || l.unit_cost_cents === undefined || l.unit_cost_cents === ''
              ? null
              : Math.round(numero(l.unit_cost_cents, `Riga ${i + 1}: costo`, 0, 10_000_000_000)),
          position: i
        }
      })
    : null

  const db = getDatabase()
  const now = nowIso()
  const id = prima?.uuid ?? newUuid()
  db.transaction(() => {
    if (prima) {
      db.prepare(
        `UPDATE margin_items SET kind = @kind, name = @name, code = @code, category = @category,
                price_cents = @price_cents, vat_pct = @vat_pct, yield_qty = @yield_qty,
                monthly_volume = @monthly_volume, overhead_pct = @overhead_pct, status = @status,
                customer = @customer, start_date = @start_date, end_date = @end_date, notes = @notes,
                updated_at = @now, synced = 0
          WHERE uuid = @uuid`
      ).run({ ...riga, now, uuid: id })
    } else {
      db.prepare(
        `INSERT INTO margin_items (uuid, company_uuid, kind, name, code, category, price_cents, vat_pct,
                                   yield_qty, monthly_volume, overhead_pct, status, customer, start_date,
                                   end_date, notes, created_at, updated_at, synced, deleted)
         VALUES (@uuid, @company, @kind, @name, @code, @category, @price_cents, @vat_pct, @yield_qty,
                 @monthly_volume, @overhead_pct, @status, @customer, @start_date, @end_date, @notes,
                 @now, @now, 0, 0)`
      ).run({ ...riga, uuid: id, company: companyUuid, now })
    }
    if (righe) {
      db.prepare('UPDATE margin_lines SET deleted = 1, updated_at = ?, synced = 0 WHERE item_uuid = ? AND deleted = 0').run(now, id)
      const ins = db.prepare(
        `INSERT INTO margin_lines (uuid, item_uuid, company_uuid, phase, kind, material_uuid, employee_uuid,
                                   description, qty, unit, unit_cost_cents, position, created_at, updated_at,
                                   synced, deleted)
         VALUES (@uuid, @item, @company, @phase, @kind, @material_uuid, @employee_uuid, @description, @qty,
                 @unit, @unit_cost_cents, @position, @now, @now, 0, 0)`
      )
      for (const r of righe) ins.run({ ...r, uuid: newUuid(), item: id, company: companyUuid, now })
    }
  })()
  return getItem(companyUuid, id)
}

export function deleteMarginItem(companyUuid: string, uuid: string): { uuid: string } {
  getItem(companyUuid, uuid)
  const db = getDatabase()
  const now = nowIso()
  db.transaction(() => {
    db.prepare('UPDATE margin_items SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?').run(now, uuid)
    db.prepare('UPDATE margin_lines SET deleted = 1, updated_at = ?, synced = 0 WHERE item_uuid = ?').run(now, uuid)
  })()
  return { uuid }
}

/** Il costo orario di chi lavora sulla produzione, persona per persona e in media. */
export function manodoperaDalPersonale(companyUuid: string): {
  costoOrarioDiretti: number | null
  persone: { uuid: string; name: string; role: string | null; costoOrario: number | null; direct: 0 | 1 }[]
} {
  const imp = getPersonaleSettings(companyUuid)
  const oggi = new Date().toISOString().slice(0, 10)
  const lista = listEmployees(companyUuid)
  return {
    costoOrarioDiretti: riepilogoPersonale(lista, imp, oggi).costoOrarioDiretti,
    persone: lista
      .filter((e) => inForza(e, oggi))
      .map((e) => ({ uuid: e.uuid, name: e.name, role: e.role, direct: e.direct, costoOrario: costoDipendente(e, imp).costoOrario }))
  }
}
