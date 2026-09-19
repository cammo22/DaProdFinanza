/**
 * Un Express minimo che gira nel browser, per la versione Android.
 *
 * Le rotte del backend (`src/main/server/routes`) sono scritte per Express: qui
 * c'è quanto basta perché funzionino identiche senza un server HTTP — router
 * annidati con parametri (`/:uuid`), middleware, gestori che lanciano errori
 * (sincroni o `async`), e il gestore d'errore finale a quattro argomenti.
 * La "richiesta" arriva da `fetch` intercettata (vedi ../bridge.ts).
 */

export interface Request {
  method: string
  url: string
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body: unknown
  headers: Record<string, string>
  header(name: string): string | undefined
  auth?: unknown
  [key: string]: unknown
}

export interface Response {
  statusCode: number
  status(code: number): Response
  json(body: unknown): Response
  send(body?: unknown): Response
  sendStatus(code: number): Response
  end(): Response
  set(...args: unknown[]): Response
  setHeader(...args: unknown[]): Response
  type(...args: unknown[]): Response
}

export type NextFunction = (err?: unknown) => void
type Handler = (req: Request, res: Response, next: NextFunction) => unknown
type ErrorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => unknown
type Layer = {
  method: string | null
  regex: RegExp
  keys: string[]
  /** true: la rotta deve combaciare tutta; false: basta il prefisso (use). */
  end: boolean
  handler: Handler | ErrorHandler | RouterImpl
}

function compila(path: string, end: boolean): { regex: RegExp; keys: string[] } {
  const keys: string[] = []
  const pulito = path === '/' ? '' : path.replace(/\/$/, '')
  const corpo = pulito
    .split('/')
    .map((parte) =>
      parte.startsWith(':')
        ? (keys.push(parte.slice(1)), '([^/]+)')
        : parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('/')
  return { regex: new RegExp(`^${corpo}${end ? '/?$' : '(?=/|$)'}`, 'i'), keys }
}

export class RouterImpl {
  private readonly stack: Layer[] = []

  constructor(_opzioni?: { mergeParams?: boolean }) {}

  private aggiungi(method: string | null, path: string, handlers: unknown[]): this {
    for (const h of handlers.flat()) {
      const { regex, keys } = compila(path, method !== null)
      this.stack.push({ method, regex, keys, end: method !== null, handler: h as Layer['handler'] })
    }
    return this
  }

  use(...args: unknown[]): this {
    return typeof args[0] === 'string'
      ? this.aggiungi(null, args[0], args.slice(1))
      : this.aggiungi(null, '/', args)
  }

  get(path: string, ...h: unknown[]): this {
    return this.aggiungi('GET', path, h)
  }
  post(path: string, ...h: unknown[]): this {
    return this.aggiungi('POST', path, h)
  }
  put(path: string, ...h: unknown[]): this {
    return this.aggiungi('PUT', path, h)
  }
  patch(path: string, ...h: unknown[]): this {
    return this.aggiungi('PATCH', path, h)
  }
  delete(path: string, ...h: unknown[]): this {
    return this.aggiungi('DELETE', path, h)
  }

  /** Percorre i livelli come Express: `path` è relativo al punto di montaggio. */
  handle(req: Request, res: Response, path: string, done: NextFunction): void {
    let i = 0
    const parametriBase = req.params

    const next = (err?: unknown): void => {
      if ((res as { finito?: boolean }).finito) return
      while (i < this.stack.length) {
        const layer = this.stack[i++]
        if (layer.method && layer.method !== req.method) continue
        const m = layer.regex.exec(path)
        if (!m) continue

        const params = { ...parametriBase }
        layer.keys.forEach((k, j) => (params[k] = decodeURIComponent(m[j + 1] ?? '')))
        req.params = params

        const h = layer.handler
        if (h instanceof RouterImpl) {
          if (err) continue
          const resto = path.slice(m[0].length) || '/'
          h.handle(req, res, resto.startsWith('/') ? resto : `/${resto}`, (e) => {
            req.params = parametriBase
            next(e)
          })
          return
        }

        const perErrori = h.length === 4
        if (Boolean(err) !== perErrori) continue
        try {
          const out = perErrori
            ? (h as ErrorHandler)(err, req, res, next)
            : (h as Handler)(req, res, next)
          // Express 5: una promessa rifiutata diventa next(errore).
          if (out && typeof (out as Promise<unknown>).then === 'function') {
            ;(out as Promise<unknown>).catch((e) => next(e ?? new Error('Errore')))
          }
        } catch (e) {
          next(e)
        }
        return
      }
      done(err)
    }

    next()
  }
}

export function Router(opzioni?: { mergeParams?: boolean }): RouterImpl {
  return new RouterImpl(opzioni)
}
export type Router = RouterImpl

export interface Risposta {
  status: number
  body: unknown
}

export class App extends RouterImpl {
  /** Una richiesta completa: risolve con lo stato e il corpo JSON della risposta. */
  richiesta(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<Risposta> {
    return new Promise((resolve) => {
      const u = new URL(url, 'http://locale')
      const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
      const req: Request = {
        method: method.toUpperCase(),
        url: u.pathname + u.search,
        path: u.pathname,
        params: {},
        query: Object.fromEntries(u.searchParams.entries()),
        body,
        headers: lower,
        header: (name: string) => lower[name.toLowerCase()]
      }
      const res = {
        statusCode: 200,
        finito: false,
        status(code: number) {
          res.statusCode = code
          return res
        },
        json(corpo: unknown) {
          if (res.finito) return res
          res.finito = true
          resolve({ status: res.statusCode, body: corpo === undefined ? null : corpo })
          return res
        },
        send(corpo?: unknown) {
          return res.json(corpo ?? null)
        },
        sendStatus(code: number) {
          res.statusCode = code
          return res.json(null)
        },
        end() {
          return res.json(null)
        },
        set: () => res,
        setHeader: () => res,
        type: () => res
      }
      this.handle(req, res as unknown as Response, u.pathname, (err) => {
        if (!res.finito) {
          console.error('[server] errore non gestito:', err)
          res.statusCode = 500
          res.json({ error: err ? 'Errore interno.' : 'Risorsa non trovata.' })
        }
      })
    })
  }

  listen(): never {
    throw new Error('Nella versione Android non c’è un server in ascolto.')
  }
}

type Express = App & { json: typeof json }

function json(): Handler {
  return (_req, _res, next) => next()
}

function express(): App {
  return new App()
}
express.json = json
express.Router = Router

export default express as unknown as (() => Express) & { json: typeof json; Router: typeof Router }
