import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Impostazioni e utenti (versione 1.3.0, AGENTS.md §10.12).
 *
 * - `settings`: una riga per gruppo di impostazioni, il valore in JSON. Tre
 *   ambiti: `app` (tutto il programma, `owner_uuid` nullo), `user` (le
 *   preferenze di un utente), `company` (cosa vede l'azienda, e le impostazioni
 *   dei moduli di un'azienda). I predefiniti e la validazione stanno nel codice
 *   (`shared/settings.ts`): aggiungere un'impostazione non richiede una
 *   migrazione, e un database vecchio la riceve col suo predefinito.
 * - `users.phone` / `users.email`: servono alle richieste di chiamata (a che
 *   numero richiamare) e a far sapere all'azienda come contattare lo studio.
 *
 * Stessi campi di sincronizzazione di tutto il resto (§6).
 */
export function up(db: Database): void {
  db.exec(`
    ALTER TABLE users ADD COLUMN phone TEXT;
    ALTER TABLE users ADD COLUMN email TEXT;

    CREATE TABLE settings (
      uuid        TEXT PRIMARY KEY,
      scope       TEXT NOT NULL CHECK (scope IN ('app', 'user', 'company')),
      owner_uuid  TEXT,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL CHECK (json_valid(value)),
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      CHECK ((scope = 'app') = (owner_uuid IS NULL))
    );

    CREATE UNIQUE INDEX idx_settings_key
      ON settings(scope, ifnull(owner_uuid, ''), key) WHERE deleted = 0;
  `)
}
