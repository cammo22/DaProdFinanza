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
  } finally {
    db.exec('ROLLBACK')
    db.close()
  }

  console.log(`\n${passed} superati, ${failed} falliti — nessuna scrittura conservata.\n`)
  app.exit(failed === 0 ? 0 : 1)
})
