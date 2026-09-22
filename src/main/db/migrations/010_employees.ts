import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Personale (versione 1.3.0, AGENTS.md §10.16).
 *
 * Una riga per persona: contratto, ore, retribuzione annua lorda, mensilità,
 * contributi e INAIL se diversi da quelli dell'azienda, altri costi, reparto,
 * diretto o indiretto. Il costo aziendale e il costo orario non si salvano:
 * li calcola il motore (`shared/engine/personale.ts`), così cambiare una
 * percentuale nelle impostazioni ricalcola tutti.
 *
 * Le impostazioni del personale dell'azienda (ore annue, percentuali, giorno
 * degli stipendi, tesoreria) stanno nella tabella `settings`, chiave
 * `personale`.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE employees (
      uuid                  TEXT PRIMARY KEY,
      company_uuid          TEXT NOT NULL REFERENCES companies(uuid),
      name                  TEXT NOT NULL,
      role                  TEXT,
      department            TEXT,
      contract              TEXT NOT NULL DEFAULT 'indeterminato'
                              CHECK (contract IN ('indeterminato', 'determinato', 'apprendistato', 'collaborazione', 'altro')),
      ccnl_level            TEXT,
      hours_week            REAL NOT NULL DEFAULT 40 CHECK (hours_week >= 0 AND hours_week <= 60),
      gross_annual_cents    INTEGER NOT NULL DEFAULT 0 CHECK (gross_annual_cents >= 0),
      monthly_payments      INTEGER NOT NULL DEFAULT 13 CHECK (monthly_payments BETWEEN 12 AND 14),
      employer_contrib_pct  REAL CHECK (employer_contrib_pct IS NULL OR (employer_contrib_pct >= 0 AND employer_contrib_pct <= 60)),
      inail_pct             REAL CHECK (inail_pct IS NULL OR (inail_pct >= 0 AND inail_pct <= 30)),
      other_costs_cents     INTEGER NOT NULL DEFAULT 0 CHECK (other_costs_cents >= 0),
      direct                INTEGER NOT NULL DEFAULT 1 CHECK (direct IN (0, 1)),
      start_date            TEXT,
      end_date              TEXT,
      notes                 TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      synced                INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted               INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
    );

    CREATE INDEX idx_employees_company ON employees(company_uuid, name) WHERE deleted = 0;
  `)
}
