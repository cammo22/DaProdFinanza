import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Analysis, TreasuryView } from '@shared/analysis'
import { THRESHOLDS } from '@shared/engine'
import type { Company } from '@shared/types'
import { dataIt, days, euro, percent, times } from '../../lib/format'
import type { Vista } from '../../components/Sidebar'
import { Barra, Segmenti } from '../../components/widgets'
import { Griglia } from '../../components/Pannelli'

/**
 * Cruscotto in cima alla Panoramica: a colpo d'occhio, a widget.
 *
 * L'impostazione (striscia di indicatori con barre a segmenti, schede che
 * scorrono, elenchi con barrette di proporzione, "Gestisci widget",
 * aggiornamento automatico) è un'idea presa dalle dashboard di Ever Gauzy;
 * il codice è nostro. Quali widget mostrare lo decide chi guarda, e resta
 * salvato su questo computer.
 */

type WidgetId = 'indicatori' | 'scadenze' | 'ripartizione' | 'salute'

const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'indicatori', label: 'Indicatori del periodo' },
  { id: 'scadenze', label: 'Scadenze in arrivo' },
  { id: 'ripartizione', label: 'Dove vanno i ricavi' },
  { id: 'salute', label: "Salute dell'azienda" }
]

const STORAGE_KEY = 'daprodfinanza.cruscotto'

function leggiPreferenze(): { nascosti: WidgetId[]; auto: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { nascosti: Array.isArray(p.nascosti) ? p.nascosti : [], auto: p.auto === true }
    }
  } catch {
    // archivio del browser non disponibile: valgono i predefiniti
  }
  return { nascosti: [], auto: false }
}

function salvaPreferenze(p: { nascosti: WidgetId[]; auto: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // niente da fare: la scelta vale solo per questa sessione
  }
}

function Menu({ onNascondi, extra }: { onNascondi: () => void; extra?: { label: string; azione: () => void } }): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aperto) return
    const chiudi = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', chiudi)
    return () => document.removeEventListener('mousedown', chiudi)
  }, [aperto])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Opzioni del widget"
        onClick={() => setAperto((a) => !a)}
        className="rounded px-1.5 text-base leading-none text-ink-400 hover:bg-ink-800 hover:text-ink-100"
      >
        ⋮
      </button>
      {aperto && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 text-xs shadow-xl">
          {extra && (
            <button type="button" className="block w-full px-3 py-1.5 text-left text-ink-200 hover:bg-ink-800" onClick={() => { setAperto(false); extra.azione() }}>
              {extra.label}
            </button>
          )}
          <button type="button" className="block w-full px-3 py-1.5 text-left text-ink-200 hover:bg-ink-800" onClick={() => { setAperto(false); onNascondi() }}>
            Nascondi widget
          </button>
        </div>
      )}
    </div>
  )
}

function Widget({
  titolo,
  menu,
  azioni,
  children,
  className = ''
}: {
  titolo: string
  menu: React.ReactNode
  azioni?: React.ReactNode
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <section className={`flex flex-col rounded-xl border border-ink-700 bg-ink-850 ${className}`}>
      <header className="flex items-center gap-2 px-5 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-ink-100">{titolo}</h3>
        <div className="ml-auto flex items-center gap-2">
          {azioni}
          {menu}
        </div>
      </header>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </section>
  )
}

function Tile({
  label,
  valore,
  sotto,
  children
}: {
  label: string
  valore: string
  sotto?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-ink-300">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-ink-100 tabular-nums">{valore}</p>
      {children}
      {sotto && <p className="mt-1.5 text-[11px] text-ink-400">{sotto}</p>}
    </div>
  )
}

// --- cruscotto ------------------------------------------------------------------

/**
 * Il cruscotto come pezzi separati: l'intestazione (sopra i pannelli) e i
 * widget, che diventano pannelli indipendenti della Panoramica.
 */
export function useCruscotto({
  company,
  analysis,
  tesoreria,
  onVista,
  onRefresh
}: {
  company: Company
  analysis: Analysis
  tesoreria: TreasuryView | null
  onVista: (vista: Vista) => void
  onRefresh: () => void
}): { intestazione: ReactNode; pannelli: ReactNode[] } {
  const [pref, setPref] = useState(leggiPreferenze)
  const [gestisci, setGestisci] = useState(false)
  const [aggiornato, setAggiornato] = useState(() => new Date())
  const [pagina, setPagina] = useState(0)

  const aggiorna = (): void => {
    onRefresh()
    setAggiornato(new Date())
  }

  // Aggiornamento automatico: utile quando i dati arrivano da fuori (sync, altro utente).
  useEffect(() => {
    if (!pref.auto) return
    const timer = setInterval(aggiorna, 60_000)
    return () => clearInterval(timer)
  }, [pref.auto]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambia = (p: { nascosti: WidgetId[]; auto: boolean }): void => {
    setPref(p)
    salvaPreferenze(p)
  }
  const visibile = (id: WidgetId): boolean => !pref.nascosti.includes(id)
  const nascondi = (id: WidgetId): void => cambia({ ...pref, nascosti: [...pref.nascosti, id] })

  const a = analysis.incomeStatement.aggregates
  const r = analysis.ratios
  const budget = analysis.comparison.columns.find((c) => c.key === 'budget')?.aggregates ?? null
  const ytd = analysis.comparison.columns.find((c) => c.key === 'ytd')?.aggregates ?? null
  const annoPrima = analysis.comparison.columns.find((c) => c.key === 'previousYear')?.aggregates ?? null
  const mese = analysis.period.month

  // Scadenze dei prossimi 30 giorni, le più vicine prima.
  const scadenze = useMemo(() => {
    if (!tesoreria) return []
    const limite = addGiorni(tesoreria.today, 30)
    return tesoreria.flows
      .filter((f) => f.date <= limite)
      .sort((x, y) => x.date.localeCompare(y.date))
  }, [tesoreria])
  const perPagina = 3
  const pagine = Math.max(1, Math.ceil(scadenze.length / perPagina))
  const paginaCorrente = Math.min(pagina, pagine - 1)

  const voci = [
    { nome: 'Rimanenze iniziali', valore: a.rimanenzeIniziali },
    { nome: 'Materie prime e merci', valore: a.costiMateriePrime },
    { nome: 'Costi di produzione', valore: a.costiProduzione },
    { nome: 'Personale', valore: a.costiPersonale },
    { nome: 'Costi commerciali', valore: a.costiCommerciali },
    { nome: 'Generali e amministrativi', valore: a.costiGenerali },
    { nome: 'Ammortamenti', valore: a.ammortamenti },
    { nome: 'Oneri finanziari', valore: a.oneriFinanziari },
    { nome: 'Oneri straordinari', valore: a.oneriStraordinari },
    { nome: 'Imposte', valore: a.imposte }
  ].filter((v) => v.valore > 0)

  const salute: { nome: string; valore: number | null; testo: string; soglia: number; scala: number; meglio: 'alto' | 'basso' }[] = [
    { nome: 'Redditività delle vendite (ROS)', valore: r.ros, testo: percent(r.ros), soglia: THRESHOLDS.ros.min, scala: 30, meglio: 'alto' },
    { nome: 'Margine EBITDA', valore: r.molPercent, testo: percent(r.molPercent), soglia: THRESHOLDS.molPercent.min, scala: 40, meglio: 'alto' },
    { nome: 'Indipendenza finanziaria', valore: r.indipendenzaFinanziaria, testo: percent(r.indipendenzaFinanziaria), soglia: THRESHOLDS.indipendenzaFinanziaria.min, scala: 100, meglio: 'alto' },
    { nome: 'Indice di disponibilità', valore: r.indiceDisponibilita, testo: times(r.indiceDisponibilita), soglia: 1, scala: 3, meglio: 'alto' },
    { nome: 'Copertura del debito (DSCR)', valore: r.dscr, testo: times(r.dscr), soglia: THRESHOLDS.dscr.min, scala: 4, meglio: 'alto' },
    { nome: 'PFN / EBITDA', valore: r.pfnSuEbitda, testo: times(r.pfnSuEbitda), soglia: 3, scala: 6, meglio: 'basso' }
  ]

  const nascosti = WIDGETS.filter((w) => !visibile(w.id))

  return {
    intestazione: (
      <div className="flex flex-col gap-2">
      {/* Intestazione del cruscotto: percorso, titolo, comandi. */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] text-ink-400">
            ⌂ <span className="mx-1 text-ink-600">›</span> {company.name}
            <span className="mx-1 text-ink-600">›</span> <span className="text-ink-300">Panoramica</span>
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-100">
            Cruscotto di {analysis.period.label}{' '}
            <span className="font-normal text-ink-400">per {company.name}</span>
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-brand-300">
            <span
              role="switch"
              aria-checked={pref.auto}
              tabIndex={0}
              onClick={() => cambia({ ...pref, auto: !pref.auto })}
              onKeyDown={(e) => e.key === ' ' && cambia({ ...pref, auto: !pref.auto })}
              className={`relative h-4.5 w-8 rounded-full transition-colors ${pref.auto ? 'bg-brand-500' : 'bg-ink-700'}`}
            >
              <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${pref.auto ? 'left-4' : 'left-0.5'}`} />
            </span>
            Aggiornamento automatico
          </label>
          <button
            type="button"
            onClick={aggiorna}
            title={`Ultimo aggiornamento ${aggiornato.toLocaleTimeString('it-IT')}`}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
          >
            ↻ Aggiorna
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setGestisci((g) => !g)}
              className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
            >
              Gestisci widget ⋮
            </button>
            {gestisci && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-ink-700 bg-ink-850 p-2 text-xs shadow-xl">
                {WIDGETS.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-ink-200 hover:bg-ink-800">
                    <input
                      type="checkbox"
                      checked={visibile(w.id)}
                      onChange={(e) =>
                        cambia({
                          ...pref,
                          nascosti: e.target.checked
                            ? pref.nascosti.filter((x) => x !== w.id)
                            : [...pref.nascosti, w.id]
                        })
                      }
                    />
                    {w.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {nascosti.length > 0 && (
        <p className="text-[11px] text-ink-500">
          {nascosti.length === 1 ? '1 widget nascosto' : `${nascosti.length} widget nascosti`} ·{' '}
          <button type="button" className="text-brand-300 hover:underline" onClick={() => cambia({ ...pref, nascosti: [] })}>
            mostrali tutti
          </button>
        </p>
      )}
      </div>
    ),
    pannelli: [
      visibile('indicatori') ? (
        <section key="indicatori" className="relative grid grid-cols-2 divide-ink-700 rounded-xl border border-ink-700 bg-ink-850 lg:grid-cols-4 lg:divide-x">
          <div className="absolute right-3 top-3">
            <Menu onNascondi={() => nascondi('indicatori')} />
          </div>
          <Tile
            label={`Ricavi di ${analysis.period.label}`}
            valore={euro(a.ricaviNetti)}
            sotto={
              budget
                ? `${percent((a.ricaviNetti / Math.max(1, budget.ricaviNetti)) * 100, 0)} del budget (${euro(budget.ricaviNetti)})`
                : annoPrima
                  ? `anno prima ${euro(annoPrima.ricaviNetti)}`
                  : undefined
            }
          >
            <Segmenti
              quota={budget ? a.ricaviNetti / Math.max(1, budget.ricaviNetti) : annoPrima ? a.ricaviNetti / Math.max(1, annoPrima.ricaviNetti) / 1.2 : 0}
              colore={budget && a.ricaviNetti < budget.ricaviNetti ? 'bg-warning' : 'bg-positive'}
            />
          </Tile>
          <Tile
            label="Progressivo da inizio anno"
            valore={euro(ytd?.ricaviNetti ?? a.ricaviNetti)}
            sotto={mese ? `${mese} ${mese === 1 ? 'mese' : 'mesi'} su 12 · utile ${euro(ytd?.utile ?? a.utile)}` : `utile ${euro(a.utile)}`}
          >
            <Segmenti quota={mese ? mese / 12 : 1} colore="bg-brand-400" n={12} />
          </Tile>
          <Tile
            label="Liquidità oggi"
            valore={tesoreria ? euro(tesoreria.liquiditaOggi) : '—'}
            sotto={
              tesoreria?.sogliaMinima
                ? `soglia minima ${euro(tesoreria.sogliaMinima)}`
                : tesoreria
                  ? `fra 30 giorni ${euro(tesoreria.horizons.find((h) => h.days === 30)?.liquiditaFinale ?? null)}`
                  : 'tesoreria non impostata'
            }
          >
            <Segmenti
              quota={
                tesoreria && tesoreria.sogliaMinima
                  ? tesoreria.liquiditaOggi / (tesoreria.sogliaMinima * 4)
                  : tesoreria
                    ? tesoreria.liquiditaOggi / Math.max(1, ...tesoreria.curve.map((p) => p.liquidita))
                    : 0
              }
              colore={tesoreria?.tensione ? 'bg-negative' : 'bg-positive'}
            />
          </Tile>
          <Tile
            label="Margine EBITDA"
            valore={percent(r.molPercent)}
            sotto={`riferimento ${THRESHOLDS.molPercent.min}% · EBITDA ${euro(a.ebitda)}`}
          >
            <Barra
              quota={(r.molPercent ?? 0) / 40}
              soglia={THRESHOLDS.molPercent.min / 40}
              colore={(r.molPercent ?? 0) >= THRESHOLDS.molPercent.min ? 'bg-brand-500' : 'bg-warning'}
            />
          </Tile>
        </section>
      ) : null,
      <Griglia key="widget" colonne={2}>
        {visibile('scadenze') && (
          <Widget
            titolo="Scadenze in arrivo"
            menu={<Menu onNascondi={() => nascondi('scadenze')} extra={{ label: 'Apri la tesoreria', azione: () => onVista('tesoreria') }} />}
            azioni={
              scadenze.length > perPagina && (
                <span className="flex items-center gap-1">
                  <button type="button" aria-label="Precedenti" disabled={paginaCorrente === 0} onClick={() => setPagina(paginaCorrente - 1)} className="h-6 w-6 rounded-full bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:opacity-40">‹</button>
                  <button type="button" aria-label="Successive" disabled={paginaCorrente >= pagine - 1} onClick={() => setPagina(paginaCorrente + 1)} className="h-6 w-6 rounded-full bg-ink-800 text-ink-200 hover:bg-ink-700 disabled:opacity-40">›</button>
                  <button type="button" onClick={() => onVista('tesoreria')} className="ml-1 rounded-md border border-brand-500/50 px-2 py-0.5 text-[11px] text-brand-300 hover:bg-brand-500/10">Vedi tutte</button>
                </span>
              )
            }
          >
            {!tesoreria || scadenze.length === 0 ? (
              <p className="py-6 text-sm text-ink-400">Nessuna scadenza nei prossimi 30 giorni.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {scadenze.slice(paginaCorrente * perPagina, paginaCorrente * perPagina + perPagina).map((f) => {
                  const mancano = giorniTra(tesoreria.today, f.date)
                  const entrata = f.direction === 'in'
                  return (
                    <div
                      key={`${f.item_uuid}-${f.date}`}
                      className={`flex flex-col rounded-lg border bg-ink-900 p-3 ${f.overdue ? 'border-negative/60' : 'border-ink-700'}`}
                    >
                      <span className={`self-start rounded px-1.5 py-0.5 text-[10px] font-semibold ${entrata ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative'}`}>
                        {entrata ? 'Incasso' : 'Pagamento'}
                      </span>
                      <p className="mt-2 line-clamp-2 min-h-8 text-xs text-ink-200" title={f.description}>{f.description}</p>
                      <p className="mt-2 font-mono text-sm font-semibold text-ink-100">{euro(f.cents)}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {f.overdue ? `scaduta da ${f.overdueDays} gg` : `${dataIt(f.date)} · fra ${mancano} gg`}
                      </p>
                      <Barra quota={f.overdue ? 1 : 1 - mancano / 30} colore={f.overdue ? 'bg-negative' : entrata ? 'bg-positive' : 'bg-warning'} />
                    </div>
                  )
                })}
              </div>
            )}
          </Widget>
        )}

        {visibile('ripartizione') && (
          <Widget
            titolo="Dove vanno i ricavi"
            menu={<Menu onNascondi={() => nascondi('ripartizione')} extra={{ label: 'Apri il conto economico', azione: () => onVista('conto-economico') }} />}
          >
            <ul className="flex flex-col">
              {[...voci, { nome: 'Utile', valore: a.utile }].map((v) => {
                const quota = a.ricaviNetti ? v.valore / a.ricaviNetti : 0
                const utile = v.nome === 'Utile'
                return (
                  <li key={v.nome} className="grid grid-cols-[1fr_3.5rem_7rem_6.5rem] items-center gap-3 border-b border-ink-800 py-2 last:border-0">
                    <span className={`truncate text-sm ${utile ? 'font-semibold text-ink-100' : 'text-ink-200'}`}>{v.nome}</span>
                    <span className="text-right font-mono text-xs text-ink-300">{percent(quota * 100)}</span>
                    <span className="h-1.5 rounded-full bg-ink-700">
                      <span
                        className={`block h-full rounded-full ${utile ? (v.valore >= 0 ? 'bg-positive' : 'bg-negative') : 'bg-negative/80'}`}
                        style={{ width: `${Math.min(100, Math.abs(quota) * 100 * 2)}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-xs text-ink-200">{euro(v.valore)}</span>
                  </li>
                )
              })}
            </ul>
          </Widget>
        )}

        {visibile('salute') && (
          <Widget
            titolo="Salute dell'azienda"
            className="lg:col-span-2"
            menu={<Menu onNascondi={() => nascondi('salute')} extra={{ label: 'Apri lo stato patrimoniale', azione: () => onVista('stato-patrimoniale') }} />}
          >
            <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              {salute.map((s) => {
                const ok = s.valore === null ? null : s.meglio === 'alto' ? s.valore >= s.soglia : s.valore <= s.soglia
                return (
                  <div key={s.nome}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-ink-300">{s.nome}</span>
                      <span className={`font-mono text-sm font-semibold ${ok === null ? 'text-ink-400' : ok ? 'text-positive' : 'text-negative'}`}>{s.testo}</span>
                    </div>
                    <Barra
                      quota={s.valore === null ? 0 : s.valore / s.scala}
                      soglia={s.soglia / s.scala}
                      colore={ok === null ? 'bg-ink-600' : ok ? 'bg-positive' : 'bg-negative'}
                    />
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-400">
              Il segno bianco è il riferimento del modello. Giorni di incasso {days(r.dso)}, di pagamento {days(r.dpo)}.
            </p>
          </Widget>
        )}
      </Griglia>
    ]
  }
}

function addGiorni(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function giorniTra(da: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000)
}
