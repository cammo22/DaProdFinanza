import { useEffect, useMemo, useState } from 'react'
import {
  GESTIONE_LABELS,
  GESTIONI_INPS,
  normalizzaFiscale,
  REGIME_LABELS,
  REGIMI,
  scadenzeFiscali,
  stimaFiscale,
  type GestioneInps,
  type ImpostazioniFiscali,
  type Regime
} from '@shared/engine'
import type { Company } from '@shared/types'
import { api } from '../../lib/api'
import { euro, euroInput, parseEuro, percent } from '../../lib/format'
import { Griglia, Pannelli } from '../../components/Pannelli'
import { StrisciaIndicatori } from '../../components/widgets'
import { Alert, Button, CaricamentoPagina, Card, EmptyState, Interruttore, Select } from '../../components/ui'
import { Icona } from '../../components/icone'
import { mostraAvviso } from '../../components/Avvisi'

/**
 * Area fiscale e contributi — AGENTS.md §10.17 (versione 1.3.0).
 *
 * Quanto costeranno imposte e contributi dell'anno, quanto mettere da parte
 * ogni mese e quando si paga. Le impostazioni si ritoccano a destra e tutto
 * si ricalcola subito (stesso motore del server); "Salva" le rende quelle
 * dell'azienda, anche per la tesoreria e il riepilogo dell'azienda.
 */

interface Payload {
  settings: ImpostazioniFiscali
  bilancio: { label: string; anno: number; utileAnteImposte: number; ebit: number; ricavi: number } | null
}

const oggi = (): string => new Date().toISOString().slice(0, 10)

export function FiscaleView({ company, canEdit }: { company: Company; canEdit: boolean }): React.JSX.Element {
  const [dati, setDati] = useState<Payload | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [bozza, setBozza] = useState<ImpostazioniFiscali | null>(null)

  useEffect(() => {
    api
      .get<Payload>(`/api/companies/${company.uuid}/fiscale`)
      .then((d) => {
        setDati(d)
        setBozza(d.settings)
      })
      .catch((err) => setErrore(err instanceof Error ? err.message : 'Area fiscale non disponibile.'))
  }, [company.uuid])

  const giorno = oggi()
  const calcolo = useMemo(() => {
    if (!dati || !bozza) return null
    if (!dati.bilancio && bozza.redditoManualeCents === null) return null
    const stima = stimaFiscale(dati.bilancio ?? { utileAnteImposte: 0, ebit: bozza.redditoManualeCents ?? 0, ricavi: 0 }, bozza)
    return { stima, scadenze: scadenzeFiscali(stima, bozza, giorno) }
  }, [dati, bozza, giorno])

  if (errore) return <Alert>{errore}</Alert>
  if (!dati || !bozza) return <CaricamentoPagina />

  const cambiato = JSON.stringify(bozza) !== JSON.stringify(dati.settings)
  const salva = async (p?: Partial<ImpostazioniFiscali>): Promise<void> => {
    try {
      const nuove = await api.put<ImpostazioniFiscali>(`/api/companies/${company.uuid}/fiscale/settings`, { ...bozza, ...p })
      setDati({ ...dati, settings: nuove })
      setBozza(nuove)
      mostraAvviso('Impostazioni fiscali salvate.')
    } catch (err) {
      mostraAvviso(err instanceof Error ? err.message : 'Salvataggio non riuscito.', 'errore')
    }
  }
  const set = (p: Partial<ImpostazioniFiscali>): void => setBozza(normalizzaFiscale({ ...bozza, ...p }, bozza))

  const s = calcolo?.stima ?? null
  const prossima = calcolo?.scadenze[0] ?? null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3 text-sm text-ink-300">
        <Icona nome="info" className="mt-0.5 h-4 w-4 text-brand-300" />
        <p>
          <span className="text-ink-100">È una stima per mettere da parte i soldi giusti</span>, non la dichiarazione:
          niente detrazioni personali né crediti d’imposta. Aliquote e minimali INPS vanno controllati ogni anno.
          {cambiato && <span className="ml-1 text-warning">Stai guardando modifiche non ancora salvate.</span>}
        </p>
      </div>

      {!s ? (
        <Card>
          <EmptyState
            title="Serve un anno di bilancio"
            description="La stima parte dall'utile degli ultimi 12 mesi (o dall'ultimo bilancio annuale). Carica i dati, oppure scrivi a mano il reddito previsto nelle impostazioni qui sotto."
          />
        </Card>
      ) : null}

      <Pannelli vista="fiscale">
        {s && (
          <StrisciaIndicatori
            indicatori={[
              { label: 'Imposte e contributi dell’anno', valore: euro(s.totale), sotto: `imposte ${euro(s.imposte)} · contributi ${euro(s.contributi)}` },
              { label: 'Da mettere da parte', valore: euro(s.accantonamentoMensile), sotto: 'ogni mese, per non trovarsi scoperti' },
              {
                label: 'Aliquota effettiva',
                valore: s.aliquotaEffettiva !== null ? percent(s.aliquotaEffettiva) : '—',
                sotto:
                  s.regime === 'forfettario'
                    ? 'sul reddito forfettario'
                    : s.redditoManuale
                      ? 'sul reddito scritto a mano'
                      : dati.bilancio
                        ? `sull'utile ante imposte, ${dati.bilancio.label.toLowerCase()}`
                        : '',
                quota: s.aliquotaEffettiva !== null ? Math.min(1, s.aliquotaEffettiva / 60) : null,
                stile: 'barra',
                colore: 'bg-warning'
              },
              {
                label: 'Prossima scadenza',
                valore: prossima ? euro(prossima.importo) : '—',
                sotto: prossima
                  ? `${new Date(`${prossima.data}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} · ${prossima.descrizione}`
                  : 'nessuna nei prossimi mesi'
              }
            ]}
          />
        )}

        <Griglia colonne={2}>
          <Card title="Il calcolo">
            {s ? (
              <div className="px-4 py-3 md:px-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-ink-900/60 px-3 py-2 text-sm">
                  <span className="text-ink-400">
                    {s.regime === 'forfettario'
                      ? `Reddito forfettario: ricavi${s.redditoManuale ? ' scritti a mano' : ''} × ${String(bozza.forfettarioCoeff).replace('.', ',')}%`
                      : s.redditoManuale
                        ? 'Reddito scritto a mano'
                        : `Utile ante imposte · ${dati.bilancio?.label.toLowerCase()}`}
                  </span>
                  <span className="font-semibold tabular-nums text-ink-100">{euro(s.reddito)}</span>
                </div>
                <ul className="divide-y divide-ink-800">
                  {s.righe.map((r) => (
                    <li key={r.chiave} className="flex items-start justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm text-ink-100">
                          <span className={`h-2 w-2 rounded-full ${r.tipo === 'imposta' ? 'bg-warning' : 'bg-brand-400'}`} />
                          {r.voce}
                        </span>
                        <span className="block pl-4 text-[11px] text-ink-500">
                          {r.aliquota !== null ? `${String(r.aliquota).replace('.', ',')}% di ${euro(r.base)}` : `su ${euro(r.base)}`}
                          {r.nota ? ` · ${r.nota}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-100">{euro(r.importo)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between py-2.5 text-sm font-semibold">
                    <span className="text-ink-100">Totale</span>
                    <span className="tabular-nums text-ink-100">{euro(s.totale)}</span>
                  </li>
                </ul>
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-500">Nessun calcolo senza un reddito di partenza.</p>
            )}
          </Card>

          <Card title="Scadenze dei prossimi mesi">
            <div className="px-4 py-3 md:px-5">
              {calcolo && calcolo.scadenze.length > 0 ? (
                <ul className="divide-y divide-ink-800">
                  {calcolo.scadenze.map((x, i) => (
                    <li key={`${x.data}-${i}`} className="flex items-center gap-3 py-2">
                      <span className="w-14 shrink-0 text-center">
                        <span className="block text-lg font-semibold leading-none text-ink-100">{Number(x.data.slice(8, 10))}</span>
                        <span className="block text-[10px] uppercase text-ink-500">
                          {new Date(`${x.data}T12:00:00`).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-200">{x.descrizione}</span>
                      <span className="shrink-0 text-sm tabular-nums text-ink-100">{euro(x.importo)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-ink-500">Nessuna scadenza nei prossimi mesi.</p>
              )}
              <div className="mt-2 border-t border-ink-800">
                <Interruttore
                  label="Scadenze nella tesoreria"
                  descrizione="Acconti, saldi e contributi entrano nella previsione di cassa. Se le imposte sono già fra le previsioni manuali, spegnile: si conterebbero due volte."
                  acceso={dati.settings.inTesoreria}
                  disabled={!canEdit}
                  onChange={(v) => void salva({ inTesoreria: v })}
                />
              </div>
            </div>
          </Card>
        </Griglia>

        {canEdit && (
        <Card
          title="Impostazioni"
          actions={
            canEdit ? (
              <div className="flex gap-2">
                {cambiato && (
                  <Button className="px-3 py-1 text-xs" onClick={() => setBozza(dati.settings)}>
                    Annulla
                  </Button>
                )}
                <Button variant="primary" className="px-3 py-1 text-xs" disabled={!cambiato} onClick={() => void salva()}>
                  Salva
                </Button>
              </div>
            ) : undefined
          }
        >
          <fieldset disabled={!canEdit} className="grid gap-x-8 gap-y-1 px-4 py-4 md:grid-cols-2 md:px-5">
            <div className="md:col-span-2">
              <p className="mb-1 text-xs font-medium text-ink-300">Regime</p>
              <div className="flex flex-wrap gap-1.5">
                {REGIMI.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set({ regime: r as Regime })}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      bozza.regime === r ? 'border-brand-400/60 bg-brand-500/15 text-brand-100' : 'border-ink-700 text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    {REGIME_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <Sezione titolo="Aliquote">
              {bozza.regime === 'capitali' && <Percento label="IRES" valore={bozza.iresPct} onChange={(v) => set({ iresPct: v })} />}
              {(bozza.regime === 'capitali' || bozza.regime === 'persone') && (
                <Percento label="IRAP" valore={bozza.irapPct} onChange={(v) => set({ irapPct: v })} aiuto="3,9% di base; alcune regioni hanno maggiorazioni" />
              )}
              {(bozza.regime === 'persone' || bozza.regime === 'individuale') && (
                <Percento label="Addizionali regionale e comunale" valore={bozza.addizionaliPct} onChange={(v) => set({ addizionaliPct: v })} />
              )}
              {bozza.regime === 'persone' && (
                <Riga label="Soci che si dividono il reddito">
                  <input
                    value={bozza.soci}
                    onChange={(e) => set({ soci: Number(e.target.value) || 1 })}
                    inputMode="numeric"
                    className={CAMPO}
                  />
                </Riga>
              )}
              {bozza.regime === 'forfettario' && (
                <>
                  <Percento label="Coefficiente di redditività" valore={bozza.forfettarioCoeff} onChange={(v) => set({ forfettarioCoeff: v })} aiuto="ristorazione e commercio 40%, edilizia 86%, professioni 78%" />
                  <Percento label="Imposta sostitutiva" valore={bozza.forfettarioAliquota} onChange={(v) => set({ forfettarioAliquota: v })} aiuto="15%, oppure 5% nei primi cinque anni" />
                </>
              )}
            </Sezione>

            <Sezione titolo="Contributi INPS">
              {bozza.regime === 'capitali' ? (
                <p className="py-1.5 text-xs text-ink-500">In una società di capitali i contributi dei soci che lavorano si pagano a parte: qui non entrano.</p>
              ) : (
                <>
                  <Riga label="Gestione">
                    <Select value={bozza.gestioneInps} onChange={(e) => set({ gestioneInps: e.target.value as GestioneInps })} className="w-44 py-1 text-sm">
                      {GESTIONI_INPS.map((g) => (
                        <option key={g} value={g}>
                          {GESTIONE_LABELS[g]}
                        </option>
                      ))}
                    </Select>
                  </Riga>
                  {(bozza.gestioneInps === 'artigiani' || bozza.gestioneInps === 'commercianti') && (
                    <>
                      <Percento label="Aliquota" valore={bozza.inpsAliquota} onChange={(v) => set({ inpsAliquota: v })} aiuto="artigiani 24%, commercianti 24,48% (2026)" />
                      <Euro label="Reddito minimale" valore={bozza.inpsMinimaleCents} onChange={(v) => set({ inpsMinimaleCents: v ?? 0 })} />
                    </>
                  )}
                  {bozza.gestioneInps === 'separata' && (
                    <Percento label="Aliquota gestione separata" valore={bozza.gestioneSeparataPct} onChange={(v) => set({ gestioneSeparataPct: v })} />
                  )}
                  {bozza.gestioneInps !== 'nessuna' && (
                    <Euro label="Massimale" valore={bozza.inpsMassimaleCents} onChange={(v) => set({ inpsMassimaleCents: v ?? 0 })} />
                  )}
                  {bozza.regime === 'forfettario' && (bozza.gestioneInps === 'artigiani' || bozza.gestioneInps === 'commercianti') && (
                    <label className="flex items-center gap-2 py-1.5 text-sm text-ink-300">
                      <input type="checkbox" checked={bozza.riduzioneInps35} onChange={(e) => set({ riduzioneInps35: e.target.checked })} className="accent-brand-500" />
                      Riduzione del 35% dei contributi
                    </label>
                  )}
                </>
              )}
            </Sezione>

            {bozza.regime !== 'forfettario' && (
              <Sezione titolo="Rettifiche all'utile">
                <Euro label="Variazioni in aumento" valore={bozza.variazioniAumentoCents} onChange={(v) => set({ variazioniAumentoCents: v ?? 0 })} aiuto="costi non deducibili: auto, telefoni, multe…" />
                <Euro label="Variazioni in diminuzione" valore={bozza.variazioniDiminuzioneCents} onChange={(v) => set({ variazioniDiminuzioneCents: v ?? 0 })} aiuto="super ammortamenti, ACE, altre agevolazioni" />
                {bozza.regime !== 'individuale' && (
                  <Euro label="Rettifiche IRAP" valore={bozza.variazioniIrapCents} onChange={(v) => set({ variazioniIrapCents: v ?? 0 })} aiuto="costi non deducibili IRAP (collaboratori, personale a termine)" />
                )}
              </Sezione>
            )}

            <Sezione titolo="Reddito e acconti">
              <Euro
                label={bozza.regime === 'forfettario' ? 'Ricavi previsti (a mano)' : 'Reddito previsto (a mano)'}
                valore={bozza.redditoManualeCents}
                vuoto
                onChange={(v) => set({ redditoManualeCents: v })}
                aiuto={dati.bilancio ? `vuoto = ${bozza.regime === 'forfettario' ? 'ricavi' : 'utile'} del bilancio (${dati.bilancio.label.toLowerCase()})` : 'serve se non c’è un bilancio'}
              />
              <Euro label="Imposte dell’anno scorso" valore={bozza.impostePrecedentiCents} vuoto onChange={(v) => set({ impostePrecedentiCents: v })} aiuto="dalla dichiarazione: base degli acconti (vuoto = la stima)" />
              <Euro label="Acconti versati l’anno scorso" valore={bozza.accontiVersatiCents} vuoto onChange={(v) => set({ accontiVersatiCents: v })} aiuto="per calcolare il saldo di giugno" />
              {bozza.regime !== 'forfettario' && (
                <label className="flex items-center gap-2 py-1.5 text-sm text-ink-300">
                  <input type="checkbox" checked={bozza.isa} onChange={(e) => set({ isa: e.target.checked })} className="accent-brand-500" />
                  Soggetta agli ISA (acconti 50% + 50%)
                </label>
              )}
            </Sezione>
          </fieldset>
        </Card>
        )}
      </Pannelli>
    </div>
  )
}

const CAMPO =
  'w-28 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm tabular-nums text-ink-100 outline-none focus:border-brand-500 disabled:opacity-60'

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="border-t border-ink-800 pt-3 pb-1 md:[&:nth-of-type(-n+3)]:border-t-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{titolo}</p>
      {children}
    </div>
  )
}

function Riga({ label, aiuto, children }: { label: string; aiuto?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-ink-200">{label}</span>
        {aiuto && <span className="block text-[11px] text-ink-500">{aiuto}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </label>
  )
}

function Percento({ label, valore, onChange, aiuto }: { label: string; valore: number; onChange: (v: number) => void; aiuto?: string }): React.JSX.Element {
  const [testo, setTesto] = useState<string | null>(null)
  return (
    <Riga label={label} aiuto={aiuto}>
      <input
        value={testo ?? String(valore).replace('.', ',')}
        onChange={(e) => {
          setTesto(e.target.value)
          const n = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() && Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setTesto(null)}
        inputMode="decimal"
        className={CAMPO.replace('w-28', 'w-20')}
      />
      <span className="w-4 text-xs text-ink-500">%</span>
    </Riga>
  )
}

function Euro({
  label,
  valore,
  onChange,
  aiuto,
  vuoto = false
}: {
  label: string
  valore: number | null
  onChange: (v: number | null) => void
  aiuto?: string
  /** Il campo vuoto vale "nessun valore" (null), non zero. */
  vuoto?: boolean
}): React.JSX.Element {
  const [testo, setTesto] = useState<string | null>(null)
  return (
    <Riga label={label} aiuto={aiuto}>
      <input
        value={testo ?? (valore === null ? '' : euroInput(valore))}
        onChange={(e) => {
          setTesto(e.target.value)
          if (!e.target.value.trim()) onChange(vuoto ? null : 0)
          else {
            const c = parseEuro(e.target.value)
            if (c !== null) onChange(c)
          }
        }}
        onBlur={() => setTesto(null)}
        inputMode="decimal"
        placeholder={vuoto ? '—' : '0'}
        className={CAMPO}
      />
      <span className="w-4 text-xs text-ink-500">€</span>
    </Riga>
  )
}
