import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Documenti e richieste (versione 1.3.0, AGENTS.md §10.13-§10.14).
 *
 * - `requests`: il filo fra un'azienda e lo studio. La apre l'azienda (una
 *   chiamata da fare, una domanda, dei documenti mandati) o lo studio (per
 *   esempio "mi servono gli estratti conto"). Lo stato dice a che punto è —
 *   inviata, vista, presa in carico, in attesa dell'azienda, risolta — ed è
 *   quello che l'azienda guarda per sapere se qualcuno se ne sta occupando.
 *   `unread_*` accende il pallino di chi non ha ancora visto l'ultima novità.
 * - `request_events`: la storia della richiesta, messaggi compresi. Si scrive
 *   e basta: è la traccia di chi ha fatto cosa e quando.
 * - `documents`: il cassetto dei file dell'azienda. Il file sta su disco (o,
 *   sul telefono, nel database del browser); qui ci sono nome, impronta,
 *   chi l'ha caricato, se l'azienda lo vede (`shared`) e quando è stato aperto
 *   la prima volta dallo studio e dall'azienda.
 *
 * I nomi di chi scrive sono copiati (`*_name`): la storia deve restare leggibile
 * anche se un accesso viene eliminato.
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE requests (
      uuid              TEXT PRIMARY KEY,
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      number            INTEGER NOT NULL CHECK (number > 0),
      kind              TEXT NOT NULL CHECK (kind IN ('chiamata', 'domanda', 'documenti')),
      origin            TEXT NOT NULL CHECK (origin IN ('azienda', 'studio')),
      subject           TEXT NOT NULL,
      body              TEXT,
      status            TEXT NOT NULL DEFAULT 'inviata'
                          CHECK (status IN ('inviata', 'vista', 'in_carico', 'in_attesa', 'risolta', 'annullata')),
      urgent            INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1)),
      phone             TEXT,
      preferred_time    TEXT,
      callback_at       TEXT,
      due_date          TEXT,
      created_by_uuid   TEXT REFERENCES users(uuid),
      created_by_name   TEXT NOT NULL,
      assigned_uuid     TEXT REFERENCES users(uuid),
      assigned_name     TEXT,
      seen_at           TEXT,
      taken_at          TEXT,
      closed_at         TEXT,
      last_event_at     TEXT NOT NULL,
      unread_studio     INTEGER NOT NULL DEFAULT 0 CHECK (unread_studio IN (0, 1)),
      unread_company    INTEGER NOT NULL DEFAULT 0 CHECK (unread_company IN (0, 1)),
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      CHECK (kind <> 'chiamata' OR origin = 'azienda')
    );

    CREATE UNIQUE INDEX idx_requests_number ON requests(company_uuid, number);
    CREATE INDEX idx_requests_company ON requests(company_uuid, last_event_at) WHERE deleted = 0;
    CREATE INDEX idx_requests_open ON requests(status, last_event_at) WHERE deleted = 0;

    CREATE TABLE request_events (
      uuid            TEXT PRIMARY KEY,
      request_uuid    TEXT NOT NULL REFERENCES requests(uuid),
      company_uuid    TEXT NOT NULL REFERENCES companies(uuid),
      kind            TEXT NOT NULL
                        CHECK (kind IN ('creata', 'vista', 'messaggio', 'stato', 'documento', 'chiamata', 'richiamo', 'assegnata')),
      status          TEXT,
      text            TEXT,
      document_uuid   TEXT,
      author_uuid     TEXT REFERENCES users(uuid),
      author_name     TEXT NOT NULL,
      author_role     TEXT NOT NULL CHECK (author_role IN ('consultant', 'company')),
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      synced          INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted         INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE INDEX idx_request_events ON request_events(request_uuid, created_at);

    CREATE TABLE documents (
      uuid                  TEXT PRIMARY KEY,
      company_uuid          TEXT NOT NULL REFERENCES companies(uuid),
      name                  TEXT NOT NULL,
      ext                   TEXT,
      mime                  TEXT,
      size_bytes            INTEGER NOT NULL CHECK (size_bytes >= 0),
      sha256                TEXT NOT NULL,
      storage_key           TEXT NOT NULL,
      category              TEXT NOT NULL DEFAULT 'Altro',
      shared                INTEGER NOT NULL DEFAULT 1 CHECK (shared IN (0, 1)),
      note                  TEXT,
      request_uuid          TEXT REFERENCES requests(uuid),
      uploaded_by_uuid      TEXT REFERENCES users(uuid),
      uploaded_by_name      TEXT NOT NULL,
      uploaded_by_role      TEXT NOT NULL CHECK (uploaded_by_role IN ('consultant', 'company')),
      opened_by_studio_at   TEXT,
      opened_by_company_at  TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      synced                INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted               INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      -- Quello che manda l'azienda lo vede anche l'azienda.
      CHECK (uploaded_by_role = 'consultant' OR shared = 1)
    );

    CREATE INDEX idx_documents_company ON documents(company_uuid, created_at) WHERE deleted = 0;
    CREATE INDEX idx_documents_request ON documents(request_uuid) WHERE request_uuid IS NOT NULL;
  `)
}
