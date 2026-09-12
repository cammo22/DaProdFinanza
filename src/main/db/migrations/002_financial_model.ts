import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Fase 2 — schema del motore finanziario.
 *
 * Traduce in tabelle docs/MODELLO_FINANZIARIO.md §1 e §2: piano dei conti per
 * azienda, sezioni con i tag di riclassificazione, periodi contabili, saldi.
 * Qui **non c'è nessuna formula**: il calcolo (§3-§6) è Fase 3.
 *
 * Due scelte da conoscere prima di leggere il resto:
 *
 * 1. **Gli importi sono interi in centesimi** (`amount_cents`). Su un bilancio
 *    riclassificato si sommano centinaia di righe: con i float una somma può
 *    sfalsare di 0,01 e far "non quadrare" attivo e passivo — esattamente il
 *    tipo di errore che toglie fiducia a uno strumento di controllo di
 *    gestione. La conversione a euro avviene al bordo (import, UI, export).
 *
 * 2. **Il catalogo delle sezioni è dato scritto in questa migrazione**, non
 *    costanti nel codice: a runtime la fonte di verità è il database. Cambiare
 *    una sezione o un tag richiede una nuova migrazione, come per qualsiasi
 *    altro dato strutturale.
 */

/** §1 — i cinque TIPI di conto. */
const ACCOUNT_TYPES = ["RICAVO", "COSTO", "ATTIVITA'", "ATTIVITA' NEGATIVO", "PASSIVITA'"]

interface SectionSeed {
  code: string
  label: string
  /** Prospetto di destinazione: conto economico o stato patrimoniale. */
  statement: 'CE' | 'SP'
  /** TIPO di conto prevalente della sezione (§1). */
  account_type: string
  /** §2.2 — comportamento del costo: variabile o fisso. Solo per i costi. */
  cost_behaviour: 'Costi Variabili' | 'Costi Fissi' | null
  /** §2.2 — % di costo diretto di default, sovrascrivibile per azienda (§7). */
  default_direct_cost_pct: number | null
  sort_order: number
  /** Tag applicati a ogni conto della sezione (§2.1-§2.4). */
  tags: string[]
  /**
   * Alternative fra cui il singolo conto ne sceglie una. Nel documento sono
   * le voci separate da "/" nelle tabelle dello stato patrimoniale: un conto
   * di Liquidità Differite è crediti commerciali *oppure* crediti diversi
   * *oppure* erario c/IVA — la distinzione serve, per esempio, al DSO (§6),
   * che vuole i soli crediti commerciali.
   */
  detail_tags: string[]
}

const SECTIONS: SectionSeed[] = [
  // --- §2.1 Ricavi ---------------------------------------------------------
  {
    code: 'ricavi_operativi',
    label: 'Ricavi Operativi',
    statement: 'CE',
    account_type: 'RICAVO',
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 10,
    // Il documento elenca esplicitamente il contributo a EBITDA/EBIT/Gross
    // Profit/Utile per questa sola sezione: riportato tale e quale. Il
    // contributo a cascata dei costi (§2.2, ultimo capoverso) dipende dallo
    // schema di riclassificazione scelto e si calcola in Fase 3, non si
    // memorizza qui.
    tags: [
      'Ricavi Totali',
      'Ricavi Operativi',
      'EBITDA',
      'EBIT',
      'Gross Profit',
      'Utile',
      'Vendite'
    ],
    detail_tags: []
  },
  {
    code: 'rimanenze_finali_ricavo',
    label: 'Rimanenze Finali (rettifica di ricavo)',
    statement: 'CE',
    account_type: 'RICAVO',
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 20,
    tags: ['Ricavi Totali', 'Rimanenze Finali', 'Variazione Rimanenze'],
    detail_tags: []
  },
  {
    code: 'proventi_straordinari',
    label: 'Proventi Straordinari',
    statement: 'CE',
    account_type: 'RICAVO',
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 30,
    tags: ['Ricavi Totali', 'Proventi Straordinari', 'Vendite'],
    detail_tags: []
  },
  {
    code: 'proventi_finanziari',
    label: 'Proventi Finanziari',
    statement: 'CE',
    account_type: 'RICAVO',
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 40,
    tags: ['Ricavi Totali', 'Proventi Finanziari'],
    detail_tags: []
  },

  // --- §2.2 Costi ----------------------------------------------------------
  {
    code: 'esistenze_iniziali',
    label: 'Esistenze Iniziali',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Variabili',
    default_direct_cost_pct: 100,
    sort_order: 110,
    tags: ['Costi Variabili', 'Rimanenze Iniziali'],
    detail_tags: []
  },
  {
    code: 'costi_materie_prime',
    label: 'Costi Materie Prime',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Variabili',
    default_direct_cost_pct: 100,
    sort_order: 120,
    tags: ['Costi Variabili', 'Costi Materie Prime'],
    detail_tags: []
  },
  {
    code: 'costi_produzione',
    label: 'Costi Produzione',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Variabili',
    default_direct_cost_pct: 100,
    sort_order: 130,
    tags: ['Costi Variabili', 'Costi Produzione'],
    detail_tags: []
  },
  {
    code: 'ammortamenti_operativi',
    label: 'Ammortamenti Operativi',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 0,
    sort_order: 140,
    tags: ['Costi Fissi', 'Ammortamenti Operativi'],
    detail_tags: []
  },
  {
    code: 'costi_personale',
    label: 'Costi Personale',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 70,
    sort_order: 150,
    tags: ['Costi Fissi', 'Costi Personale'],
    detail_tags: []
  },
  {
    code: 'costi_commerciali',
    label: 'Costi Commerciali',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 0,
    sort_order: 160,
    tags: ['Costi Fissi', 'Costi Commerciali'],
    detail_tags: []
  },
  {
    code: 'costi_generali_amministrativi',
    label: 'Costi Generali e Amministrativi',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 0,
    sort_order: 170,
    tags: ['Costi Fissi', 'Costi G&A'],
    detail_tags: []
  },
  {
    code: 'ammortamenti_non_operativi',
    label: 'Ammortamenti Non Operativi',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 0,
    sort_order: 180,
    tags: ['Costi Fissi', 'Ammortamenti Non Operativi'],
    detail_tags: []
  },
  {
    code: 'oneri_straordinari',
    label: 'Oneri Straordinari',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 0,
    sort_order: 190,
    tags: ['Costi Fissi', 'Oneri Straordinari'],
    detail_tags: []
  },
  {
    code: 'oneri_finanziari',
    label: 'Oneri Finanziari',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Fissi',
    default_direct_cost_pct: 0,
    sort_order: 200,
    tags: ['Costi Fissi', 'Oneri Finanziari'],
    detail_tags: []
  },
  {
    code: 'imposte',
    label: 'Imposte',
    statement: 'CE',
    account_type: 'COSTO',
    cost_behaviour: 'Costi Variabili',
    default_direct_cost_pct: 0,
    sort_order: 210,
    tags: ['Costi Variabili', 'Imposte'],
    detail_tags: []
  },

  // --- §2.3 Stato patrimoniale — attivo ------------------------------------
  {
    code: 'immobilizzazioni_immateriali',
    label: 'Immobilizzazioni Immateriali',
    statement: 'SP',
    account_type: "ATTIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 310,
    tags: ['Attivo Fisso Netto', 'Capitale Investito'],
    detail_tags: []
  },
  {
    code: 'immobilizzazioni_materiali',
    label: 'Immobilizzazioni Materiali',
    statement: 'SP',
    account_type: "ATTIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 320,
    tags: ['Attivo Fisso Netto', 'Capitale Investito'],
    detail_tags: []
  },
  {
    code: 'immobilizzazioni_finanziarie',
    label: 'Immobilizzazioni Finanziarie',
    statement: 'SP',
    account_type: "ATTIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 330,
    tags: ['Attivo Fisso Netto', 'Capitale Investito'],
    detail_tags: []
  },
  {
    code: 'rimanenze_finali_magazzino',
    label: 'Rimanenze Finali (magazzino)',
    statement: 'SP',
    account_type: "ATTIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 340,
    tags: ['Attivo Circolante', 'Capitale Investito', 'Magazzino'],
    detail_tags: []
  },
  {
    code: 'liquidita_differite',
    label: 'Liquidità Differite',
    statement: 'SP',
    account_type: "ATTIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 350,
    tags: ['Attivo Circolante', 'Capitale Investito'],
    detail_tags: ['Crediti Commerciali', 'Crediti Diversi', 'Erario c/IVA']
  },
  {
    code: 'liquidita_immediate',
    label: 'Liquidità Immediate',
    statement: 'SP',
    account_type: "ATTIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 360,
    tags: ['Attivo Circolante', 'Capitale Investito', 'Cassa/cc Banca'],
    detail_tags: []
  },

  // --- §2.4 Stato patrimoniale — passivo -----------------------------------
  {
    code: 'patrimonio_netto',
    label: 'Patrimonio Netto',
    statement: 'SP',
    account_type: "PASSIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 410,
    tags: ['Totale Passivo', 'Patrimonio Netto'],
    detail_tags: ['Utile a nuovo', 'Utile']
  },
  {
    code: 'debiti_medio_lungo',
    label: 'Debiti a Medio/Lungo Termine',
    statement: 'SP',
    account_type: "PASSIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 420,
    tags: ['Totale Passivo', 'Debiti a Medio/Lungo Termine'],
    detail_tags: ['Fondo TFR', 'Debiti Diversi']
  },
  {
    code: 'debiti_breve',
    label: 'Debiti a Breve Termine',
    statement: 'SP',
    account_type: "PASSIVITA'",
    cost_behaviour: null,
    default_direct_cost_pct: null,
    sort_order: 430,
    tags: ['Totale Passivo', 'Debiti a Breve Termine'],
    detail_tags: [
      'Debiti Diversi',
      'Debiti v/Fornitori (costi variabili)',
      'Debiti v/Fornitori (costi fissi)',
      'Debiti v/Enti Previdenziali'
    ]
  }
]

export function up(db: Database): void {
  const accountTypeCheck = ACCOUNT_TYPES.map((type) => `'${type.replace(/'/g, "''")}'`).join(', ')

  db.exec(`
    -- Catalogo delle sezioni di riclassificazione (§2). Dato di riferimento
    -- comune a tutte le aziende: è la metodologia del consulente, non una
    -- configurazione per cliente.
    CREATE TABLE account_sections (
      code                     TEXT PRIMARY KEY,
      label                    TEXT NOT NULL,
      statement                TEXT NOT NULL CHECK (statement IN ('CE', 'SP')),
      account_type             TEXT NOT NULL CHECK (account_type IN (${accountTypeCheck})),
      cost_behaviour           TEXT CHECK (cost_behaviour IN ('Costi Variabili', 'Costi Fissi')),
      default_direct_cost_pct  REAL CHECK (default_direct_cost_pct BETWEEN 0 AND 100),
      sort_order               INTEGER NOT NULL
    );

    -- Tag applicati a ogni conto della sezione.
    CREATE TABLE section_tags (
      section_code TEXT NOT NULL REFERENCES account_sections(code),
      tag          TEXT NOT NULL,
      PRIMARY KEY (section_code, tag)
    );

    -- Alternative fra cui il singolo conto ne sceglie una (le voci separate
    -- da "/" nelle tabelle §2.3-§2.4).
    CREATE TABLE section_detail_tags (
      section_code TEXT NOT NULL REFERENCES account_sections(code),
      tag          TEXT NOT NULL,
      sort_order   INTEGER NOT NULL,
      PRIMARY KEY (section_code, tag)
    );

    -- Piano dei conti di una singola azienda (§1-bis, §2).
    CREATE TABLE accounts (
      uuid              TEXT PRIMARY KEY,
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      -- Codice del conto mastro come appare nel piano dei conti del cliente.
      code              TEXT NOT NULL,
      name              TEXT NOT NULL,
      section_code      TEXT NOT NULL REFERENCES account_sections(code),
      -- ATTIVITA' NEGATIVO (fondo ammortamento, fondo svalutazione) è una
      -- distinzione del singolo conto, non della sezione: sta qui.
      account_type      TEXT NOT NULL CHECK (account_type IN (${accountTypeCheck})),
      -- Una delle alternative di section_detail_tags, quando la sezione ne offre.
      detail_tag        TEXT,
      -- Override per conto della % di costo diretto. NULL = eredita
      -- l'impostazione dell'azienda, e a sua volta il default di sezione.
      direct_cost_pct   REAL CHECK (direct_cost_pct BETWEEN 0 AND 100),
      active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      notes             TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_accounts_company_code
      ON accounts(company_uuid, code) WHERE deleted = 0;
    CREATE INDEX idx_accounts_section ON accounts(section_code);

    -- §2.2 e §7: la % di costo diretto di una sezione è sovrascrivibile per
    -- azienda in base al tipo di attività ("il tornitore e la pizzeria").
    CREATE TABLE company_section_settings (
      uuid             TEXT PRIMARY KEY,
      company_uuid     TEXT NOT NULL REFERENCES companies(uuid),
      section_code     TEXT NOT NULL REFERENCES account_sections(code),
      direct_cost_pct  REAL NOT NULL CHECK (direct_cost_pct BETWEEN 0 AND 100),
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      synced           INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted          INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_company_section_settings
      ON company_section_settings(company_uuid, section_code) WHERE deleted = 0;

    -- Periodi contabili (§1: "Anno", oppure Gennaio…Dicembre).
    -- Il conto economico è mensile, lo stato patrimoniale annuale (§10.4).
    CREATE TABLE fiscal_periods (
      uuid          TEXT PRIMARY KEY,
      company_uuid  TEXT NOT NULL REFERENCES companies(uuid),
      period_type   TEXT NOT NULL CHECK (period_type IN ('year', 'month')),
      year          INTEGER NOT NULL,
      month         INTEGER CHECK (month BETWEEN 1 AND 12),
      label         TEXT NOT NULL,
      -- Un periodo chiuso non viene più sovrascritto da un import:
      -- AGENTS.md §6 vieta di sovrascrivere in silenzio il lavoro del consulente.
      closed        INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      synced        INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),

      CHECK (
        (period_type = 'year'  AND month IS NULL) OR
        (period_type = 'month' AND month IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX idx_fiscal_periods_unique
      ON fiscal_periods(company_uuid, period_type, year, ifnull(month, 0))
      WHERE deleted = 0;

    -- Archivio dei file importati (§5 e §12): l'originale resta su disco, qui
    -- vivono nome e impronta per la tracciabilità e per bloccare i doppioni.
    CREATE TABLE import_documents (
      uuid          TEXT PRIMARY KEY,
      company_uuid  TEXT NOT NULL REFERENCES companies(uuid),
      kind          TEXT NOT NULL,
      filename      TEXT NOT NULL,
      sha256        TEXT NOT NULL,
      stored_path   TEXT,
      row_count     INTEGER,
      notes         TEXT,
      imported_at   TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      synced        INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_import_documents_hash
      ON import_documents(company_uuid, sha256) WHERE deleted = 0;

    -- Saldi: il dato grezzo da cui nasce ogni riclassificazione.
    -- Importi in CENTESIMI interi, mai float (vedi intestazione del file).
    CREATE TABLE account_balances (
      uuid                  TEXT PRIMARY KEY,
      company_uuid          TEXT NOT NULL REFERENCES companies(uuid),
      account_uuid          TEXT NOT NULL REFERENCES accounts(uuid),
      period_uuid           TEXT NOT NULL REFERENCES fiscal_periods(uuid),
      -- §3.4: le viste Budget/Consuntivo/Forecast del file del consulente.
      scenario              TEXT NOT NULL DEFAULT 'actual'
                            CHECK (scenario IN ('actual', 'budget', 'forecast')),
      amount_cents          INTEGER NOT NULL,
      import_document_uuid  TEXT REFERENCES import_documents(uuid),
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      synced                INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted               INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE UNIQUE INDEX idx_account_balances_unique
      ON account_balances(account_uuid, period_uuid, scenario) WHERE deleted = 0;
    CREATE INDEX idx_account_balances_period
      ON account_balances(company_uuid, period_uuid, scenario);
  `)

  const insertSection = db.prepare(
    `INSERT INTO account_sections
       (code, label, statement, account_type, cost_behaviour, default_direct_cost_pct, sort_order)
     VALUES (@code, @label, @statement, @account_type, @cost_behaviour,
             @default_direct_cost_pct, @sort_order)`
  )
  const insertTag = db.prepare('INSERT INTO section_tags (section_code, tag) VALUES (?, ?)')
  const insertDetailTag = db.prepare(
    'INSERT INTO section_detail_tags (section_code, tag, sort_order) VALUES (?, ?, ?)'
  )

  for (const section of SECTIONS) {
    const { tags, detail_tags, ...row } = section
    insertSection.run(row)
    for (const tag of tags) insertTag.run(section.code, tag)
    detail_tags.forEach((tag, index) => insertDetailTag.run(section.code, tag, index))
  }
}
