import { randomUUID } from 'node:crypto'

/** Chiave primaria interna di ogni record — AGENTS.md §5: UUID v4. */
export function newUuid(): string {
  return randomUUID()
}

/** Timestamp ISO 8601 in UTC, formato usato da `created_at`/`updated_at`. */
export function nowIso(): string {
  return new Date().toISOString()
}
