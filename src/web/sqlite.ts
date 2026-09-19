import type { Database as SqlJsDatabase, SqlValue } from 'sql.js'

/**
 * Lo stesso modo di parlare al database di better-sqlite3, sopra sql.js
 * (SQLite compilato in WebAssembly).
 *
 * Nella versione Android i servizi del backend sono esattamente quelli del
 * programma per computer: invece di riscriverli, gli si dà un database che
 * risponde come quello a cui sono abituati. Copre solo ciò che il codice usa:
 * `prepare().get/all/run`, `exec`, `pragma`, `transaction`.
 *
 * Le istruzioni si preparano e si liberano a ogni esecuzione: sql.js le tiene
 * in memoria WebAssembly finché non le si libera, ed esportare il database
 * (per salvarlo) le invaliderebbe comunque.
 */

type Params = unknown[]

function valore(v: unknown): SqlValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return Number(v)
  return v as SqlValue
}

/**
 * better-sqlite3 accetta parametri posizionali, un array, oppure un oggetto
 * per i nomi `@x`/`:x`/`$x` scritti senza prefisso. sql.js vuole il prefisso:
 * si offrono tutti e tre, quelli che l'istruzione non usa vengono ignorati.
 */
function binding(params: Params): SqlValue[] | Record<string, SqlValue> | undefined {
  if (params.length === 0) return undefined
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const out: Record<string, SqlValue> = {}
    for (const [k, v] of Object.entries(params[0] as Record<string, unknown>)) {
      const x = valore(v)
      out[`@${k}`] = x
      out[`:${k}`] = x
      out[`$${k}`] = x
    }
    return out
  }
  return params.flat().map(valore)
}

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export class Statement {
  constructor(
    private readonly db: CompatDatabase,
    private readonly sql: string
  ) {}

  private righe(params: Params, limite?: number): Record<string, SqlValue>[] {
    const stmt = this.db.raw.prepare(this.sql)
    try {
      const b = binding(params)
      if (b) stmt.bind(b)
      const out: Record<string, SqlValue>[] = []
      while (stmt.step()) {
        out.push(stmt.getAsObject())
        if (limite && out.length >= limite) break
      }
      return out
    } finally {
      stmt.free()
    }
  }

  get(...params: Params): unknown {
    return this.righe(params, 1)[0]
  }

  all(...params: Params): unknown[] {
    return this.righe(params)
  }

  run(...params: Params): RunResult {
    const stmt = this.db.raw.prepare(this.sql)
    try {
      const b = binding(params)
      if (b) stmt.bind(b)
      while (stmt.step()) {
        // un INSERT … RETURNING o simili: si scorre fino in fondo
      }
    } finally {
      stmt.free()
    }
    const changes = this.db.raw.getRowsModified()
    const id = this.db.raw.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0]
    this.db.segnaModifica()
    return { changes, lastInsertRowid: Number(id ?? 0) }
  }
}

export class CompatDatabase {
  private profondita = 0
  private versione = 0

  constructor(readonly raw: SqlJsDatabase) {}

  prepare(sql: string): Statement {
    return new Statement(this, sql)
  }

  exec(sql: string): this {
    this.raw.exec(sql)
    this.segnaModifica()
    return this
  }

  /** `pragma('x')`, `pragma('x = y')`; con `{ simple: true }` il primo valore. */
  pragma(testo: string, opzioni?: { simple?: boolean }): unknown {
    const r = this.raw.exec(`PRAGMA ${testo}`)
    if (opzioni?.simple) return r[0]?.values[0]?.[0]
    const res = r[0]
    if (!res) return []
    return res.values.map((riga) => Object.fromEntries(res.columns.map((c, i) => [c, riga[i]])))
  }

  /**
   * Come in better-sqlite3: restituisce una funzione che esegue `fn` dentro
   * una transazione. Annidate diventano savepoint.
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      const nome = `sp${this.profondita}`
      const annidata = this.profondita > 0
      this.raw.exec(annidata ? `SAVEPOINT ${nome}` : 'BEGIN')
      this.profondita++
      try {
        const out = fn(...args)
        this.profondita--
        this.raw.exec(annidata ? `RELEASE ${nome}` : 'COMMIT')
        return out
      } catch (err) {
        this.profondita--
        this.raw.exec(annidata ? `ROLLBACK TO ${nome}; RELEASE ${nome}` : 'ROLLBACK')
        throw err
      }
    }
  }

  /** Cresce a ogni scrittura: dice a chi salva se c'è qualcosa di nuovo. */
  segnaModifica(): void {
    this.versione++
  }

  get modifiche(): number {
    return this.versione
  }

  get inTransazione(): boolean {
    return this.profondita > 0
  }

  close(): void {
    this.raw.close()
  }
}
