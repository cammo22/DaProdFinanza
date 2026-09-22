import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DOCUMENT_CATEGORIES,
  dimensione,
  estensione,
  tipoAnteprima,
  type DocumentItem
} from '@shared/documents'
import type { Company } from '@shared/types'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useImpostazioni } from '../../lib/impostazioni'
import { segnalaAzione, useAlCambioRichieste } from '../../lib/inbox'
import { Alert, Button, Card, EmptyState, Field, Interruttore, Modal, Scheletro, Select, TextInput } from '../../components/ui'
import { UploadDialog } from '../../components/UploadDialog'
import { useAzione } from '../../lib/comandi'
import { DocumentViewer } from '../../components/viewer/DocumentViewer'
import { quandoBreve } from '../../components/RequestDetail'
import { Separatore, Tendina, VoceMenu } from '../../components/Guscio'
import { Icona } from '../../components/icone'

/**
 * Il cassetto documenti di un'azienda — AGENTS.md §10.13.
 *
 * Tutti ci mettono file e tutti li aprono al volo, senza Office. Lo studio vede
 * tutto (anche i file che tiene per sé); l'azienda vede quelli condivisi e
 * sa, per ognuno di quelli che ha mandato, se e quando lo studio l'ha aperto.
 */

/** Il colore del tipo di file, come le icone di Office: si riconosce a colpo d'occhio. */
const COLORI_TIPO: Record<string, string> = {
  pdf: 'bg-red-500/15 text-red-300 border-red-500/30',
  foglio: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  word: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  presentazione: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  immagine: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  testo: 'bg-ink-700 text-ink-200 border-ink-600',
  audio: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  video: 'bg-pink-500/15 text-pink-300 border-pink-500/30'
}

export function BadgeFile({ nome }: { nome: string }): React.JSX.Element {
  const t = tipoAnteprima(nome)
  const ext = (estensione(nome) || '?').slice(0, 4).toUpperCase()
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-[9px] font-bold tracking-tight ${
        t ? COLORI_TIPO[t] : 'border-ink-600 bg-ink-800 text-ink-300'
      }`}
      aria-hidden="true"
    >
      {ext}
    </span>
  )
}

export function DocumentsView({ company }: { company: Company }): React.JSX.Element {
  const { user } = useAuth()
  const { portale } = useImpostazioni()
  const studio = user?.role === 'consultant'
  const puoInviare = studio || Boolean(portale?.permessi.inviareDocumenti)
  const [documenti, setDocumenti] = useState<DocumentItem[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [cerca, setCerca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [origine, setOrigine] = useState<'' | 'studio' | 'azienda' | 'privati'>('')
  const [carica, setCarica] = useState<File[] | null>(null)
  const [aperto, setAperto] = useState<DocumentItem | null>(null)
  const [modifica, setModifica] = useState<DocumentItem | null>(null)
  const [trascinando, setTrascinando] = useState(false)
  // "Carica un documento" dai comandi rapidi: si apre subito la finestra.
  useAzione('carica-documento', () => setCarica([]), puoInviare)

  const ricarica = useCallback(async () => {
    try {
      setDocumenti(await api.get<DocumentItem[]>(`/api/companies/${company.uuid}/documents`))
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Documenti non disponibili.')
    }
  }, [company.uuid])

  useEffect(() => {
    void ricarica()
  }, [ricarica])
  useAlCambioRichieste(ricarica)

  const filtrati = useMemo(() => {
    const ago = cerca.trim().toLowerCase()
    return (documenti ?? []).filter((d) => {
      if (ago && !d.name.toLowerCase().includes(ago) && !(d.note ?? '').toLowerCase().includes(ago)) return false
      if (categoria && d.category !== categoria) return false
      if (origine === 'studio' && d.uploaded_by_role !== 'consultant') return false
      if (origine === 'azienda' && d.uploaded_by_role !== 'company') return false
      if (origine === 'privati' && d.shared) return false
      return true
    })
  }, [documenti, cerca, categoria, origine])

  const categorie = useMemo(() => {
    const tutte = new Set<string>(DOCUMENT_CATEGORIES)
    documenti?.forEach((d) => tutte.add(d.category))
    return [...tutte]
  }, [documenti])

  const elimina = async (d: DocumentItem): Promise<void> => {
    if (!confirm(`Togliere «${d.name}» dal cassetto?`)) return
    try {
      await api.delete(`/api/companies/${company.uuid}/documents/${d.uuid}`)
      await ricarica()
      segnalaAzione()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  const nuovo = (d: DocumentItem): boolean =>
    studio ? d.uploaded_by_role === 'company' && !d.opened_by_studio_at : d.uploaded_by_role === 'consultant' && !d.opened_by_company_at

  return (
    <div
      className="mx-auto flex max-w-6xl flex-col gap-5"
      onDragOver={(e) => {
        if (!puoInviare || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setTrascinando(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setTrascinando(false)
      }}
      onDrop={(e) => {
        if (!puoInviare) return
        e.preventDefault()
        setTrascinando(false)
        if (e.dataTransfer.files.length) setCarica([...e.dataTransfer.files])
      }}
    >
      {errore && <Alert>{errore}</Alert>}
      {trascinando && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-500/15">
          <p className="rounded-xl border-2 border-dashed border-brand-400 bg-ink-900 px-8 py-6 text-lg text-brand-300">
            Lascia qui i file
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-100">Documenti</h2>
          <p className="text-xs text-ink-400">
            {studio
              ? 'Il cassetto di questa azienda: i file dell’azienda e quelli dello studio. Si aprono al volo, anche senza Office.'
              : 'I documenti che hai mandato allo studio e quelli che lo studio ha condiviso con te.'}
          </p>
        </div>
        {puoInviare && (
          <Button variant="primary" onClick={() => setCarica([])}>
            <Icona nome="carica" className="h-4 w-4" />
            {studio ? 'Carica file' : 'Manda documenti allo studio'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <TextInput value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome…" className="col-span-2 md:w-64" />
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="md:w-auto">
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={origine} onChange={(e) => setOrigine(e.target.value as typeof origine)} className="md:w-auto">
          <option value="">Da tutti</option>
          <option value="azienda">{studio ? 'Mandati dall’azienda' : 'Mandati da me'}</option>
          <option value="studio">Dallo studio</option>
          {studio && <option value="privati">Solo dello studio</option>}
        </Select>
      </div>

      <Card>
        {documenti === null ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Scheletro className="h-9 w-9" />
                <div className="flex-1">
                  <Scheletro className="h-3.5 w-1/2" />
                  <Scheletro className="mt-2 h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtrati.length === 0 ? (
          <EmptyState
            title={documenti.length ? 'Nessun documento per questa ricerca' : 'Il cassetto è vuoto'}
            description={
              documenti.length
                ? 'Cambia i filtri o la ricerca.'
                : puoInviare
                  ? 'Trascina qui i file o usa il pulsante in alto. Si aprono al volo dentro il programma.'
                  : 'Quando lo studio condividerà dei documenti, li troverai qui.'
            }
          />
        ) : (
          <ul className="divide-y divide-ink-800">
            {filtrati.map((d) => (
              <li
                key={d.uuid}
                className="group flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-ink-800/40 md:px-4"
                onClick={(e) => {
                  // I pulsanti fanno la loro cosa; il resto della riga apre il file.
                  if (!(e.target as HTMLElement).closest('button')) setAperto(d)
                }}
              >
                <BadgeFile nome={d.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink-100 group-hover:text-brand-200">{d.name}</span>
                    {nuovo(d) && <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[10px] font-semibold text-warning">NUOVO</span>}
                    {!d.shared && <span className="shrink-0 rounded bg-ink-700 px-1.5 text-[10px] text-ink-300">solo studio</span>}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {d.category} · {dimensione(d.size_bytes)} · {d.uploaded_by_role === 'company' ? '↑' : '↓'} {d.uploaded_by_name},{' '}
                    {quandoBreve(d.created_at)}
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                  {d.uploaded_by_role === 'company' && (
                    <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${d.opened_by_studio_at ? 'text-positive' : 'text-ink-500'}`}>
                      {d.opened_by_studio_at && <Icona nome="spunta" className="h-3 w-3" />}
                      {d.opened_by_studio_at ? `aperto dallo studio ${quandoBreve(d.opened_by_studio_at)}` : 'non ancora aperto dallo studio'}
                    </p>
                  )}
                </div>
                <Button className="shrink-0 px-2.5 py-1 text-xs max-sm:hidden" onClick={() => setAperto(d)}>
                  Apri
                </Button>
                {(studio || d.uploaded_by_role === 'company') && (
                  <Tendina
                    titolo="Altre azioni sul file"
                    larghezza="w-52"
                    classeBottone="rounded-lg border border-ink-700 bg-ink-800 p-1.5 text-ink-300 hover:bg-ink-700"
                    etichetta={<Icona nome="altro" className="h-4 w-4" />}
                  >
                    {(chiudi) => (
                      <>
                        <VoceMenu icona="occhio" onClick={() => { chiudi(); setAperto(d) }}>
                          Apri
                        </VoceMenu>
                        {(studio || d.uploaded_by_role === 'company') && (
                          <VoceMenu icona="matita" onClick={() => { chiudi(); setModifica(d) }}>
                            Nome, categoria, nota
                          </VoceMenu>
                        )}
                        {(studio || (d.uploaded_by_role === 'company' && !d.opened_by_studio_at)) && (
                          <>
                            <Separatore />
                            <VoceMenu icona="cestino" pericolo onClick={() => { chiudi(); void elimina(d) }}>
                              Togli dal cassetto
                            </VoceMenu>
                          </>
                        )}
                      </>
                    )}
                  </Tendina>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {carica && (
        <UploadDialog
          companyUuid={company.uuid}
          fileIniziali={carica}
          onClose={() => setCarica(null)}
          onFatto={() => {
            setCarica(null)
            void ricarica()
          }}
        />
      )}
      {aperto && (
        <DocumentViewer
          companyUuid={company.uuid}
          documento={aperto}
          onClose={() => {
            setAperto(null)
            void ricarica()
            segnalaAzione()
          }}
        />
      )}
      {modifica && (
        <ModificaDocumento
          companyUuid={company.uuid}
          documento={modifica}
          studio={studio}
          onClose={() => setModifica(null)}
          onSalvato={() => {
            setModifica(null)
            void ricarica()
          }}
        />
      )}
    </div>
  )
}

function ModificaDocumento({
  companyUuid,
  documento,
  studio,
  onClose,
  onSalvato
}: {
  companyUuid: string
  documento: DocumentItem
  studio: boolean
  onClose: () => void
  onSalvato: () => void
}): React.JSX.Element {
  const ext = estensione(documento.name)
  const [nome, setNome] = useState(ext ? documento.name.slice(0, -(ext.length + 1)) : documento.name)
  const [categoria, setCategoria] = useState(documento.category)
  const [nota, setNota] = useState(documento.note ?? '')
  const [condiviso, setCondiviso] = useState(Boolean(documento.shared))
  const [errore, setErrore] = useState<string | null>(null)
  const salva = async (): Promise<void> => {
    try {
      await api.put(`/api/companies/${companyUuid}/documents/${documento.uuid}`, {
        name: ext ? `${nome}.${ext}` : nome,
        category: categoria,
        note: nota,
        shared: condiviso
      })
      onSalvato()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    }
  }
  return (
    <Modal title="Modifica documento" subtitle={documento.name} onClose={onClose}>
      <div className="flex flex-col gap-4 px-6 py-5">
        {errore && <Alert>{errore}</Alert>}
        <Field label="Nome" hint={ext ? `L’estensione .${ext} resta: decide con cosa si apre.` : undefined}>
          <TextInput value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="Categoria">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {[...new Set([...DOCUMENT_CATEGORIES, documento.category])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nota">
          <TextInput value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
        {studio && documento.uploaded_by_role === 'consultant' && (
          <Interruttore label="Visibile all'azienda" acceso={condiviso} onChange={setCondiviso} />
        )}
      </div>
      <footer className="flex justify-end gap-3 border-t border-ink-700 px-6 py-4">
        <Button onClick={onClose}>Annulla</Button>
        <Button variant="primary" onClick={() => void salva()}>
          Salva
        </Button>
      </footer>
    </Modal>
  )
}
