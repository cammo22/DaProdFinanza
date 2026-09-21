import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import {
  calcolaVoce,
  CLASSE_MENU,
  costoRiga,
  costoUtile,
  KIND_RIGA_LABELS,
  menuEngineering,
  normalizzaMarginalita,
  PRESET,
  TIPI_ATTIVITA,
  TIPO_ATTIVITA_LABELS,
  type CalcoloVoce,
  type ClasseMenu,
  type ContestoCosti,
  type ImpostazioniMarginalita,
  type KindRiga,
  type TipoAttivita
} from '@shared/engine'
import type { Company, MarginItem, MarginLine, MarginMaterial } from '@shared/types'
import { api } from '../../lib/api'
import { useAzione } from '../../lib/comandi'
import { euro, euroInput, parseEuro, percent } from '../../lib/format'
import { StrisciaIndicatori } from '../../components/widgets'
import { Alert, Button, CaricamentoPagina, Card, EmptyState, Field, Modal, Segmentato, Select, TextInput } from '../../components/ui'
import { Icona } from '../../components/icone'
import { mostraAvviso } from '../../components/Avvisi'

/**
 * Marginalità — AGENTS.md §10.18 (versione 1.3.0).
 *
 * La sezione prende la forma dell'attività: per un ristorante sono ricette,
 * ingredienti e food cost, con il menu engineering; per chi lavora a commessa
 * sono commesse con preventivo e consuntivo; per produzione e commercio
 * prodotti, distinta base e ricarico. Il calcolo è lo stesso (motore
 * condiviso) e si rifà a ogni tasto.
 */

interface Payload {
  settings: ImpostazioniMarginalita
  materials: MarginMaterial[]
  items: MarginItem[]
  personale: {
    costoOrarioDiretti: number | null
    persone: { uuid: string; name: string; role: string | null; costoOrario: number | null; direct: 0 | 1 }[]
  }
}

type Scheda = 'voci' | 'analisi' | 'listino' | 'impostazioni'

function contesto(d: Payload): ContestoCosti {
  const persone = new Map(d.personale.persone.map((p) => [p.uuid, p.costoOrario]))
  return {
    materiali: new Map(d.materials.map((m) => [m.uuid, m])),
    costoOrarioPersona: (u) => persone.get(u) ?? null,
    costoOrario: d.settings.costoOrarioCents ?? d.personale.costoOrarioDiretti
  }
}

const righePreventivo = (i: MarginItem): MarginLine[] => i.lines.filter((l) => l.phase === 'preventivo')
const righeConsuntivo = (i: MarginItem): MarginLine[] => i.lines.filter((l) => l.phase === 'consuntivo')

export function MarginalitaView({ company, canEdit }: { company: Company; canEdit: boolean }): React.JSX.Element {
  const [dati, setDati] = useState<Payload | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scheda, setScheda] = useState<Scheda>('voci')
  const [voce, setVoce] = useState<MarginItem | 'nuova' | null>(null)
  const [cerca, setCerca] = useState('')
  const [categoria, setCategoria] = useState('')

  const carica = useCallback(async () => {
    try {
      setDati(await api.get<Payload>(`/api/companies/${company.uuid}/marginalita`))
      setErrore(null)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Marginalità non disponibile.')
    }
  }, [company.uuid])

  useEffect(() => {
    void carica()
  }, [carica])

  useAzione('nuova-voce-margine', () => {
    setScheda('voci')
    setVoce('nuova')
  }, canEdit)

  const ctx = useMemo(() => (dati ? contesto(dati) : null), [dati])
  const calcoli = useMemo(() => {
    const m = new Map<string, CalcoloVoce>()
    if (!dati || !ctx) return m
    for (const i of dati.items) m.set(i.uuid, calcolaVoce(i, righePreventivo(i), ctx, dati.settings))
    return m
  }, [dati, ctx])

  if (errore) return <Alert>{errore}</Alert>
  if (!dati || !ctx) return <CaricamentoPagina />

  const imp = dati.settings
  const preset = PRESET[imp.tipo]
  const ristorazione = imp.tipo === 'ristorazione'
  const commesse = imp.tipo === 'servizi'
  const categorie = [...new Set(dati.items.map((i) => i.category ?? '').filter(Boolean))].sort()
  const visibili = dati.items.filter(
    (i) =>
      i.status !== 'archiviata' &&
      (!categoria || i.category === categoria) &&
      (!cerca.trim() || i.name.toLowerCase().includes(cerca.trim().toLowerCase()))
  )

  // Indicatori: pesati sulle vendite del mese, dove ci sono.
  let prezzoVol = 0
  let materialiVol = 0
  let mcMese = 0
  for (const i of dati.items) {
    const c = calcoli.get(i.uuid)!
    const vol = i.monthly_volume ?? 0
    prezzoVol += c.prezzo * vol
    materialiVol += c.materiali * vol
    mcMese += c.margineContribuzione * vol
  }
  const sottoObiettivo = dati.items.filter((i) => {
    const c = calcoli.get(i.uuid)!
    return ristorazione ? (c.foodCostPct ?? 0) > imp.obiettivoFoodCost : c.marginePct !== null && c.marginePct < imp.obiettivoMargine
  }).length
  const costoOrario = ctx.costoOrario

  const salvaImpostazioni = async (p: Partial<ImpostazioniMarginalita>): Promise<void> => {
    try {
      const nuove = await api.put<ImpostazioniMarginalita>(`/api/companies/${company.uuid}/marginalita/settings`, { ...imp, ...p })
      setDati({ ...dati, settings: nuove })
      mostraAvviso('Impostazioni salvate.')
    } catch (err) {
      mostraAvviso(err instanceof Error ? err.message : 'Salvataggio non riuscito.', 'errore')
    }
  }

  const commesseAperte = dati.items.filter((i) => i.kind === 'commessa' && (i.status === 'preventivo' || i.status === 'in_corso'))
  const indicatori = commesse
    ? [
        { label: 'Commesse aperte', valore: String(commesseAperte.length), sotto: `${dati.items.filter((i) => i.kind === 'commessa').length} in tutto` },
        {
          label: 'Margine previsto delle aperte',
          valore: euro(commesseAperte.reduce((s, i) => s + calcoli.get(i.uuid)!.margineNetto, 0)),
          sotto: 'a preventivo, dopo i costi generali'
        },
        { label: 'Sotto il margine obiettivo', valore: String(sottoObiettivo), sotto: `obiettivo ${percent(imp.obiettivoMargine, 0)}` },
        { label: 'Costo di un’ora di lavoro', valore: costoOrario !== null ? euro(costoOrario, true) : '—', sotto: imp.costoOrarioCents !== null ? 'scritto nelle impostazioni' : 'dal Personale (chi lavora sulla produzione)' }
      ]
    : [
        ristorazione
          ? {
              label: 'Food cost medio',
              valore: prezzoVol ? percent((materialiVol / prezzoVol) * 100) : '—',
              sotto: `pesato sulle vendite · obiettivo ${percent(imp.obiettivoFoodCost, 0)}`,
              quota: prezzoVol ? Math.min(1, materialiVol / prezzoVol / 0.6) : null,
              stile: 'barra' as const,
              soglia: imp.obiettivoFoodCost / 60,
              colore: prezzoVol && (materialiVol / prezzoVol) * 100 > imp.obiettivoFoodCost ? 'bg-warning' : 'bg-positive'
            }
          : {
              label: 'Margine medio',
              valore: prezzoVol ? percent((mcMese / prezzoVol) * 100) : '—',
              sotto: 'di contribuzione, pesato sulle vendite'
            },
        { label: 'Margine di contribuzione al mese', valore: euro(mcMese), sotto: 'prezzo meno costi diretti, per le vendite di un mese' },
        { label: ristorazione ? 'Sopra il food cost obiettivo' : 'Sotto il margine obiettivo', valore: String(sottoObiettivo), sotto: `su ${dati.items.length} ${preset.voci.toLowerCase()}` },
        { label: 'Costo di un’ora di lavoro', valore: costoOrario !== null ? euro(costoOrario, true) : '—', sotto: imp.costoOrarioCents !== null ? 'scritto nelle impostazioni' : 'dal Personale (chi lavora sulla produzione)' }
      ]

  return (
    <div className="flex flex-col gap-5">
      <StrisciaIndicatori indicatori={indicatori} />

      <div className="flex flex-wrap items-center gap-3">
        <Segmentato
          valore={scheda}
          onChange={setScheda}
          opzioni={[
            { id: 'voci', label: preset.voci },
            { id: 'analisi', label: ristorazione ? 'Menu engineering' : commesse ? 'Preventivo e consuntivo' : 'Margini a confronto' },
            { id: 'listino', label: preset.materiali },
            { id: 'impostazioni', label: 'Impostazioni' }
          ]}
          className="max-w-full overflow-x-auto"
        />
        {canEdit && scheda === 'voci' && (
          <Button variant="primary" className="ml-auto" onClick={() => setVoce('nuova')}>
            <Icona nome="piu" className="h-4 w-4" /> Nuova {preset.voce}
          </Button>
        )}
      </div>

      {scheda === 'voci' && (
        <Card>
          {dati.items.length === 0 ? (
            <EmptyState
              title={`Ancora nessuna ${preset.voce}`}
              description={
                ristorazione
                  ? 'Scrivi gli ingredienti nel listino, poi le ricette: food cost, margine e prezzo consigliato si calcolano da soli.'
                  : commesse
                    ? 'Crea una commessa con il preventivo di materiali, ore e lavorazioni esterne; a lavoro finito scrivi il consuntivo e vedi lo scostamento.'
                    : 'Scrivi i materiali nel listino, poi la distinta base di ogni prodotto: costo, margine e ricarico si calcolano da soli.'
              }
              action={
                canEdit && (
                  <Button variant="primary" onClick={() => setVoce('nuova')}>
                    <Icona nome="piu" className="h-4 w-4" /> Nuova {preset.voce}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-2.5">
                <TextInput value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca…" className="w-full py-1.5 text-sm sm:w-52" />
                {categorie.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setCategoria('')} className={pastiglia(categoria === '')}>
                      Tutte
                    </button>
                    {categorie.map((c) => (
                      <button key={c} type="button" onClick={() => setCategoria(c)} className={pastiglia(categoria === c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ul className="divide-y divide-ink-800">
                {visibili.map((i) => {
                  const c = calcoli.get(i.uuid)!
                  const indice = ristorazione ? c.foodCostPct : c.marginePct
                  const male = ristorazione ? (indice ?? 0) > imp.obiettivoFoodCost : indice !== null && indice < imp.obiettivoMargine
                  return (
                    <li key={i.uuid}>
                      <button type="button" onClick={() => setVoce(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-800/40">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink-100">{i.name}</span>
                            {i.kind === 'commessa' && <StatoCommessa stato={i.status} />}
                            {c.costiMancanti && (
                              <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[10px] text-warning" title="Qualche riga non ha un costo">
                                costi mancanti
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            {[i.category, i.customer, i.kind === 'commessa' ? null : `costo ${euro(c.diretti, true)}`, i.monthly_volume ? `${i.monthly_volume.toLocaleString('it-IT')} al mese` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="hidden w-24 shrink-0 text-right sm:block">
                          <span className="block text-[10px] text-ink-500">{i.kind === 'commessa' ? 'importo' : 'in carta'}</span>
                          <span className="block text-sm tabular-nums text-ink-200">{euro(i.kind === 'commessa' ? c.prezzo : c.prezzoIvato, i.kind !== 'commessa')}</span>
                        </span>
                        <span className="w-24 shrink-0 text-right">
                          <span className="block text-[10px] text-ink-500">{ristorazione ? 'food cost' : 'margine'}</span>
                          <span className={`block text-sm font-semibold tabular-nums ${male ? 'text-warning' : 'text-positive'}`}>{percent(indice)}</span>
                        </span>
                        <span className="hidden w-24 shrink-0 text-right md:block">
                          <span className="block text-[10px] text-ink-500">resta {i.kind === 'commessa' ? '' : 'a pezzo'}</span>
                          <span className={`block text-sm tabular-nums ${c.margineNetto < 0 ? 'text-negative' : 'text-ink-100'}`}>{euro(c.margineNetto, i.kind !== 'commessa')}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
                {visibili.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-500">Niente con questi filtri.</li>}
              </ul>
            </>
          )}
        </Card>
      )}

      {scheda === 'analisi' &&
        (ristorazione ? (
          <MenuEngineering items={dati.items} calcoli={calcoli} onApri={setVoce} />
        ) : commesse ? (
          <ConfrontoCommesse items={dati.items} ctx={ctx} imp={imp} onApri={setVoce} />
        ) : (
          <MarginiAConfronto items={dati.items} calcoli={calcoli} onApri={setVoce} />
        ))}

      {scheda === 'listino' && <Listino companyUuid={company.uuid} dati={dati} canEdit={canEdit} onCambiato={carica} />}

      {scheda === 'impostazioni' && (
        <ImpostazioniMargini imp={imp} costoPersonale={dati.personale.costoOrarioDiretti} canEdit={canEdit} onSalva={salvaImpostazioni} />
      )}

      {voce && (
        <EditorVoce
          companyUuid={company.uuid}
          voce={voce === 'nuova' ? null : voce}
          dati={dati}
          ctx={ctx}
          canEdit={canEdit}
          onClose={() => setVoce(null)}
          onSaved={(messaggio) => {
            setVoce(null)
            mostraAvviso(messaggio)
            void carica()
          }}
        />
      )}
    </div>
  )
}

function pastiglia(attiva: boolean): string {
  return `whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
    attiva ? 'border-brand-400/60 bg-brand-500/15 text-brand-200' : 'border-ink-700 text-ink-300 hover:text-ink-100'
  }`
}

const STATO_COMMESSA: Record<MarginItem['status'], { label: string; classe: string }> = {
  attiva: { label: 'attiva', classe: 'bg-positive/15 text-positive' },
  preventivo: { label: 'preventivo', classe: 'bg-brand-500/15 text-brand-300' },
  in_corso: { label: 'in corso', classe: 'bg-warning/15 text-warning' },
  chiusa: { label: 'chiusa', classe: 'bg-ink-700 text-ink-300' },
  archiviata: { label: 'archiviata', classe: 'bg-ink-800 text-ink-500' }
}

function StatoCommessa({ stato }: { stato: MarginItem['status'] }): React.JSX.Element {
  return <span className={`shrink-0 rounded px-1.5 text-[10px] ${STATO_COMMESSA[stato].classe}`}>{STATO_COMMESSA[stato].label}</span>
}

// --- menu engineering ---------------------------------------------------------------------

const COLORE_CLASSE: Record<ClasseMenu, string> = {
  stella: '#34d399',
  cavallo: '#fbbf24',
  enigma: '#60a5fa',
  cane: '#f87171'
}

function MenuEngineering({
  items,
  calcoli,
  onApri
}: {
  items: MarginItem[]
  calcoli: Map<string, CalcoloVoce>
  onApri: (i: MarginItem) => void
}): React.JSX.Element {
  const conVendite = items.filter((i) => (i.monthly_volume ?? 0) > 0 && i.status !== 'archiviata')
  const me = menuEngineering(conVendite.map((i) => ({ uuid: i.uuid, volume: i.monthly_volume ?? 0, margine: calcoli.get(i.uuid)!.margineContribuzione })))
  if (conVendite.length < 2) {
    return (
      <Card>
        <EmptyState title="Servono le vendite" description="Scrivi quante porzioni vendi in un mese per almeno due ricette: il menu engineering le mette a confronto." />
      </Card>
    )
  }
  const punti = conVendite.map((i) => ({
    uuid: i.uuid,
    nome: i.name,
    x: i.monthly_volume ?? 0,
    y: calcoli.get(i.uuid)!.margineContribuzione / 100,
    classe: me.classi.get(i.uuid)!
  }))
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Card title="Vendite e margine per porzione">
        <div className="px-2 py-4">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid stroke="var(--color-ink-700)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Vendite al mese" tick={{ fill: 'var(--color-ink-400)', fontSize: 11 }} label={{ value: 'porzioni vendute al mese', position: 'insideBottom', offset: -10, fill: 'var(--color-ink-500)', fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="Margine" unit=" €" tick={{ fill: 'var(--color-ink-400)', fontSize: 11 }} width={50} />
              <ZAxis range={[90, 90]} />
              <ReferenceLine x={me.sogliaVolume} stroke="var(--color-ink-500)" strokeDasharray="4 4" />
              <ReferenceLine y={me.margineMedio / 100} stroke="var(--color-ink-500)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: 'var(--color-ink-850)', border: '1px solid var(--color-ink-600)', borderRadius: 8, fontSize: 12 }}
                formatter={(v, n) => (n === 'Margine' ? `${Number(v).toFixed(2).replace('.', ',')} €` : String(v))}
                labelFormatter={() => ''}
              />
              {(Object.keys(COLORE_CLASSE) as ClasseMenu[]).map((k) => (
                <Scatter key={k} name={CLASSE_MENU[k].nome} data={punti.filter((p) => p.classe === k)} fill={COLORE_CLASSE[k]} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <p className="px-3 text-[11px] text-ink-500">
            Le linee tratteggiate sono la soglia di popolarità (70% della vendita media) e il margine medio pesato: dividono il menu in quattro.
          </p>
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        {(Object.keys(CLASSE_MENU) as ClasseMenu[]).map((k) => {
          const voci = punti.filter((p) => p.classe === k)
          return (
            <div key={k} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-100">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORE_CLASSE[k] }} />
                {CLASSE_MENU[k].nome}
                <span className="text-xs font-normal text-ink-500">· {voci.length}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-400">{CLASSE_MENU[k].cosaFare}</p>
              {voci.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {voci.map((p) => (
                    <button
                      key={p.uuid}
                      type="button"
                      onClick={() => onApri(items.find((i) => i.uuid === p.uuid)!)}
                      className="rounded-full border border-ink-700 px-2.5 py-0.5 text-xs text-ink-200 hover:border-ink-500"
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- commesse: preventivo e consuntivo -------------------------------------------------------

function ConfrontoCommesse({
  items,
  ctx,
  imp,
  onApri
}: {
  items: MarginItem[]
  ctx: ContestoCosti
  imp: ImpostazioniMarginalita
  onApri: (i: MarginItem) => void
}): React.JSX.Element {
  const lista = items.filter((i) => i.kind === 'commessa' && i.status !== 'archiviata')
  if (!lista.length) {
    return (
      <Card>
        <EmptyState title="Nessuna commessa" description="Crea una commessa con il suo preventivo: qui vedrai quanto si discosta il consuntivo." />
      </Card>
    )
  }
  return (
    <Card title="Preventivo e consuntivo">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs text-ink-400">
              <th className="px-4 py-2.5 text-left font-medium">Commessa</th>
              <th className="px-4 py-2.5 text-right font-medium">Importo</th>
              <th className="px-4 py-2.5 text-right font-medium">Costo previsto</th>
              <th className="px-4 py-2.5 text-right font-medium">Costo effettivo</th>
              <th className="px-4 py-2.5 text-right font-medium">Scostamento</th>
              <th className="px-4 py-2.5 text-right font-medium">Margine</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const prev = calcolaVoce(i, righePreventivo(i), ctx, imp)
              const cons = righeConsuntivo(i).length ? calcolaVoce(i, righeConsuntivo(i), ctx, imp) : null
              const scost = cons ? cons.costoPieno - prev.costoPieno : null
              const margine = cons ?? prev
              return (
                <tr key={i.uuid} onClick={() => onApri(i)} className="cursor-pointer border-b border-ink-800 last:border-0 hover:bg-ink-800/40">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 text-ink-100">
                      {i.name} <StatoCommessa stato={i.status} />
                    </span>
                    {i.customer && <span className="text-xs text-ink-500">{i.customer}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-200">{euro(prev.prezzo)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-300">{euro(prev.costoPieno)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-100">{cons ? euro(cons.costoPieno) : '—'}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${scost === null ? 'text-ink-500' : scost > 0 ? 'text-negative' : 'text-positive'}`}>
                    {scost === null ? 'da scrivere' : `${scost > 0 ? '+' : ''}${euro(scost)}`}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${margine.margineNetto < 0 ? 'text-negative' : 'text-ink-100'}`}>
                    {euro(margine.margineNetto)} <span className="text-xs text-ink-500">{percent(margine.marginePct)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// --- produzione e commercio: margini a confronto ------------------------------------------------

function MarginiAConfronto({
  items,
  calcoli,
  onApri
}: {
  items: MarginItem[]
  calcoli: Map<string, CalcoloVoce>
  onApri: (i: MarginItem) => void
}): React.JSX.Element {
  const lista = items
    .filter((i) => i.status !== 'archiviata')
    .map((i) => ({ i, c: calcoli.get(i.uuid)! }))
    .sort((a, b) => (b.c.marginePct ?? -999) - (a.c.marginePct ?? -999))
  const massimo = Math.max(1, ...lista.map((x) => Math.abs(x.c.marginePct ?? 0)))
  return (
    <Card title="Margine netto per prodotto">
      <ul className="flex flex-col gap-3 px-5 py-4">
        {lista.map(({ i, c }) => (
          <li key={i.uuid}>
            <button type="button" onClick={() => onApri(i)} className="w-full text-left">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink-200">{i.name}</span>
                <span className={`tabular-nums ${(c.marginePct ?? 0) < 0 ? 'text-negative' : 'text-ink-100'}`}>
                  {percent(c.marginePct)} · ricarico {percent(c.ricaricoPct, 0)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
                <div
                  className={`h-full rounded-full ${(c.marginePct ?? 0) < 0 ? 'bg-negative' : 'bg-brand-500'}`}
                  style={{ width: `${(Math.abs(c.marginePct ?? 0) / massimo) * 100}%` }}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// --- listino -------------------------------------------------------------------------------------

function Listino({
  companyUuid,
  dati,
  canEdit,
  onCambiato
}: {
  companyUuid: string
  dati: Payload
  canEdit: boolean
  onCambiato: () => void
}): React.JSX.Element {
  const [modifica, setModifica] = useState<MarginMaterial | 'nuovo' | null>(null)
  const usi = new Map<string, number>()
  for (const i of dati.items) for (const l of i.lines) if (l.material_uuid) usi.set(l.material_uuid, (usi.get(l.material_uuid) ?? 0) + 1)
  const preset = PRESET[dati.settings.tipo]
  return (
    <Card
      title={preset.materiali}
      actions={
        canEdit ? (
          <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setModifica('nuovo')}>
            <Icona nome="piu" className="h-3.5 w-3.5" /> Aggiungi
          </Button>
        ) : undefined
      }
    >
      {dati.materials.length === 0 ? (
        <EmptyState title="Il listino è vuoto" description={`Scrivi ogni ${preset.materiale} con unità e costo d'acquisto: le ${preset.voci.toLowerCase()} lo useranno.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs text-ink-400">
                <th className="px-4 py-2.5 text-left font-medium">Nome</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo</th>
                <th className="px-4 py-2.5 text-right font-medium">Scarto</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo utile</th>
                <th className="px-4 py-2.5 text-left font-medium">Categoria</th>
                <th className="px-4 py-2.5 text-right font-medium">Usato in</th>
              </tr>
            </thead>
            <tbody>
              {dati.materials.map((m) => (
                <tr
                  key={m.uuid}
                  onClick={() => canEdit && setModifica(m)}
                  className={`border-b border-ink-800 last:border-0 ${canEdit ? 'cursor-pointer hover:bg-ink-800/40' : ''}`}
                >
                  <td className="px-4 py-2 text-ink-100">
                    {m.name}
                    {m.supplier && <span className="block text-[11px] text-ink-500">{m.supplier}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                    {euro(m.unit_cost_cents, true)}/{m.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-400">{m.waste_pct ? percent(m.waste_pct, 0) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-100">
                    {euro(Math.round(costoUtile(m)), true)}/{m.unit}
                  </td>
                  <td className="px-4 py-2 text-ink-400">{m.category ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-ink-400">{usi.get(m.uuid) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modifica && (
        <SchedaMateriale
          companyUuid={companyUuid}
          materiale={modifica === 'nuovo' ? null : modifica}
          onClose={() => setModifica(null)}
          onSaved={(testo) => {
            setModifica(null)
            mostraAvviso(testo)
            onCambiato()
          }}
        />
      )}
    </Card>
  )
}

function SchedaMateriale({
  companyUuid,
  materiale,
  onClose,
  onSaved
}: {
  companyUuid: string
  materiale: MarginMaterial | null
  onClose: () => void
  onSaved: (testo: string) => void
}): React.JSX.Element {
  const [f, setF] = useState({
    name: materiale?.name ?? '',
    unit: materiale?.unit ?? 'kg',
    costo: materiale ? euroInput(materiale.unit_cost_cents) : '',
    scarto: materiale ? String(materiale.waste_pct).replace('.', ',') : '0',
    category: materiale?.category ?? '',
    supplier: materiale?.supplier ?? ''
  })
  const [errore, setErrore] = useState<string | null>(null)
  const salva = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const body = {
      name: f.name,
      unit: f.unit,
      unit_cost_cents: parseEuro(f.costo) ?? 0,
      waste_pct: Number(f.scarto.replace(',', '.')) || 0,
      category: f.category,
      supplier: f.supplier
    }
    try {
      if (materiale) await api.put(`/api/companies/${companyUuid}/margin-materials/${materiale.uuid}`, body)
      else await api.post(`/api/companies/${companyUuid}/margin-materials`, body)
      onSaved(materiale ? `${f.name} aggiornato.` : `${f.name} aggiunto al listino.`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    }
  }
  const elimina = async (): Promise<void> => {
    if (!materiale || !confirm(`Togliere ${materiale.name} dal listino?`)) return
    try {
      await api.delete(`/api/companies/${companyUuid}/margin-materials/${materiale.uuid}`)
      onSaved(`${materiale.name} tolto dal listino.`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    }
  }
  return (
    <Modal title={materiale ? materiale.name : 'Nuova voce del listino'} subtitle="Costo d'acquisto IVA esclusa, per unità." onClose={onClose}>
      <form onSubmit={salva}>
        <div className="grid grid-cols-2 gap-3 px-5 py-5 md:px-6">
          {errore && (
            <div className="col-span-2">
              <Alert>{errore}</Alert>
            </div>
          )}
          <div className="col-span-2">
            <Field label="Nome" required>
              <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!materiale} />
            </Field>
          </div>
          <Field label="Costo per unità (€)">
            <TextInput value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="Unità" hint="kg, l, pz, m, h…">
            <TextInput value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </Field>
          <Field label="Scarto %" hint="Pulitura, calo peso, sfridi">
            <TextInput value={f.scarto} onChange={(e) => setF({ ...f, scarto: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="Categoria">
            <TextInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Fornitore">
              <TextInput value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
            </Field>
          </div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-700 px-5 py-4 md:px-6">
          {materiale && (
            <Button type="button" variant="danger" className="mr-auto" onClick={() => void elimina()}>
              Togli
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" disabled={!f.name.trim()}>
            Salva
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

// --- impostazioni ---------------------------------------------------------------------------------

function ImpostazioniMargini({
  imp,
  costoPersonale,
  canEdit,
  onSalva
}: {
  imp: ImpostazioniMarginalita
  costoPersonale: number | null
  canEdit: boolean
  onSalva: (p: Partial<ImpostazioniMarginalita>) => Promise<void>
}): React.JSX.Element {
  const [f, setF] = useState({
    obiettivoFoodCost: String(imp.obiettivoFoodCost).replace('.', ','),
    obiettivoMargine: String(imp.obiettivoMargine).replace('.', ','),
    costiGeneraliPct: String(imp.costiGeneraliPct).replace('.', ','),
    costoOrario: imp.costoOrarioCents === null ? '' : euroInput(imp.costoOrarioCents),
    ivaPct: String(imp.ivaPct).replace('.', ',')
  })
  const n = (t: string): number => Number(t.replace(',', '.'))
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Che attività è">
        <div className="flex flex-col gap-2 px-5 py-4">
          {TIPI_ATTIVITA.map((t) => (
            <button
              key={t}
              type="button"
              disabled={!canEdit}
              onClick={() => void onSalva(normalizzaMarginalita({ tipo: t as TipoAttivita, ivaPct: PRESET[t as TipoAttivita].iva }, imp))}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm ${
                imp.tipo === t ? 'border-brand-400/60 bg-brand-500/10 text-ink-100' : 'border-ink-700 text-ink-300 hover:border-ink-500'
              }`}
            >
              <span className={`h-3 w-3 rounded-full border-2 ${imp.tipo === t ? 'border-brand-400 bg-brand-400' : 'border-ink-500'}`} />
              {TIPO_ATTIVITA_LABELS[t as TipoAttivita]}
            </button>
          ))}
          <p className="text-[11px] text-ink-500">Cambia nomi, schede e obiettivi della sezione. Le voci già scritte restano.</p>
        </div>
      </Card>
      <Card title="Obiettivi e costi">
        <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3 px-5 py-4">
          {imp.tipo === 'ristorazione' && (
            <Field label="Food cost obiettivo %" hint="Di solito 25-35% del prezzo">
              <TextInput value={f.obiettivoFoodCost} onChange={(e) => setF({ ...f, obiettivoFoodCost: e.target.value })} inputMode="decimal" />
            </Field>
          )}
          <Field label="Margine netto obiettivo %" hint="Per il prezzo consigliato">
            <TextInput value={f.obiettivoMargine} onChange={(e) => setF({ ...f, obiettivoMargine: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="Costi generali %" hint="Sul costo diretto: affitto, utenze, struttura">
            <TextInput value={f.costiGeneraliPct} onChange={(e) => setF({ ...f, costiGeneraliPct: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="Costo di un'ora (€)" hint={costoPersonale !== null ? `vuoto = ${euro(costoPersonale, true)} dal Personale` : 'vuoto = dal Personale'}>
            <TextInput value={f.costoOrario} onChange={(e) => setF({ ...f, costoOrario: e.target.value })} inputMode="decimal" placeholder="—" />
          </Field>
          <Field label="IVA delle voci nuove %">
            <TextInput value={f.ivaPct} onChange={(e) => setF({ ...f, ivaPct: e.target.value })} inputMode="decimal" />
          </Field>
          {canEdit && (
            <div className="col-span-2 flex justify-end">
              <Button
                variant="primary"
                onClick={() =>
                  void onSalva({
                    obiettivoFoodCost: n(f.obiettivoFoodCost),
                    obiettivoMargine: n(f.obiettivoMargine),
                    costiGeneraliPct: n(f.costiGeneraliPct),
                    costoOrarioCents: f.costoOrario.trim() ? parseEuro(f.costoOrario) : null,
                    ivaPct: n(f.ivaPct)
                  })
                }
              >
                Salva
              </Button>
            </div>
          )}
        </fieldset>
      </Card>
    </div>
  )
}

// --- editor di una voce ------------------------------------------------------------------------------

interface RigaBozza {
  chiave: string
  phase: 'preventivo' | 'consuntivo'
  kind: KindRiga
  material_uuid: string | null
  employee_uuid: string | null
  description: string
  qty: string
  unit: string
  /** Vuoto = costo dal listino/Personale. */
  costo: string
}

let contatore = 0
const nuovaChiave = (): string => `r${++contatore}`

function daRiga(l: MarginLine): RigaBozza {
  return {
    chiave: nuovaChiave(),
    phase: l.phase,
    kind: l.kind,
    material_uuid: l.material_uuid,
    employee_uuid: l.employee_uuid,
    description: l.description ?? '',
    qty: String(l.qty).replace('.', ','),
    unit: l.unit ?? '',
    costo: l.unit_cost_cents === null ? '' : euroInput(l.unit_cost_cents)
  }
}

function EditorVoce({
  companyUuid,
  voce,
  dati,
  ctx,
  canEdit,
  onClose,
  onSaved
}: {
  companyUuid: string
  voce: MarginItem | null
  dati: Payload
  ctx: ContestoCosti
  canEdit: boolean
  onClose: () => void
  onSaved: (testo: string) => void
}): React.JSX.Element {
  const imp = dati.settings
  const preset = PRESET[imp.tipo]
  const kind = voce?.kind ?? preset.kind
  const commessa = kind === 'commessa' || kind === 'servizio'
  const iva = voce?.vat_pct ?? imp.ivaPct
  const [f, setF] = useState({
    name: voce?.name ?? '',
    category: voce?.category ?? '',
    // Ricette e prodotti: il prezzo si scrive come in carta (con l'IVA); una commessa senza.
    prezzo: voce ? euroInput(commessa ? voce.price_cents : Math.round(voce.price_cents * (1 + iva / 100))) : '',
    iva: String(iva).replace('.', ','),
    resa: String(voce?.yield_qty ?? 1).replace('.', ','),
    volume: voce?.monthly_volume === null || voce?.monthly_volume === undefined ? '' : String(voce.monthly_volume),
    generali: voce?.overhead_pct === null || voce?.overhead_pct === undefined ? '' : String(voce.overhead_pct).replace('.', ','),
    status: voce?.status ?? (commessa ? 'preventivo' : 'attiva'),
    customer: voce?.customer ?? ''
  })
  const [righe, setRighe] = useState<RigaBozza[]>(() => (voce?.lines ?? []).map(daRiga))
  const [fase, setFase] = useState<'preventivo' | 'consuntivo'>('preventivo')
  const [errore, setErrore] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const n = (t: string): number => {
    const x = Number(t.replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }
  const ivaN = n(f.iva)
  const prezzoNetto = commessa ? (parseEuro(f.prezzo) ?? 0) : Math.round((parseEuro(f.prezzo) ?? 0) / (1 + ivaN / 100))

  const verso = (r: RigaBozza): MarginLine => ({
    uuid: r.chiave,
    item_uuid: voce?.uuid ?? '',
    company_uuid: companyUuid,
    phase: r.phase,
    kind: r.kind,
    material_uuid: r.kind === 'materiale' ? r.material_uuid : null,
    employee_uuid: r.kind === 'manodopera' ? r.employee_uuid : null,
    description: r.description || null,
    qty: n(r.qty),
    unit: r.unit || null,
    unit_cost_cents: r.costo.trim() ? parseEuro(r.costo) : null,
    position: 0,
    created_at: '',
    updated_at: '',
    synced: 0,
    deleted: 0
  })
  const voceCalcolo = {
    uuid: voce?.uuid ?? 'nuova',
    kind,
    name: f.name,
    price_cents: prezzoNetto,
    vat_pct: ivaN,
    yield_qty: Math.max(0.0001, n(f.resa) || 1),
    monthly_volume: f.volume.trim() ? n(f.volume) : null,
    overhead_pct: f.generali.trim() ? n(f.generali) : null
  }
  const dellaFase = righe.filter((r) => r.phase === fase)
  const calcolo = calcolaVoce(voceCalcolo, dellaFase.map(verso), ctx, imp)
  const preventivo = commessa && fase === 'consuntivo' ? calcolaVoce(voceCalcolo, righe.filter((r) => r.phase === 'preventivo').map(verso), ctx, imp) : null

  const aggiungi = (k: KindRiga): void =>
    setRighe((l) => [
      ...l,
      {
        chiave: nuovaChiave(),
        phase: fase,
        kind: k,
        material_uuid: null,
        employee_uuid: null,
        description: k === 'manodopera' ? 'Lavorazione' : '',
        qty: k === 'manodopera' ? '1' : '1',
        unit: k === 'manodopera' ? 'h' : '',
        costo: ''
      }
    ])
  const cambia = (chiave: string, p: Partial<RigaBozza>): void => setRighe((l) => l.map((r) => (r.chiave === chiave ? { ...r, ...p } : r)))

  const salva = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!canEdit) return
    setBusy(true)
    setErrore(null)
    const body = {
      kind,
      name: f.name,
      category: f.category,
      price_cents: prezzoNetto,
      vat_pct: ivaN,
      yield_qty: voceCalcolo.yield_qty,
      monthly_volume: voceCalcolo.monthly_volume,
      overhead_pct: voceCalcolo.overhead_pct,
      status: f.status,
      customer: f.customer,
      lines: righe.map((r) => {
        const l = verso(r)
        return { phase: l.phase, kind: l.kind, material_uuid: l.material_uuid, employee_uuid: l.employee_uuid, description: l.description, qty: l.qty, unit: l.unit, unit_cost_cents: l.unit_cost_cents }
      })
    }
    try {
      if (voce) await api.put(`/api/companies/${companyUuid}/margin-items/${voce.uuid}`, body)
      else await api.post(`/api/companies/${companyUuid}/margin-items`, body)
      onSaved(voce ? `${f.name} aggiornata.` : `${f.name} creata.`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  const elimina = async (): Promise<void> => {
    if (!voce || !confirm(`Eliminare «${voce.name}»?`)) return
    try {
      await api.delete(`/api/companies/${companyUuid}/margin-items/${voce.uuid}`)
      onSaved(`${voce.name} eliminata.`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    }
  }

  const duplica = async (): Promise<void> => {
    if (!voce) return
    try {
      await api.post(`/api/companies/${companyUuid}/margin-items`, {
        ...voce,
        name: `${voce.name} (copia)`,
        lines: voce.lines.map((l) => ({ ...l }))
      })
      onSaved(`Creata «${voce.name} (copia)».`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Copia non riuscita.')
    }
  }

  const riga = (label: string, v: number, forte = false, tono = ''): React.JSX.Element => (
    <div className={`flex items-baseline justify-between gap-3 py-0.5 ${forte ? 'mt-1 border-t border-ink-700 pt-1.5 font-semibold text-ink-100' : 'text-ink-300'}`}>
      <span className="text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${tono}`}>{euro(v, !commessa)}</span>
    </div>
  )

  return (
    <Modal
      title={voce ? voce.name : `Nuova ${preset.voce}`}
      subtitle={commessa ? 'Preventivo e consuntivo di materiali, ore e lavorazioni.' : 'Il costo si ricalcola mentre scrivi.'}
      onClose={onClose}
      larga
    >
      <form onSubmit={salva}>
        {/* Sul telefono il riepilogo sta in fondo: in cima resta una riga con i numeri che contano. */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-850/95 px-4 py-2 text-xs backdrop-blur md:hidden">
          <span className="text-ink-400">
            costo <span className="font-semibold tabular-nums text-ink-100">{euro(calcolo.costoPieno, !commessa)}</span>
          </span>
          <span className="text-ink-400">
            {kind === 'ricetta' ? 'food cost ' : 'margine '}
            <span className="font-semibold tabular-nums text-ink-100">{percent(kind === 'ricetta' ? calcolo.foodCostPct : calcolo.marginePct)}</span>
          </span>
          <span className="text-ink-400">
            resta{' '}
            <span className={`font-semibold tabular-nums ${calcolo.margineNetto < 0 ? 'text-negative' : 'text-positive'}`}>{euro(calcolo.margineNetto, !commessa)}</span>
          </span>
        </div>
        <div className="grid gap-5 px-4 py-5 md:grid-cols-[1fr_15rem] md:px-6">
          <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
            {errore && <Alert>{errore}</Alert>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2">
                <Field label="Nome" required>
                  <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!voce} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label={commessa ? 'Cliente' : 'Categoria'}>
                  {commessa ? (
                    <TextInput value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
                  ) : (
                    <TextInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="es. Pizze" />
                  )}
                </Field>
              </div>
              <Field label={commessa ? 'Importo (IVA escl.)' : 'Prezzo in carta'} hint={commessa ? undefined : `con l'IVA al ${f.iva}%`}>
                <TextInput value={f.prezzo} onChange={(e) => setF({ ...f, prezzo: e.target.value })} inputMode="decimal" />
              </Field>
              {commessa ? (
                <Field label="Stato">
                  <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as MarginItem['status'] })}>
                    <option value="preventivo">Preventivo</option>
                    <option value="in_corso">In corso</option>
                    <option value="chiusa">Chiusa</option>
                    <option value="archiviata">Archiviata</option>
                  </Select>
                </Field>
              ) : (
                <Field label={kind === 'ricetta' ? 'Porzioni della ricetta' : 'Pezzi prodotti'} hint="la ricetta fa…">
                  <TextInput value={f.resa} onChange={(e) => setF({ ...f, resa: e.target.value })} inputMode="decimal" />
                </Field>
              )}
              {!commessa && (
                <Field label="Vendite al mese" hint="per il menu engineering">
                  <TextInput value={f.volume} onChange={(e) => setF({ ...f, volume: e.target.value })} inputMode="decimal" />
                </Field>
              )}
              <Field label="Costi generali %" hint={`vuoto = ${String(imp.costiGeneraliPct).replace('.', ',')}%`}>
                <TextInput value={f.generali} onChange={(e) => setF({ ...f, generali: e.target.value })} inputMode="decimal" />
              </Field>
            </div>

            {commessa && (
              <div className="flex flex-wrap items-center gap-2">
                <Segmentato
                  piccolo
                  valore={fase}
                  onChange={setFase}
                  opzioni={[
                    { id: 'preventivo', label: `Preventivo · ${righe.filter((r) => r.phase === 'preventivo').length}` },
                    { id: 'consuntivo', label: `Consuntivo · ${righe.filter((r) => r.phase === 'consuntivo').length}` }
                  ]}
                />
                {fase === 'consuntivo' && canEdit && (
                  <button
                    type="button"
                    className="text-xs text-brand-300 hover:underline"
                    onClick={() =>
                      setRighe((l) => [
                        ...l.filter((r) => r.phase !== 'consuntivo'),
                        ...l.filter((r) => r.phase === 'preventivo').map((r) => ({ ...r, chiave: nuovaChiave(), phase: 'consuntivo' as const }))
                      ])
                    }
                  >
                    Parti dal preventivo
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {dellaFase.length === 0 && <p className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-sm text-ink-500">Aggiungi di cosa è fatta: {preset.materiali.toLowerCase()}, ore di lavoro, lavorazioni esterne.</p>}
              {dellaFase.map((r) => {
                const c = costoRiga(verso(r), ctx)
                const materiale = r.material_uuid ? ctx.materiali.get(r.material_uuid) : undefined
                return (
                  <div key={r.chiave} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-ink-700 bg-ink-900/40 p-2.5 sm:grid-cols-[7rem_1fr_5.5rem_6.5rem_5.5rem_auto] sm:items-center">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-ink-500 sm:normal-case sm:tracking-normal">{KIND_RIGA_LABELS[r.kind]}</span>
                    <button
                      type="button"
                      onClick={() => setRighe((l) => l.filter((x) => x.chiave !== r.chiave))}
                      className="justify-self-end rounded p-1 text-ink-500 hover:bg-negative/15 hover:text-negative sm:order-last"
                      aria-label="Togli la riga"
                    >
                      <Icona nome="chiudi" className="h-3.5 w-3.5" />
                    </button>
                    <div className="col-span-2 sm:col-span-1">
                      {r.kind === 'materiale' ? (
                        <Select
                          value={r.material_uuid ?? ''}
                          onChange={(e) => {
                            const m = ctx.materiali.get(e.target.value)
                            cambia(r.chiave, { material_uuid: e.target.value || null, unit: m?.unit ?? r.unit })
                          }}
                          className="py-1 text-sm"
                        >
                          <option value="">— scegli dal listino —</option>
                          {dati.materials.map((m) => (
                            <option key={m.uuid} value={m.uuid}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                      ) : r.kind === 'manodopera' && dati.personale.persone.length > 0 ? (
                        <Select value={r.employee_uuid ?? ''} onChange={(e) => cambia(r.chiave, { employee_uuid: e.target.value || null })} className="py-1 text-sm">
                          <option value="">Costo orario medio</option>
                          {dati.personale.persone.map((p) => (
                            <option key={p.uuid} value={p.uuid}>
                              {p.name}
                              {p.role ? ` · ${p.role}` : ''}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <TextInput value={r.description} onChange={(e) => cambia(r.chiave, { description: e.target.value })} placeholder="Descrizione" className="py-1 text-sm" />
                      )}
                    </div>
                    <label className="flex items-center gap-1">
                      <input
                        value={r.qty}
                        onChange={(e) => cambia(r.chiave, { qty: e.target.value })}
                        inputMode="decimal"
                        className="w-full min-w-0 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm tabular-nums text-ink-100 outline-none focus:border-brand-500"
                        aria-label="Quantità"
                      />
                      <span className="w-6 text-[11px] text-ink-500">{materiale?.unit ?? (r.unit || (r.kind === 'manodopera' ? 'h' : 'pz'))}</span>
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        value={r.costo}
                        onChange={(e) => cambia(r.chiave, { costo: e.target.value })}
                        inputMode="decimal"
                        placeholder={c.manca ? 'costo?' : euroInput(Math.round(c.unitario))}
                        className={`w-full min-w-0 rounded-md border bg-ink-900 px-2 py-1 text-right text-sm tabular-nums text-ink-100 outline-none focus:border-brand-500 ${c.manca && !r.costo ? 'border-warning/60' : 'border-ink-700'}`}
                        aria-label="Costo unitario"
                        title="Vuoto = dal listino o dal Personale"
                      />
                      <span className="text-[11px] text-ink-500">€</span>
                    </label>
                    <span className="text-right text-sm font-medium tabular-nums text-ink-100">{euro(Math.round(c.totale), true)}</span>
                  </div>
                )
              })}
              {canEdit && (
                <div className="flex flex-wrap gap-1.5">
                  {(['materiale', 'manodopera', 'esterno', 'altro'] as KindRiga[]).map((k) => (
                    <button key={k} type="button" onClick={() => aggiungi(k)} className="inline-flex items-center gap-1 rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-300 hover:border-brand-400/60 hover:text-brand-200">
                      <Icona nome="piu" className="h-3 w-3" /> {k === 'materiale' ? preset.materiale : KIND_RIGA_LABELS[k].toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </fieldset>

          <aside className="h-fit rounded-xl border border-ink-700 bg-ink-900/60 p-4 md:sticky md:top-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              {commessa ? (fase === 'consuntivo' ? 'Consuntivo' : 'Preventivo') : kind === 'ricetta' ? 'Per porzione' : 'Per pezzo'}
            </p>
            <div className="mt-2">
              {riga(preset.materiali, calcolo.materiali)}
              {riga('Manodopera', calcolo.manodopera)}
              {calcolo.esterni > 0 && riga('Lavorazioni esterne', calcolo.esterni)}
              {calcolo.altro > 0 && riga('Altro', calcolo.altro)}
              {riga('Costo diretto', calcolo.diretti, true)}
              {riga('Costi generali', calcolo.generali)}
              {riga('Costo pieno', calcolo.costoPieno, true)}
              {riga(commessa ? 'Importo' : 'Prezzo (IVA escl.)', calcolo.prezzo)}
              {riga('Resta', calcolo.margineNetto, true, calcolo.margineNetto < 0 ? 'text-negative' : 'text-positive')}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {kind === 'ricetta' ? (
                <div className="rounded-lg bg-ink-850 px-3 py-2">
                  <p className="text-[10px] text-ink-500">food cost</p>
                  <p className={`text-sm font-semibold tabular-nums ${(calcolo.foodCostPct ?? 0) > imp.obiettivoFoodCost ? 'text-warning' : 'text-positive'}`}>{percent(calcolo.foodCostPct)}</p>
                </div>
              ) : (
                <div className="rounded-lg bg-ink-850 px-3 py-2">
                  <p className="text-[10px] text-ink-500">ricarico</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-100">{percent(calcolo.ricaricoPct, 0)}</p>
                </div>
              )}
              <div className="rounded-lg bg-ink-850 px-3 py-2">
                <p className="text-[10px] text-ink-500">margine</p>
                <p className="text-sm font-semibold tabular-nums text-ink-100">{percent(calcolo.marginePct)}</p>
              </div>
            </div>
            {calcolo.prezzoConsigliato !== null && (
              <p className="mt-3 text-[11px] text-ink-400">
                Prezzo consigliato:{' '}
                <span className="font-semibold text-brand-300">
                  {euro(commessa ? calcolo.prezzoConsigliato : Math.round(calcolo.prezzoConsigliato * (1 + ivaN / 100)), !commessa)}
                </span>
                {commessa ? '' : ' in carta'} (
                {imp.tipo === 'ristorazione' && kind === 'ricetta' ? `food cost ${percent(imp.obiettivoFoodCost, 0)}` : `margine ${percent(imp.obiettivoMargine, 0)}`})
              </p>
            )}
            {preventivo && (
              <p className="mt-2 text-[11px] text-ink-400">
                Rispetto al preventivo:{' '}
                <span className={calcolo.costoPieno > preventivo.costoPieno ? 'text-negative' : 'text-positive'}>
                  {calcolo.costoPieno > preventivo.costoPieno ? '+' : ''}
                  {euro(calcolo.costoPieno - preventivo.costoPieno)}
                </span>
              </p>
            )}
            {calcolo.costiMancanti && <p className="mt-2 text-[11px] text-warning">Qualche riga non ha un costo: sceglila dal listino o scrivilo.</p>}
          </aside>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-700 px-4 py-4 md:px-6">
          {voce && canEdit && (
            <>
              <Button type="button" variant="danger" onClick={() => void elimina()}>
                Elimina
              </Button>
              <Button type="button" className="mr-auto" onClick={() => void duplica()}>
                Duplica
              </Button>
            </>
          )}
          <Button type="button" onClick={onClose}>
            {canEdit ? 'Annulla' : 'Chiudi'}
          </Button>
          {canEdit && (
            <Button type="submit" variant="primary" disabled={busy || !f.name.trim()}>
              Salva
            </Button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
