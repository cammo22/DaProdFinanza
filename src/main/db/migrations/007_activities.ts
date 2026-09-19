import type { Database } from 'better-sqlite3-multiple-ciphers'

/**
 * Attività e Tempi (AGENTS.md §10.11): le cose da fare per un'azienda e il
 * tempo che il consulente ci spende.
 *
 * - `tasks`: la bacheca. `position` è REAL così un'attività si infila fra due
 *   senza rinumerare la colonna.
 * - `time_entries`: una voce per ogni tratto di lavoro. Il timer acceso è la
 *   voce con `started_at` e senza `ended_at`; alla chiusura si scrivono i
 *   minuti. Le voci a mano hanno solo `minutes`. `work_date` è il giorno
 *   locale, perché le ore si contano sul calendario di chi lavora.
 * - `activity_settings`: la tariffa oraria per azienda (facoltativa).
 */
export function up(db: Database): void {
  db.exec(`
    CREATE TABLE tasks (
      uuid              TEXT PRIMARY KEY,
      company_uuid      TEXT NOT NULL REFERENCES companies(uuid),
      title             TEXT NOT NULL,
      notes             TEXT,
      status            TEXT NOT NULL DEFAULT 'todo'
                          CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
      priority          TEXT NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      due_date          TEXT,
      estimate_minutes  INTEGER CHECK (estimate_minutes IS NULL OR estimate_minutes >= 0),
      position          REAL NOT NULL DEFAULT 0,
      completed_at      TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      synced            INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted           INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
    );

    CREATE INDEX idx_tasks_company ON tasks(company_uuid, status) WHERE deleted = 0;

    CREATE TABLE time_entries (
      uuid          TEXT PRIMARY KEY,
      company_uuid  TEXT NOT NULL REFERENCES companies(uuid),
      task_uuid     TEXT REFERENCES tasks(uuid),
      description   TEXT,
      work_date     TEXT NOT NULL,
      started_at    TEXT,
      ended_at      TEXT,
      minutes       INTEGER CHECK (minutes IS NULL OR minutes >= 0),
      billable      INTEGER NOT NULL DEFAULT 1 CHECK (billable IN (0, 1)),
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      synced        INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
      deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
      CHECK (ended_at IS NULL OR started_at IS NOT NULL),
      CHECK (started_at IS NOT NULL OR minutes IS NOT NULL)
    );

    CREATE INDEX idx_time_entries_company ON time_entries(company_uuid, work_date) WHERE deleted = 0;
    CREATE INDEX idx_time_entries_running ON time_entries(started_at)
      WHERE ended_at IS NULL AND started_at IS NOT NULL AND deleted = 0;

    CREATE TABLE activity_settings (
      company_uuid       TEXT PRIMARY KEY REFERENCES companies(uuid),
      hourly_rate_cents  INTEGER CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents >= 0),
      updated_at         TEXT NOT NULL,
      synced             INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
    );
  `)
}
