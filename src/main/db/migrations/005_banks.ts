import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Fase 6 — banche e finanziamenti (AGENTS.md §10.7).
 *
 * - `banks`: gli istituti con cui l'azienda lavora, società di leasing
 *   comprese.
 * - `credit_lines`: le linee a revoca o autoliquidanti — fido di cassa,
 *   anticipo fatture/SBF, carte — con accordato e utilizzato a una data.
 * - `loans`: mutui, finanziamenti e leasing. Si memorizzano i **parametri**
 *   del piano, non le rate: il piano si ricalcola sempre dagli stessi dati
 *   (`@shared/engine/loans`), e le rate entrano nella previsione di cassa senza
 *   essere copiate in `treasury_items`. Una sola fonte, niente disallineamenti.
 *
 * Importi in centesimi, tassi in percentuale nominale annua.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE banks (
      uuid          TEXT PRIMARY KEY,
      company_uuid  TEXT NOT NULL REFERENCES companies(uuid),
      name          TEXT NOT NULL,
      branch        TEXT,
      contact       TEXT,
      notes         TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      synced        INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_banks_company_name
      ON banks(company_uuid, name COLLATE NOCASE) WHERE deleted = 0;

    CREATE TABLE credit_lines (
      uuid                 TEXT PRIMARY KEY,
      company_uuid         TEXT NOT NULL REFERENCES companies(uuid),
      bank_uuid            TEXT NOT NULL REFERENCES banks(uuid),
      kind                 TEXT NOT NULL CHECK (kind IN ('fido_cassa', 'anticipo_fatture', 'carta', 'altro')),
      label                TEXT NOT NULL,
      granted_cents        INTEGER NOT NULL CHECK (granted_cents >= 0),
      -- Può superare l'accordato: uno sconfinamento è un dato, non un errore.
      used_cents           INTEGER NOT NULL DEFAULT 0 CHECK (used_cents >= 0),
      used_as_of           TEXT,
      annual_rate_percent  REAL CHECK (annual_rate_percent IS NULL OR annual_rate_percent BETWEEN 0 AND 50),
      expiry_date          TEXT,
      notes                TEXT,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL,
      synced               INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted              INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE INDEX idx_credit_lines_company ON credit_lines(company_uuid) WHERE deleted = 0;

    CREATE TABLE loans (
      uuid                 TEXT PRIMARY KEY,
      company_uuid         TEXT NOT NULL REFERENCES companies(uuid),
      bank_uuid            TEXT NOT NULL REFERENCES banks(uuid),
      kind                 TEXT NOT NULL CHECK (kind IN ('mutuo', 'finanziamento', 'leasing')),
      label                TEXT NOT NULL,
      principal_cents      INTEGER NOT NULL CHECK (principal_cents > 0),
      annual_rate_percent  REAL NOT NULL CHECK (annual_rate_percent BETWEEN 0 AND 50),
      first_due_date       TEXT NOT NULL,
      installments         INTEGER NOT NULL CHECK (installments BETWEEN 1 AND 600),
      frequency            TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'semiannual', 'annual')),
      grace_installments   INTEGER NOT NULL DEFAULT 0 CHECK (grace_installments >= 0),
      amortization         TEXT NOT NULL DEFAULT 'francese' CHECK (amortization IN ('francese', 'italiano')),
      balloon_cents        INTEGER NOT NULL DEFAULT 0 CHECK (balloon_cents >= 0),
      notes                TEXT,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL,
      synced               INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted              INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),

      CHECK (grace_installments < installments),
      CHECK (balloon_cents < principal_cents)
    );

    CREATE INDEX idx_loans_company ON loans(company_uuid) WHERE deleted = 0;
  `)
}
