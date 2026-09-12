import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Fase 1 — anagrafica e autenticazione.
 *
 * Lo schema del motore finanziario (piano dei conti, tag, saldi, periodi)
 * NON è qui: arriva in Fase 2 come migrazione 002 (AGENTS.md §13).
 *
 * Ogni tabella porta i campi di sync previsti da AGENTS.md §6
 * (`uuid`, `created_at`, `updated_at`, `synced`, `deleted`) anche se il sync
 * vero e proprio arriva solo in Fase 8: aggiungerli dopo costerebbe una migrazione
 * su dati contabili già in produzione.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE clients (
      uuid            TEXT PRIMARY KEY,
      code            TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      contact_person  TEXT,
      email           TEXT,
      phone           TEXT,
      notes           TEXT,
      start_date      TEXT,
      archived        INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      synced          INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE TABLE companies (
      uuid            TEXT PRIMARY KEY,
      client_uuid     TEXT NOT NULL REFERENCES clients(uuid),
      code            TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      vat_number      TEXT,
      tax_code        TEXT,
      legal_form      TEXT,
      business_type   TEXT,
      start_date      TEXT,
      notes           TEXT,
      archived        INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      synced          INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE INDEX idx_companies_client ON companies(client_uuid);

    -- La P.IVA è la chiave naturale consigliata (AGENTS.md §5): univoca quando
    -- presente, ma le aziende "Da costituire" possono non averla ancora.
    CREATE UNIQUE INDEX idx_companies_vat
      ON companies(vat_number)
      WHERE vat_number IS NOT NULL AND deleted = 0;

    CREATE TABLE users (
      uuid            TEXT PRIMARY KEY,
      username        TEXT NOT NULL COLLATE NOCASE,
      password_hash   TEXT NOT NULL,
      full_name       TEXT NOT NULL,
      role            TEXT NOT NULL CHECK (role IN ('consultant', 'company')),
      company_uuid    TEXT REFERENCES companies(uuid),
      active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      last_login      TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      synced          INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),

      -- Un utente con ruolo 'company' vede una sola azienda (§4);
      -- il consulente non è legato ad alcuna azienda.
      CHECK (
        (role = 'company'    AND company_uuid IS NOT NULL) OR
        (role = 'consultant' AND company_uuid IS NULL)
      )
    );

    CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE deleted = 0;
  `)
}
