import { useEffect, useState } from 'react'
import { PREFERRED_TIMES, type RequestItem, type RequestKind } from '@shared/documents'
import type { Profile } from '@shared/types'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { segnalaAzione } from '../lib/inbox'
import { Alert, Button, Field, Interruttore, Modal, Select, TextArea, TextInput } from './ui'

/**
 * Una richiesta nuova (AGENTS.md §10.14).
 *
 * L'azienda chiede una chiamata (motivo, numero, quando) o scrive una domanda.
 * Lo studio può chiedere qualcosa all'azienda: una risposta o dei documenti,
 * con una scadenza — e la richiesta parte "in attesa dell'azienda".
 */
export function NewRequestDialog({
  companyUuid,
  tipo,
  onClose,
  onCreata
}: {
  companyUuid: string
  tipo: RequestKind
  onClose: () => void
  onCreata: (r: RequestItem) => void
}): React.JSX.Element {
  const { user } = useAuth()
  const studio = user?.role === 'consultant'
  const [oggetto, setOggetto] = useState('')
  const [testo, setTesto] = useState('')
  const [telefono, setTelefono] = useState('')
  const [quando, setQuando] = useState('subito')
  const [urgente, setUrgente] = useState(false)
  const [scadenza, setScadenza] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Il numero da richiamare è quello del profilo: basta confermarlo.
  useEffect(() => {
    if (tipo !== 'chiamata') return
    api.get<Profile>('/api/auth/me').then((p) => setTelefono((t) => t || p.phone || ''))
  }, [tipo])

  const invia = async (): Promise<void> => {
    setBusy(true)
    setErrore(null)
    try {
      const r = await api.post<RequestItem>(`/api/companies/${companyUuid}/requests`, {
        kind: tipo,
        subject: oggetto,
        body: testo,
        phone: tipo === 'chiamata' ? telefono : undefined,
        preferred_time: tipo === 'chiamata' ? quando : undefined,
        urgent: urgente,
        due_date: studio && scadenza ? scadenza : undefined
      })
      segnalaAzione()
      onCreata(r)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Richiesta non inviata.')
    } finally {
      setBusy(false)
    }
  }

  const titolo =
    tipo === 'chiamata'
      ? 'Chiedi una chiamata'
      : studio
        ? tipo === 'documenti'
          ? 'Chiedi dei documenti all’azienda'
          : 'Scrivi all’azienda'
        : 'Scrivi una domanda allo studio'

  return (
    <Modal
      title={titolo}
      subtitle={
        tipo === 'chiamata'
          ? 'Lo studio riceve la richiesta subito: ti chiama, ti dice quando richiama o ti risponde per scritto. Qui vedi a che punto è.'
          : studio
            ? 'L’azienda la trova nelle sue richieste, con la scadenza. Tu vedi quando risponde.'
            : 'Lo studio risponde qui, per scritto. Vedi quando la legge e chi se ne occupa.'
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        {errore && <Alert>{errore}</Alert>}
        <Field label={tipo === 'chiamata' ? 'Motivo della chiamata' : 'Oggetto'} required={tipo !== 'chiamata'}>
          <TextInput
            value={oggetto}
            onChange={(e) => setOggetto(e.target.value)}
            placeholder={
              tipo === 'chiamata'
                ? 'Dubbio sull’F24 di giugno'
                : tipo === 'documenti'
                  ? 'Estratti conto di agosto'
                  : 'Come registro la fattura del forno?'
            }
            autoFocus
          />
        </Field>
        <Field label={tipo === 'chiamata' ? 'Dettagli (facoltativi)' : 'Messaggio'}>
          <TextArea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder={tipo === 'chiamata' ? 'Così chi chiama arriva preparato.' : ''} />
        </Field>
        {tipo === 'chiamata' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Numero da chiamare" required hint="Viene dal tuo profilo: qui lo cambi solo per questa volta.">
              <TextInput value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="333 1234567" />
            </Field>
            <Field label="Quando preferisci">
              <Select value={quando} onChange={(e) => setQuando(e.target.value)}>
                {PREFERRED_TIMES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {studio && (
          <Field label="Entro quando" hint="Facoltativo.">
            <TextInput type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
          </Field>
        )}
        <Interruttore label="È urgente" descrizione="Va in cima alla lista di chi la riceve." acceso={urgente} onChange={setUrgente} />
      </div>
      <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="primary"
          disabled={busy || (tipo === 'chiamata' ? !telefono.trim() : !oggetto.trim())}
          onClick={() => void invia()}
        >
          {busy ? 'Invio…' : tipo === 'chiamata' ? 'Chiedi la chiamata' : 'Invia'}
        </Button>
      </footer>
    </Modal>
  )
}
