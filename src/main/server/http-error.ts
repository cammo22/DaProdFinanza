/** Errore applicativo con status HTTP: il gestore centrale lo traduce in `{ error }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
