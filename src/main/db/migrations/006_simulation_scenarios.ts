import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Fase 7 — scenari di simulazione salvati (AGENTS.md §10.8).
 *
 * Uno scenario è solo un insieme di variazioni con un nome: i risultati non si
 * memorizzano, si ricalcolano sempre dalla base corrente. Così uno scenario
 * salvato a marzo, riaperto a settembre, ragiona sui numeri di settembre.
 * I parametri stanno in JSON perché sono un blocco unico che cambia insieme
 * alla schermata, non dati da interrogare.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE simulation_scenarios (
      uuid          TEXT PRIMARY KEY,
      company_uuid  TEXT NOT NULL REFERENCES companies(uuid),
      name          TEXT NOT NULL,
      params        TEXT NOT NULL CHECK (json_valid(params)),
      notes         TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      synced        INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_simulation_scenarios_name
      ON simulation_scenarios(company_uuid, name COLLATE NOCASE) WHERE deleted = 0;
  `)
}
