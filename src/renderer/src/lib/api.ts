import type { ApiError } from '@shared/types'

/**
 * Client REST verso il backend Express locale (AGENTS.md §2/§3).
 * La base URL non è nota a compile time: la porta è effimera e arriva dal
 * processo main attraverso il preload.
 */
let baseUrl: string | null = null
let token: string | null = null

const TOKEN_KEY = 'daprodfinanza.token'

export async function initApi(): Promise<{ version: string; demoBuild: boolean }> {
  const info = await window.daprod.getAppInfo()
  baseUrl = info.apiBaseUrl
  token = sessionStorage.getItem(TOKEN_KEY)
  return { version: info.version, demoBuild: info.demoBuild }
}

export function setToken(value: string | null): void {
  token = value
  if (value) sessionStorage.setItem(TOKEN_KEY, value)
  else sessionStorage.removeItem(TOKEN_KEY)
}

export function getToken(): string | null {
  return token
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!baseUrl) throw new ApiRequestError(0, 'Backend locale non ancora disponibile.')

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new ApiRequestError(0, 'Impossibile raggiungere il server locale.')
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const message = (payload as ApiError | null)?.error ?? `Errore ${response.status}.`
    segnalaSessione(response.status, message)
    throw new ApiRequestError(response.status, message)
  }

  return payload as T
}

/**
 * Evento per "la sessione non vale più" (scaduta, o accesso disattivato da un
 * consulente): l'app torna alla schermata d'ingresso e dice perché, invece di
 * riempire ogni riquadro dello stesso errore.
 */
export const EVENTO_SESSIONE = 'daprod:sessione-finita'

function segnalaSessione(status: number, message: string): void {
  if (status === 401 && token) window.dispatchEvent(new CustomEvent(EVENTO_SESSIONE, { detail: message }))
}

/**
 * File: si mandano così come sono (niente JSON, niente base64) e si ricevono
 * come Blob. Il nome viaggia in un'intestazione, codificato perché può
 * contenere accenti e spazi.
 */
async function binary(
  method: 'GET' | 'POST',
  path: string,
  body?: Blob | ArrayBuffer,
  headers: Record<string, string> = {}
): Promise<Response> {
  if (!baseUrl) throw new ApiRequestError(0, 'Backend locale non ancora disponibile.')
  const h: Record<string, string> = { ...headers }
  if (token) h['Authorization'] = `Bearer ${token}`
  if (body !== undefined) h['Content-Type'] = 'application/octet-stream'
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { method, headers: h, body })
  } catch {
    throw new ApiRequestError(0, 'Impossibile raggiungere il server locale.')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = (payload as ApiError | null)?.error ?? `Errore ${response.status}.`
    segnalaSessione(response.status, message)
    throw new ApiRequestError(response.status, message)
  }
  return response
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /** Scarica un file: il contenuto e il tipo dichiarato dal server. */
  blob: async (path: string): Promise<Blob> => (await binary('GET', path)).blob(),
  /** Carica un file così com'è; `headers` porta nome e dettagli. Risponde JSON. */
  upload: async <T>(path: string, file: Blob, headers: Record<string, string>): Promise<T> =>
    (await (await binary('POST', path, file, headers)).json()) as T
}
