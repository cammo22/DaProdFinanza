import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Corregge un vincolo troppo rigido introdotto dalla 002.
 *
 * L'indice univoco su `(company_uuid, sha256)` nasceva da AGENTS.md §5, che
 * chiede di **riconoscere** le doppie importazioni. Riconoscere però non è
 * vietare: lo stesso identico file viene legittimamente importato più volte —
 * come budget e come consuntivo, oppure su due periodi diversi quando il
 * consulente riusa un modello. Il vincolo lo impediva, e l'import falliva con
 * un errore di database invece di una spiegazione.
 *
 * Il riconoscimento resta dov'è utile: l'anteprima dice "questo identico file è
 * già stato importato il …" e lascia decidere a chi guarda.
 */
export function up(db: Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_import_documents_hash;

    -- Non più univoco: serve a ritrovare velocemente gli import dello stesso
    -- file, non a proibirli.
    CREATE INDEX idx_import_documents_hash
      ON import_documents(company_uuid, sha256);
  `)
}
