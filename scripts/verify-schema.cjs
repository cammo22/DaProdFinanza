/**
 * Controllo dei vincoli dello schema sul database reale.
 *
 * Apre il database cifrato dell'installazione locale con la stessa chiave
 * dell'app, prova una serie di inserimenti dentro una transazione e chiude con
 * ROLLBACK: non resta scritto nulla. Serve a verificare che i CHECK, le chiavi
 * esterne e gli indici univoci si comportino davvero come dichiarato, invece di
 * fidarsi del fatto che il CREATE TABLE non ha protestato.
 *
 *   npm run verify:schema     (con l'app chiusa, dopo averla avviata almeno
 *                              una volta con npm run demo)
 *
 * È CommonJS di proposito: Electron non accetta un `.mjs` come entry point da
 * riga di comando.
 */
const { app, safeStorage } = require('electron')
const Database = require('better-sqlite3-multiple-ciphers')
const { readFileSync, existsSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const { join } = require('node:path')

// Senza questo, un'esecuzione da riga di comando userebbe la cartella
// "Electron" invece di quella dell'applicazione.
app.setName('daprodfinanza')

let passed = 0
let failed = 0

function check(description, run, expectation) {
  let error = null
  try {
    run()
  } catch (caught) {
    error = caught
  }

  const ok = expectation === 'accettato' ? error === null : error !== null
  if (ok) {
    passed++
    console.log(`  ok       ${description}`)
  } else {
    failed++
    console.log(`  FALLITO  ${description} — atteso ${expectation}, ottenuto: ${error ?? 'nessun errore'}`)
  }
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  const keyFile = join(userData, 'secrets', 'db-key.bin')
  const dbFile = join(userData, 'daprodfinanza.db')

  if (!existsSync(keyFile) || !existsSync(dbFile)) {
    console.error(`Nessun database in ${userData}. Avvia prima l'app (npm run demo).`)
    return app.exit(1)
  }

  const db = new Database(dbFile)
  db.pragma(`cipher = 'sqlcipher'`)
  db.pragma(`key = "x'${safeStorage.decryptString(readFileSync(keyFile))}'"`)
  db.pragma('foreign_keys = ON')

  const company = db.prepare('SELECT uuid FROM companies WHERE deleted = 0 LIMIT 1').get()
  if (!company) {
    console.error("Serve almeno un'azienda in anagrafica: avvia l'app con npm run demo.")
    db.close()
    return app.exit(1)
  }

  const now = new Date().toISOString()
  // Anni e codici che non possono scontrarsi con dati veri: il controllo gira
  // sul database dell'installazione, che di solito è già popolato.
  const ANNO = 2999
  const ANNO_PREC = 2998
  const suffisso = randomUUID().slice(0, 8)
  const codice = (n) => `ZZ-${suffisso}-${n}`
  const accountUuid = randomUUID()
  const yearUuid = randomUUID()
  const monthUuid = randomUUID()

  db.exec('BEGIN')
  try {
    console.log(
      `\nSchema v${db.pragma('user_version', { simple: true })} — vincoli del motore finanziario\n`
    )

    const insertAccount = (uuid, code, section, type, pct) =>
      db
        .prepare(
          `INSERT INTO accounts (uuid, company_uuid, code, name, section_code, account_type,
                                 direct_cost_pct, active, created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, 'Conto di prova', ?, ?, ?, 1, ?, ?, 0, 0)`
        )
        .run(uuid, company.uuid, code, section, type, pct, now, now)

    console.log(' Piano dei conti')
    check('conto valido', () => insertAccount(accountUuid, codice(1), 'costi_personale', 'COSTO', null), 'accettato')
    check('sezione inesistente', () => insertAccount(randomUUID(), codice(2), 'sezione_inventata', 'COSTO', null), 'rifiutato')
    check("TIPO fuori dai cinque di §1", () => insertAccount(randomUUID(), codice(3), 'costi_personale', 'SPESA', null), 'rifiutato')
    check('% di costo diretto oltre 100', () => insertAccount(randomUUID(), codice(4), 'costi_personale', 'COSTO', 120), 'rifiutato')
    check('codice conto duplicato nella stessa azienda', () => insertAccount(randomUUID(), codice(1), 'costi_personale', 'COSTO', null), 'rifiutato')
    check('fondo ammortamento come ATTIVITA’ NEGATIVO', () => insertAccount(randomUUID(), codice(5), 'immobilizzazioni_materiali', "ATTIVITA' NEGATIVO", null), 'accettato')

    const insertPeriod = (uuid, type, year, month) =>
      db
        .prepare(
          `INSERT INTO fiscal_periods (uuid, company_uuid, period_type, year, month, label,
                                       closed, created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, ?, 'periodo di prova', 0, ?, ?, 0, 0)`
        )
        .run(uuid, company.uuid, type, year, month, now, now)

    console.log('\n Periodi contabili')
    check('anno', () => insertPeriod(yearUuid, 'year', ANNO, null), 'accettato')
    check('mese', () => insertPeriod(monthUuid, 'month', ANNO, 1), 'accettato')
    check('anno con mese valorizzato', () => insertPeriod(randomUUID(), 'year', ANNO_PREC, 3), 'rifiutato')
    check('mese senza mese', () => insertPeriod(randomUUID(), 'month', ANNO_PREC, null), 'rifiutato')
    check('mese 13', () => insertPeriod(randomUUID(), 'month', ANNO_PREC, 13), 'rifiutato')
    check('anno duplicato', () => insertPeriod(randomUUID(), 'year', ANNO, null), 'rifiutato')
    check('mese duplicato', () => insertPeriod(randomUUID(), 'month', ANNO, 1), 'rifiutato')
    check('stesso mese di un altro anno', () => insertPeriod(randomUUID(), 'month', ANNO_PREC, 1), 'accettato')

    const insertBalance = (uuid, account, period, scenario, cents) =>
      db
        .prepare(
          `INSERT INTO account_balances (uuid, company_uuid, account_uuid, period_uuid, scenario,
                                         amount_cents, created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
        )
        .run(uuid, company.uuid, account, period, scenario, cents, now, now)

    const insertDoc = (uuid, sha) =>
      db
        .prepare(
          `INSERT INTO import_documents (uuid, company_uuid, kind, filename, sha256,
                                         imported_at, created_at, updated_at, synced, deleted)
           VALUES (?, ?, 'excel_chart_of_accounts', 'prova.xlsx', ?, ?, ?, ?, 0, 0)`
        )
        .run(uuid, company.uuid, sha, now, now, now)

    console.log(''); console.log(' Documenti importati')
    check('primo import di un file', () => insertDoc(randomUUID(), suffisso.padEnd(64, 'a')), 'accettato')
    // Regressione: fino alla migrazione 003 un indice univoco impediva di
    // importare lo stesso file due volte — cosa legittima, per esempio come
    // budget e come consuntivo. Riconoscere un doppione non e' vietarlo.
    check('stesso file importato di nuovo', () => insertDoc(randomUUID(), suffisso.padEnd(64, 'a')), 'accettato')

    console.log('\n Saldi')
    check('saldo a consuntivo', () => insertBalance(randomUUID(), accountUuid, monthUuid, 'actual', 1234567), 'accettato')
    check('saldo negativo (le rettifiche esistono)', () => insertBalance(randomUUID(), accountUuid, yearUuid, 'actual', -50000), 'accettato')
    check('stesso conto e periodo, scenario diverso', () => insertBalance(randomUUID(), accountUuid, monthUuid, 'budget', 1300000), 'accettato')
    check('stesso conto, periodo e scenario', () => insertBalance(randomUUID(), accountUuid, monthUuid, 'actual', 999), 'rifiutato')
    check('scenario inventato', () => insertBalance(randomUUID(), accountUuid, yearUuid, 'consuntivo', 100), 'rifiutato')
    check('saldo su un conto inesistente', () => insertBalance(randomUUID(), randomUUID(), monthUuid, 'actual', 100), 'rifiutato')

    const insertItem = (fields) => {
      const row = {
        direction: 'in',
        source: 'scadenziario',
        due_date: `${ANNO}-01-31`,
        amount_cents: 10000,
        paid_cents: 0,
        paid_date: null,
        recurrence: 'none',
        payment_terms: null,
        ...fields
      }
      db.prepare(
        `INSERT INTO treasury_items (uuid, company_uuid, direction, source, category, description,
                                     payment_terms, due_date, amount_cents, paid_cents, paid_date,
                                     recurrence, created_at, updated_at, synced, deleted)
         VALUES (?, ?, ?, ?, 'Clienti', 'prova', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      ).run(
        randomUUID(), company.uuid, row.direction, row.source, row.payment_terms, row.due_date,
        row.amount_cents, row.paid_cents, row.paid_date, row.recurrence, now, now
      )
    }

    console.log('\n Tesoreria e scadenziario')
    check('fattura da incassare', () => insertItem({}), 'accettato')
    check('incasso parziale con data', () => insertItem({ paid_cents: 4000, paid_date: `${ANNO}-02-01` }), 'accettato')
    check('previsione manuale ricorrente', () => insertItem({ source: 'manuale', direction: 'out', recurrence: 'monthly' }), 'accettato')
    check('importo zero', () => insertItem({ amount_cents: 0 }), 'rifiutato')
    check('incassato più del totale', () => insertItem({ paid_cents: 20000, paid_date: `${ANNO}-02-01` }), 'rifiutato')
    check('data di incasso senza importo incassato', () => insertItem({ paid_date: `${ANNO}-02-01` }), 'rifiutato')
    check('fattura dello scadenziario ricorrente', () => insertItem({ recurrence: 'monthly' }), 'rifiutato')
    check('verso inventato', () => insertItem({ direction: 'entrata' }), 'rifiutato')
    check('condizione di pagamento fuori dizionario', () => insertItem({ payment_terms: 'XX' }), 'rifiutato')

    // Un'azienda temporanea, perché quella esistente può avere già le sue
    // impostazioni e l'indice univoco le proteggerebbe.
    const clientUuid = randomUUID()
    const tempCompany = randomUUID()
    db.prepare(
      `INSERT INTO clients (uuid, code, name, archived, created_at, updated_at, synced, deleted)
       VALUES (?, ?, 'Cliente di prova', 0, ?, ?, 0, 0)`
    ).run(clientUuid, codice('CLI'), now, now)
    db.prepare(
      `INSERT INTO companies (uuid, client_uuid, code, name, archived, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, 'Azienda di prova', 0, ?, ?, 0, 0)`
    ).run(tempCompany, clientUuid, codice('AZ'), now, now)

    const insertSettings = (cash, date, min = 100) =>
      db
        .prepare(
          `INSERT INTO company_treasury_settings (uuid, company_uuid, min_liquidity_cents,
                                                  opening_cash_cents, opening_cash_date,
                                                  created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
        )
        .run(randomUUID(), tempCompany, min, cash, date, now, now)

    check('saldo di cassa senza data', () => insertSettings(5000, null), 'rifiutato')
    check('soglia minima negativa', () => insertSettings(null, null, -1), 'rifiutato')
    check('impostazioni valide', () => insertSettings(5000, `${ANNO}-01-01`), 'accettato')
    check('seconde impostazioni per la stessa azienda', () => insertSettings(null, null), 'rifiutato')

    console.log('\n Banche e finanziamenti')
    const bankUuid = randomUUID()
    const insertBank = (uuid, name) =>
      db
        .prepare(
          `INSERT INTO banks (uuid, company_uuid, name, created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, ?, 0, 0)`
        )
        .run(uuid, tempCompany, name, now, now)
    check('istituto', () => insertBank(bankUuid, 'Banca di prova'), 'accettato')
    check('stesso istituto con le maiuscole diverse', () => insertBank(randomUUID(), 'BANCA DI PROVA'), 'rifiutato')

    const insertLine = (kind, granted, used, bank = bankUuid) =>
      db
        .prepare(
          `INSERT INTO credit_lines (uuid, company_uuid, bank_uuid, kind, label, granted_cents, used_cents,
                                     created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, 'linea', ?, ?, ?, ?, 0, 0)`
        )
        .run(randomUUID(), tempCompany, bank, kind, granted, used, now, now)
    check('fido di cassa', () => insertLine('fido_cassa', 3000000, 500000), 'accettato')
    check('sconfinamento (utilizzato oltre l’accordato)', () => insertLine('carta', 100000, 150000), 'accettato')
    check('tipo di linea inventato', () => insertLine('mutuo', 100000, 0), 'rifiutato')
    check('linea su un istituto inesistente', () => insertLine('fido_cassa', 100000, 0, randomUUID()), 'rifiutato')

    const insertLoan = (fields) => {
      const row = {
        kind: 'mutuo',
        principal: 10000000,
        rate: 4.2,
        installments: 96,
        frequency: 'monthly',
        grace: 0,
        amortization: 'francese',
        balloon: 0,
        ...fields
      }
      db.prepare(
        `INSERT INTO loans (uuid, company_uuid, bank_uuid, kind, label, principal_cents,
                            annual_rate_percent, first_due_date, installments, frequency,
                            grace_installments, amortization, balloon_cents,
                            created_at, updated_at, synced, deleted)
         VALUES (?, ?, ?, ?, 'prestito', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      ).run(
        randomUUID(), tempCompany, bankUuid, row.kind, row.principal, row.rate, `${ANNO}-01-31`,
        row.installments, row.frequency, row.grace, row.amortization, row.balloon, now, now
      )
    }
    check('mutuo', () => insertLoan({}), 'accettato')
    check('leasing con riscatto', () => insertLoan({ kind: 'leasing', balloon: 1000000 }), 'accettato')
    check('preammortamento lungo quanto tutto il piano', () => insertLoan({ grace: 96 }), 'rifiutato')
    check('riscatto pari al capitale', () => insertLoan({ balloon: 10000000 }), 'rifiutato')
    check('periodicità inventata', () => insertLoan({ frequency: 'weekly' }), 'rifiutato')
    check('tasso negativo', () => insertLoan({ rate: -1 }), 'rifiutato')
    check('ammortamento inventato', () => insertLoan({ amortization: 'tedesco' }), 'rifiutato')

    console.log('\n Scenari di simulazione')
    const insertScenario = (name, params) =>
      db
        .prepare(
          `INSERT INTO simulation_scenarios (uuid, company_uuid, name, params,
                                             created_at, updated_at, synced, deleted)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
        )
        .run(randomUUID(), tempCompany, name, params, now, now)
    check('scenario', () => insertScenario('Espansione', '{"ricaviPercent":10}'), 'accettato')
    check('stesso nome con le maiuscole diverse', () => insertScenario('ESPANSIONE', '{}'), 'rifiutato')
    check('parametri che non sono JSON', () => insertScenario('Rotto', 'ricavi +10'), 'rifiutato')
  } finally {
    db.exec('ROLLBACK')
    db.close()
  }

  console.log(`\n${passed} superati, ${failed} falliti — nessuna scrittura conservata.\n`)
  app.exit(failed === 0 ? 0 : 1)
})
