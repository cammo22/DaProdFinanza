import { useEffect, useState } from 'react'
import { releaseNotesText, type UpdateKind, type UpdateState } from '@shared/updates'
import { dataIt } from '../lib/format'
import { Alert, Button, Modal } from './ui'

/** Stato degli aggiornamenti, tenuto allineato con il processo principale. */
export function useUpdates(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    let alive = true
    window.daprod.updates.state().then((initial) => alive && setState(initial))
    const stop = window.daprod.updates.onChange(setState)
    return () => {
      alive = false
      stop()
    }
  }, [])
  return state
}

const KIND_LABELS: Record<UpdateKind, string> = {
  installer: 'versione installata',
  portable: 'versione portatile',
  demo: 'versione dimostrativa',
  mac: 'versione dimostrativa per Mac',
  dev: 'versione di sviluppo'
}

const HOW_IT_WORKS: Record<UpdateKind, string> = {
  installer:
    'Il programma si chiude, installa la nuova versione nella stessa cartella e si riapre da solo.',
  portable:
    'Il nuovo file viene salvato accanto a quello attuale e parte al suo posto; il file vecchio viene tolto.',
  demo: 'Il nuovo file viene salvato accanto a quello attuale e parte al suo posto; i dati di esempio restano.',
  mac: 'Si apre la pagina di download: scarica il DMG nuovo, aprilo e trascina il programma al posto di quello vecchio. I dati di esempio restano.',
  dev: 'In sviluppo si può solo controllare: l’aggiornamento vale per le versioni pubblicate.'
}

export function UpdateDialog({
  state,
  onClose
}: {
  state: UpdateState
  onClose: () => void
}): React.JSX.Element {
  const { status } = state
  const busy = status === 'checking' || status === 'downloading'

  return (
    <Modal
      title="Aggiornamenti"
      subtitle={`Stai usando la ${KIND_LABELS[state.kind]} ${state.current}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 px-6 py-5 text-sm">
        {status === 'idle' && <p className="text-ink-300">Non ho ancora controllato.</p>}
        {status === 'checking' && <p className="text-ink-300">Controllo su GitHub…</p>}
        {status === 'none' && (
          <Alert tone="success">
            Hai già l’ultima versione ({state.current}).
          </Alert>
        )}
        {status === 'error' && state.error && <Alert>{state.error}</Alert>}

        {(status === 'available' || status === 'downloading' || status === 'ready') && state.latest && (
          <>
            <div className="rounded-lg border border-brand-500/40 bg-brand-500/10 px-4 py-3">
              <p className="font-semibold text-brand-200">È disponibile la versione {state.latest}</p>
              {state.publishedAt && (
                <p className="mt-0.5 text-xs text-ink-300">Pubblicata il {dataIt(state.publishedAt.slice(0, 10))}</p>
              )}
            </div>
            {state.notes && (
              <div className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-xs leading-relaxed text-ink-300">
                {releaseNotesText(state.notes)}
              </div>
            )}
            <p className="text-xs text-ink-400">
              {HOW_IT_WORKS[state.kind]}{state.kind === 'mac' ? '' : ' Prima viene fatto un backup del database.'}
            </p>
          </>
        )}

        {status === 'downloading' && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{ width: `${state.progress ?? 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Download in corso… {state.progress ?? 0}%</p>
          </div>
        )}
        {status === 'ready' && (
          <Alert tone="success">Scaricata e verificata. Pronta da installare.</Alert>
        )}

        {state.checkedAt && (
          <p className="text-xs text-ink-400">
            Ultimo controllo: {new Date(state.checkedAt).toLocaleString('it-IT')}
          </p>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-ink-700 px-6 py-4">
        <Button onClick={onClose}>Chiudi</Button>
        {status !== 'available' && status !== 'ready' && (
          <Button onClick={() => window.daprod.updates.check()} disabled={busy}>
            Controlla adesso
          </Button>
        )}
        {status === 'available' && state.kind !== 'dev' && (
          <Button variant="primary" onClick={() => window.daprod.updates.download()}>
            {state.kind === 'mac' ? 'Apri la pagina di download' : `Scarica la versione ${state.latest}`}
          </Button>
        )}
        {status === 'ready' && (
          <Button variant="primary" onClick={() => window.daprod.updates.install()}>
            Installa e riavvia
          </Button>
        )}
      </footer>
    </Modal>
  )
}
