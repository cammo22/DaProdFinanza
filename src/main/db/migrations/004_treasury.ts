import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Fase 5 — tesoreria e scadenziario (AGENTS.md §10.6).
 *
 * Il bilancio dice quanta liquidità c'era a fine periodo; la tesoreria dice
 * quanta ce ne sarà. Servono dati che il piano dei conti non ha: le singole
 * scadenze e le previsioni del consulente.
 *
 * - `treasury_items`: una riga per ogni movimento atteso. Le scadenze dello
 *   scadenziario (fatture da incassare o da pagare) e le previsioni manuali
 *   stanno nella stessa tabella perché la previsione le somma allo stesso
 *   modo; `source` le distingue. Le rate dei finanziamenti (Fase 6) useranno
 *   `source = 'finanziamento'`.
 * - `company_treasury_settings`: la soglia minima di liquidità e l'ultimo saldo
 *   di cassa noto, se il consulente lo inserisce a mano.
 *
 * Importi in centesimi interi, come nella 002. Date `YYYY-MM-DD`.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE treasury_items (
      uuid              TEXT PRIMARY KEY,
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      direction         TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      source            TEXT NOT NULL CHECK (source IN ('scadenziario', 'manuale', 'finanziamento')),
      category          TEXT NOT NULL,
      description       TEXT NOT NULL,
      counterparty      TEXT,
      -- Documento d'origine (numero e data fattura) e condizioni di pagamento
      -- del foglio DICTIONARY (docs/MODELLO_FINANZIARIO.md §8).
      document_ref      TEXT,
      document_date     TEXT,
      payment_terms     TEXT CHECK (payment_terms IS NULL OR payment_terms IN ('RD', 'DF', 'FM')),
      payment_days      INTEGER CHECK (payment_days IS NULL OR payment_days >= 0),
      payment_method    TEXT,
      due_date          TEXT NOT NULL,
      amount_cents      INTEGER NOT NULL CHECK (amount_cents > 0),
      -- Pagamento parziale (§8: "Pagata / Non pagata / Pagamento parziale"):
      -- lo stato si ricava da qui, non si memorizza due volte.
      paid_cents        INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0 AND paid_cents <= amount_cents),
      paid_date         TEXT,
      recurrence        TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly')),
      recurrence_until  TEXT,
      notes             TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),

      -- Una fattura è un documento singolo: non si ripete.
      CHECK (recurrence = 'none' OR source <> 'scadenziario'),
      -- Una data di incasso senza importo incassato non vuol dire niente.
      CHECK (paid_date IS NULL OR paid_cents > 0)
    );

    CREATE INDEX idx_treasury_items_company_due
      ON treasury_items(company_uuid, due_date) WHERE deleted = 0;

    CREATE TABLE company_treasury_settings (
      uuid                 TEXT PRIMARY KEY,
      company_uuid         TEXT NOT NULL REFERENCES companies(uuid),
      min_liquidity_cents  INTEGER CHECK (min_liquidity_cents IS NULL OR min_liquidity_cents >= 0),
      opening_cash_cents   INTEGER,
      opening_cash_date    TEXT,
      created_at           TEXT NOT NULL,
      updated_at           TEXT NOT NULL,
      synced               INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted              INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),

      -- Un saldo senza data non si può usare come punto di partenza.
      CHECK ((opening_cash_cents IS NULL) = (opening_cash_date IS NULL))
    );

    CREATE UNIQUE INDEX idx_company_treasury_settings
      ON company_treasury_settings(company_uuid) WHERE deleted = 0;
  `)
}
