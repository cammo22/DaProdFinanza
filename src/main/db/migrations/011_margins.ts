import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Marginalità (versione 1.3.0, AGENTS.md §10.18).
 *
 * - `margin_materials`: il listino di ciò che si compra per produrre
 *   (ingredienti, materiali, articoli), con unità, costo e scarto.
 * - `margin_items`: ciò che si vende e di cui si vuole sapere il margine —
 *   ricette, prodotti, commesse, servizi — con prezzo IVA esclusa, resa
 *   (porzioni o pezzi che la ricetta produce), vendite al mese, stato e
 *   cliente per le commesse.
 * - `margin_lines`: di cosa è fatta ogni voce. Per le commesse ci sono due
 *   fasi, preventivo e consuntivo, per vedere lo scostamento.
 *
 * I costi e i margini non si salvano: li calcola il motore, così un nuovo
 * prezzo della farina ricalcola tutte le pizze.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE margin_materials (
      uuid              TEXT PRIMARY KEY,
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      name              TEXT NOT NULL,
      unit              TEXT NOT NULL DEFAULT 'kg',
      unit_cost_cents   INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
      waste_pct         REAL NOT NULL DEFAULT 0 CHECK (waste_pct >= 0 AND waste_pct <= 95),
      category          TEXT,
      supplier          TEXT,
      notes             TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE INDEX idx_margin_materials_company ON margin_materials(company_uuid, name) WHERE deleted = 0;

    CREATE TABLE margin_items (
      uuid              TEXT PRIMARY KEY,
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      kind              TEXT NOT NULL CHECK (kind IN ('ricetta', 'prodotto', 'commessa', 'servizio')),
      name              TEXT NOT NULL,
      code              TEXT,
      category          TEXT,
      price_cents       INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
      vat_pct           REAL NOT NULL DEFAULT 22 CHECK (vat_pct >= 0 AND vat_pct <= 30),
      yield_qty         REAL NOT NULL DEFAULT 1 CHECK (yield_qty > 0),
      monthly_volume    REAL CHECK (monthly_volume IS NULL OR monthly_volume >= 0),
      overhead_pct      REAL CHECK (overhead_pct IS NULL OR (overhead_pct >= 0 AND overhead_pct <= 300)),
      status            TEXT NOT NULL DEFAULT 'attiva'
                          CHECK (status IN ('attiva', 'preventivo', 'in_corso', 'chiusa', 'archiviata')),
      customer          TEXT,
      start_date        TEXT,
      end_date          TEXT,
      notes             TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE INDEX idx_margin_items_company ON margin_items(company_uuid, kind, name) WHERE deleted = 0;

    CREATE TABLE margin_lines (
      uuid              TEXT PRIMARY KEY,
      item_uuid         TEXT NOT NULL REFERENCES margin_items(uuid),
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      phase             TEXT NOT NULL DEFAULT 'preventivo' CHECK (phase IN ('preventivo', 'consuntivo')),
      kind              TEXT NOT NULL CHECK (kind IN ('materiale', 'manodopera', 'esterno', 'altro')),
      material_uuid     TEXT REFERENCES margin_materials(uuid),
      employee_uuid     TEXT REFERENCES employees(uuid),
      description       TEXT,
      qty               REAL NOT NULL DEFAULT 1 CHECK (qty >= 0),
      unit              TEXT,
      unit_cost_cents   INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
      position          INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      -- Un materiale viene dal listino, la manodopera no.
      CHECK (kind = 'materiale' OR material_uuid IS NULL),
      CHECK (kind = 'manodopera' OR employee_uuid IS NULL)
    );

    CREATE INDEX idx_margin_lines_item ON margin_lines(item_uuid, phase, position) WHERE deleted = 0;
  `)
}
