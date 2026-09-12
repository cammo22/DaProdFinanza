import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AccountType } from '@shared/types'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { companyFolder } from '../../lib/paths'
import { readPreview, type ImportPreview } from '../../import/chart-of-accounts'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'

/**
 * Import del piano dei conti: anteprima, poi scrittura — AGENTS.md §11.1.
 *
 * L'anteprima non tocca il database. La scrittura avviene in una sola
 * transazione e solo su richiesta esplicita, dopo che il consulente ha visto
 * quante righe sono state riconosciute e quante no.
 */

export interface PreviewResult extends ImportPreview {
  /** Lo stesso file è già stato importato per questa azienda? (§5, impronta) */
  alreadyImported: { filename: string; imported_at: string } | null
}

export async function previewChartOfAccounts(
  companyUuid: string,
  filePath: string,
  valueColumn?: string
): Promise<PreviewResult> {
  getCompany(companyUuid)
  const preview = await readPreview(filePath, { valueColumn })

  const previous = getDatabase()
    .prepare(
      `SELECT filename, imported_at FROM import_documents
        WHERE company_uuid = ? AND sha256 = ? AND deleted = 0`
    )
    .get(companyUuid, preview.file.sha256) as { filename: string; imported_at: string } | undefined

  return { ...preview, alreadyImported: previous ?? null }
}

export interface ApplyOptions {
  valueColumn?: string
  year: number
  /** null = periodo annuale. */
  month?: number | null
  scenario?: 'actual' | 'budget' | 'forecast'
  /** Serve per riscrivere un periodo già importato: senza, l'import si ferma. */
  overwrite?: boolean
}

export interface ApplyResult {
  import_document_uuid: string
  period_uuid: string
  accounts_created: number
  accounts_updated: number
  balances_written: number
  skipped_without_value: number
  archived_to: string
}

export async function applyChartOfAccounts(
  companyUuid: string,
  filePath: string,
  options: ApplyOptions
): Promise<ApplyResult> {
  const company = getCompany(companyUuid)
  const db = getDatabase()
  const preview = await previewChartOfAccounts(companyUuid, filePath, options.valueColumn)

  if (preview.duplicates.length > 0) {
    throw new HttpError(
      409,
      `Il file contiene ${preview.duplicates.length} codice/i conto ripetuti (${preview.duplicates
        .map((d) => d.code)
        .join(', ')}). Vanno risolti nel file prima di importare.`
    )
  }

  if (preview.accounts.length === 0) {
    throw new HttpError(
      422,
      'Nessuna riga importabile: il file contiene la struttura del piano dei conti, non i conti. ' +
        `(${preview.templateRows} righe di solo modello.)`
    )
  }

  const scenario = options.scenario ?? 'actual'
  const month = options.month ?? null
  const now = nowIso()

  // L'originale resta su disco per l'audit (§12): si archivia prima di scrivere,
  // così un fallimento della transazione non lascia il database senza la fonte.
  const archivedTo = join(
    companyFolder(company.code),
    'import',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${preview.file.name}`
  )
  await copyFile(filePath, archivedTo)

  const run = db.transaction((): ApplyResult => {
    // --- periodo ------------------------------------------------------------
    const periodType = month === null ? 'year' : 'month'
    const existingPeriod = db
      .prepare(
        `SELECT uuid, closed FROM fiscal_periods
          WHERE company_uuid = ? AND period_type = ? AND year = ?
            AND ifnull(month, 0) = ? AND deleted = 0`
      )
      .get(companyUuid, periodType, options.year, month ?? 0) as
      | { uuid: string; closed: number }
      | undefined

    if (existingPeriod?.closed) {
      throw new HttpError(
        409,
        'Il periodo è chiuso: un import non può sovrascrivere un bilancio già validato.'
      )
    }

    const MESI = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ]
    const label = month === null ? String(options.year) : `${MESI[month - 1]} ${options.year}`

    let periodUuid = existingPeriod?.uuid
    if (!periodUuid) {
      periodUuid = newUuid()
      db.prepare(
        `INSERT INTO fiscal_periods (uuid, company_uuid, period_type, year, month, label,
                                     closed, created_at, updated_at, synced, deleted)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0)`
      ).run(periodUuid, companyUuid, periodType, options.year, month, label, now, now)
    }

    // Un periodo che ha già saldi non si riscrive per sbaglio (§6).
    const existingBalances = db
      .prepare(
        `SELECT count(*) AS n FROM account_balances
          WHERE period_uuid = ? AND scenario = ? AND deleted = 0`
      )
      .get(periodUuid, scenario) as { n: number }

    if (existingBalances.n > 0 && !options.overwrite) {
      throw new HttpError(
        409,
        `${label} ha già ${existingBalances.n} saldi caricati per lo scenario "${scenario}". ` +
          'Conferma la sovrascrittura per procedere.'
      )
    }

    // --- documento di origine ----------------------------------------------
    const documentUuid = newUuid()
    db.prepare(
      `INSERT INTO import_documents (uuid, company_uuid, kind, filename, sha256, stored_path,
                                     row_count, notes, imported_at,
                                     created_at, updated_at, synced, deleted)
       VALUES (?, ?, 'excel_chart_of_accounts', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    ).run(
      documentUuid,
      companyUuid,
      preview.file.name,
      preview.file.sha256,
      archivedTo,
      preview.accounts.length,
      `Foglio "${preview.file.sheet}", colonna valore "${preview.valueColumn}".`,
      now,
      now,
      now
    )

    // --- conti ---------------------------------------------------------------
    const findAccount = db.prepare(
      'SELECT uuid FROM accounts WHERE company_uuid = ? AND code = ? AND deleted = 0'
    )
    const insertAccount = db.prepare(
      `INSERT INTO accounts (uuid, company_uuid, code, name, section_code, account_type,
                             detail_tag, direct_cost_pct, active, notes,
                             created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, 0, 0)`
    )
    // `coalesce`: se il file non porta la sotto-classificazione, si tiene
    // quella già presente. Un import non deve cancellare una scelta fatta a
    // mano dal consulente solo perché quel file non la esprime.
    const updateAccount = db.prepare(
      `UPDATE accounts SET name = ?, section_code = ?, account_type = ?,
                           detail_tag = coalesce(?, detail_tag),
                           direct_cost_pct = ?, updated_at = ?, synced = 0
        WHERE uuid = ?`
    )

    let created = 0
    let updated = 0
    const accountUuidByCode = new Map<string, string>()

    for (const parsed of preview.accounts) {
      const pct = parsed.direct_cost_pct
      const cleanPct = pct !== null && pct >= 0 && pct <= 100 ? pct : null
      const existing = findAccount.get(companyUuid, parsed.code) as { uuid: string } | undefined

      if (existing) {
        updateAccount.run(
          parsed.name,
          parsed.section_code,
          parsed.account_type as AccountType,
          parsed.detail_tag,
          cleanPct,
          now,
          existing.uuid
        )
        accountUuidByCode.set(parsed.code, existing.uuid)
        updated++
      } else {
        const uuid = newUuid()
        insertAccount.run(
          uuid,
          companyUuid,
          parsed.code,
          parsed.name,
          parsed.section_code,
          parsed.account_type as AccountType,
          parsed.detail_tag,
          cleanPct,
          now,
          now
        )
        accountUuidByCode.set(parsed.code, uuid)
        created++
      }
    }

    // --- saldi ---------------------------------------------------------------
    db.prepare(
      `UPDATE account_balances SET deleted = 1, updated_at = ?, synced = 0
        WHERE period_uuid = ? AND scenario = ? AND deleted = 0`
    ).run(now, periodUuid, scenario)

    const insertBalance = db.prepare(
      `INSERT INTO account_balances (uuid, company_uuid, account_uuid, period_uuid, scenario,
                                     amount_cents, import_document_uuid,
                                     created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )

    let written = 0
    let skipped = 0
    for (const parsed of preview.accounts) {
      if (parsed.amount_cents === null) {
        skipped++
        continue
      }
      insertBalance.run(
        newUuid(),
        companyUuid,
        accountUuidByCode.get(parsed.code),
        periodUuid,
        scenario,
        parsed.amount_cents,
        documentUuid,
        now,
        now
      )
      written++
    }

    return {
      import_document_uuid: documentUuid,
      period_uuid: periodUuid,
      accounts_created: created,
      accounts_updated: updated,
      balances_written: written,
      skipped_without_value: skipped,
      archived_to: archivedTo
    }
  })

  return run()
}
