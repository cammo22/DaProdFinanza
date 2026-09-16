import { useMemo, useState } from 'react'
import {
  impactRows,
  PARAMETRI_ZERO,
  simulate,
  type SimulationBase,
  type SimulationParams,
  type SimulationResult
} from '@shared/engine'
import type { SimulationScenario } from '@shared/types'
import { api } from '../../lib/api'
import { days, euro, euroInput, parseEuro, percent } from '../../lib/format'
import { Alert, Button, Card, Select, TextInput } from '../../components/ui'
import { ConfrontoBarre, ConfrontoCassa } from '../../components/charts'

/**
 * Analisi & Simulazioni — AGENTS.md §10.8.
 *
 * Lo scenario si ricalcola nella schermata, con lo stesso motore del server:
 * ogni leva mossa cambia i risultati subito. Si salva solo l'elenco delle
 * variazioni, mai i risultati, che dipendono dai numeri del giorno.
 */

const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function parametriDa(scenario: SimulationScenario): SimulationParams {
  try {
    return { ...PARAMETRI_ZERO, ...(JSON.parse(scenario.params) as Partial<SimulationParams>) }
  } catch {
    return PARAMETRI_ZERO
  }
}

/** Un numero con la virgola, o null se il campo è vuoto o non è un numero. */
function numero(testo: string): number | null {
  const t = testo.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function Leva({
  label,
  valore,
  min,
  max,
  step = 1,
  unita,
  onChange
}: {
  label: string
  valore: number
  min: number
  max: number
  step?: number
  unita: string
  onChange: (v: number) => void
}): React.JSX.Element {
  const [testo, setTesto] = useState<string | null>(null)
  const mostrato = testo ?? String(valore).replace('.', ',')
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-300">{label}</span>
        <span className="flex items-center gap-1">
          <input
            value={mostrato}
            onChange={(e) => {
              setTesto(e.target.value)
              const n = numero(e.target.value)
              if (n !== null) onChange(n)
            }}
            onBlur={() => setTesto(null)}
            inputMode="decimal"
            className={`w-16 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand-500 ${
              valore > 0 ? 'text-positive' : valore < 0 ? 'text-negative' : 'text-ink-100'
            }`}
          />
          <span className="w-6 text-xs text-ink-400">{unita}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, valore))}
        onChange={(e) => {
          setTesto(null)
          onChange(Number(e.target.value))
        }}
        className="mt-1.5 w-full accent-brand-500"
      />
    </div>
  )
}

function CampoEuro({
  label,
  valore,
  onChange
}: {
  label: string
  valore: number
  onChange: (cents: number) => void
}): React.JSX.Element {
  const [testo, setTesto] = useState<string | null>(null)
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-ink-300">{label}</span>
      <span className="flex items-center gap-1">
        <input
          value={testo ?? euroInput(valore)}
          onChange={(e) => {
            setTesto(e.target.value)
            const c = e.target.value.trim() ? parseEuro(e.target.value) : 0
            if (c !== null && c >= 0) onChange(c)
          }}
          onBlur={() => setTesto(null)}
          inputMode="decimal"
          placeholder="0"
          className="w-28 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm tabular-nums text-ink-100 outline-none focus:border-brand-500"
        />
        <span className="w-6 text-xs text-ink-400">€</span>
      </span>
    </label>
  )
}

function CampoNumero({
  label,
  valore,
  unita,
  placeholder,
  onChange
}: {
  label: string
  valore: number | null
  unita: string
  placeholder?: string
  onChange: (v: number | null) => void
}): React.JSX.Element {
  const [testo, setTesto] = useState<string | null>(null)
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-ink-300">{label}</span>
      <span className="flex items-center gap-1">
        <input
          value={testo ?? (valore === null ? '' : String(valore).replace('.', ','))}
          onChange={(e) => {
            setTesto(e.target.value)
            const n = numero(e.target.value)
            if (e.target.value.trim() === '') onChange(null)
            else if (n !== null && n >= 0) onChange(n)
          }}
          onBlur={() => setTesto(null)}
          inputMode="decimal"
          placeholder={placeholder}
          className="w-28 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm tabular-nums text-ink-100 outline-none placeholder:text-ink-500 focus:border-brand-500"
        />
        <span className="w-6 text-xs text-ink-400">{unita}</span>
      </span>
    </label>
  )
}

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="border-t border-ink-700 px-5 py-3 first:border-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{titolo}</p>
      {children}
    </div>
  )
}

type Verso = 'su' | 'giu' | null

function CardConfronto({
  label,
  attuale,
  simulato,
  formato,
  buono,
  minimo = 100,
  formatoDelta = formato
}: {
  label: string
  attuale: number | null
  simulato: number | null
  formato: (v: number | null) => string
  /** Da che parte è un miglioramento. */
  buono: Verso
  /** Sotto questa differenza non si mostra la variazione (1 € di default). */
  minimo?: number
  /** Come scrivere la differenza, se diverso dal valore (punti percentuali). */
  formatoDelta?: (v: number) => string
}): React.JSX.Element {
  const delta = attuale === null || simulato === null ? null : simulato - attuale
  const piccolo = delta === null || Math.abs(delta) < minimo
  const tono =
    buono === null || piccolo
      ? 'text-ink-300'
      : (delta! > 0) === (buono === 'su')
        ? 'text-positive'
        : 'text-negative'
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3.5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink-100">{formato(simulato)}</p>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums">
        <span className="whitespace-nowrap text-ink-500">attuale {formato(attuale)}</span>
        {!piccolo && (
          <span className={`whitespace-nowrap ${tono}`}>
            {delta! > 0 ? '▲' : '▼'} {formatoDelta(Math.abs(delta!))}
          </span>
        )}
      </p>
    </div>
  )
}

const CONFRONTI: {
  label: string
  valore: (r: SimulationResult) => number | null
  buono: Verso
  percento?: boolean
}[] = [
  { label: 'Ricavi', valore: (r) => r.ricavi, buono: 'su' },
  { label: 'Margine lordo', valore: (r) => r.margineLordoPercent, buono: 'su', percento: true },
  { label: 'EBITDA / MOL', valore: (r) => r.ebitda, buono: 'su' },
  { label: 'Utile netto', valore: (r) => r.utile, buono: 'su' },
  { label: 'Break-even', valore: (r) => r.breakEven, buono: 'giu' },
  { label: 'Cash flow annuo', valore: (r) => r.cashFlowAnnuo, buono: 'su' },
  { label: 'Liquidità fra 12 mesi', valore: (r) => r.liquiditaFinale, buono: 'su' },
  { label: 'Posizione finanziaria netta', valore: (r) => r.posizioneFinanziariaNetta, buono: 'giu' }
]

export function SimulationView({
  base,
  companyUuid,
  periodUuid,
  scenario,
  scenari,
  soglia,
  canEdit,
  onScenariChanged,
  onVaiTesoreria
}: {
  base: SimulationBase
  companyUuid: string
  periodUuid: string
  scenario: string
  scenari: SimulationScenario[]
  soglia: number | null
  canEdit: boolean
  onScenariChanged: () => void
  onVaiTesoreria: () => void
}): React.JSX.Element {
  const [params, setParams] = useState<SimulationParams>(PARAMETRI_ZERO)
  const [scelto, setScelto] = useState<string>('')
  const [nome, setNome] = useState('')
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof SimulationParams>(k: K, v: SimulationParams[K]): void =>
    setParams((p) => ({ ...p, [k]: v }))

  const attuale = useMemo(() => simulate(base, PARAMETRI_ZERO), [base])
  const simulato = useMemo(() => simulate(base, params), [base, params])
  const righe = useMemo(() => impactRows(attuale, simulato, params), [attuale, simulato, params])

  const oggi = new Date(`${base.today}T00:00:00`)
  const cassa = attuale.curva.map((v, i) => {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() + i, 1)
    return {
      label: i === 0 ? 'Oggi' : `${MESI_BREVI[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`,
      attuale: v,
      simulato: simulato.curva[i]!
    }
  })

  const fissi = (r: typeof attuale): number =>
    r.aggregates.costiPersonale + r.aggregates.costiCommerciali + r.aggregates.costiGenerali
  const barre = [
    { nome: 'Ricavi', attuale: attuale.ricavi, simulato: simulato.ricavi },
    {
      nome: 'Variabili',
      attuale: attuale.aggregates.costiVariabili,
      simulato: simulato.aggregates.costiVariabili
    },
    { nome: 'Fissi', attuale: fissi(attuale), simulato: fissi(simulato) },
    { nome: 'EBITDA', attuale: attuale.ebitda, simulato: simulato.ebitda },
    { nome: 'Utile', attuale: attuale.utile, simulato: simulato.utile }
  ]

  const toccato = JSON.stringify(params) !== JSON.stringify(PARAMETRI_ZERO)
  const corrente = scenari.find((s) => s.uuid === scelto) ?? null

  const scegli = (uuid: string): void => {
    setScelto(uuid)
    setMessaggio(null)
    const s = scenari.find((x) => x.uuid === uuid)
    if (s) {
      setParams(parametriDa(s))
      setNome(s.name)
    } else {
      setParams(PARAMETRI_ZERO)
      setNome('')
    }
  }

  const salva = async (): Promise<void> => {
    if (!nome.trim()) {
      setMessaggio({ ok: false, testo: 'Dai un nome allo scenario prima di salvarlo.' })
      return
    }
    setBusy(true)
    try {
      const body = { name: nome, params }
      const s = corrente
        ? await api.put<SimulationScenario>(
            `/api/companies/${companyUuid}/simulations/${corrente.uuid}`,
            body
          )
        : await api.post<SimulationScenario>(`/api/companies/${companyUuid}/simulations`, body)
      setScelto(s.uuid)
      setMessaggio({ ok: true, testo: `Scenario "${s.name}" salvato.` })
      onScenariChanged()
    } catch (err) {
      setMessaggio({ ok: false, testo: err instanceof Error ? err.message : 'Salvataggio non riuscito.' })
    } finally {
      setBusy(false)
    }
  }

  const elimina = async (): Promise<void> => {
    if (!corrente || !confirm(`Eliminare lo scenario "${corrente.name}"?`)) return
    try {
      await api.delete(`/api/companies/${companyUuid}/simulations/${corrente.uuid}`)
      scegli('')
      onScenariChanged()
    } catch (err) {
      setMessaggio({ ok: false, testo: err instanceof Error ? err.message : 'Eliminazione non riuscita.' })
    }
  }

  const esporta = async (): Promise<void> => {
    const titolo = nome.trim() || 'Scenario'
    const path = await window.daprod.saveExcelFile(`Simulazione - ${titolo.replace(/[\\/:*?"<>|]/g, '')}.xlsx`)
    if (!path) return
    setBusy(true)
    try {
      const r = await api.post<{ path: string }>(`/api/companies/${companyUuid}/simulations/export`, {
        filePath: path,
        periodUuid,
        scenario,
        params,
        name: titolo
      })
      await window.daprod.openExcelFile(r.path)
      setMessaggio({ ok: true, testo: 'Scenario esportato in Excel.' })
    } catch (err) {
      setMessaggio({ ok: false, testo: err instanceof Error ? err.message : 'Esportazione non riuscita.' })
    } finally {
      setBusy(false)
    }
  }

  const eur = (v: number | null): string => euro(v)
  const pct = (v: number | null): string => percent(v)
  const nf = simulato.nuovoFinanziamento

  return (
    <div className="grid grid-cols-[340px_1fr] items-start gap-5">
      {/* --- leve ------------------------------------------------------------ */}
      <div className="sticky top-0 flex flex-col gap-4">
        <Card title="Scenario">
          <div className="flex flex-col gap-3 px-5 py-4">
            <Select value={scelto} onChange={(e) => scegli(e.target.value)} className="text-sm">
              <option value="">— nuovo scenario —</option>
              {scenari.map((s) => (
                <option key={s.uuid} value={s.uuid}>
                  {s.name}
                </option>
              ))}
            </Select>
            {canEdit && (
              <>
                <TextInput
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome, es. Apertura seconda sede"
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex-1 px-3 py-1.5 text-xs"
                    onClick={salva}
                    disabled={busy}
                  >
                    {corrente ? 'Salva le modifiche' : 'Salva scenario'}
                  </Button>
                  {corrente && (
                    <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={elimina}>
                      Elimina
                    </Button>
                  )}
                </div>
              </>
            )}
            {messaggio && (
              <p className={`text-xs ${messaggio.ok ? 'text-positive' : 'text-negative'}`}>
                {messaggio.testo}
              </p>
            )}
          </div>
        </Card>

        <Card
          title="Cosa succede se…"
          actions={
            <button
              type="button"
              disabled={!toccato}
              onClick={() => setParams(PARAMETRI_ZERO)}
              className="text-xs text-brand-300 hover:text-brand-200 disabled:text-ink-600"
            >
              Ripristina valori attuali
            </button>
          }
        >
          <Gruppo titolo="Economiche">
            <Leva
              label="Ricavi"
              valore={params.ricaviPercent}
              min={-50}
              max={50}
              unita="%"
              onChange={(v) => set('ricaviPercent', v)}
            />
            <Leva
              label="Prezzo delle merci"
              valore={params.costoMercePercent}
              min={-30}
              max={30}
              unita="%"
              onChange={(v) => set('costoMercePercent', v)}
            />
            <Leva
              label="Costi di produzione"
              valore={params.costiVariabiliPercent}
              min={-30}
              max={30}
              unita="%"
              onChange={(v) => set('costiVariabiliPercent', v)}
            />
            <Leva
              label="Dipendenti in più o in meno"
              valore={params.nuoviDipendenti}
              min={-10}
              max={10}
              unita=""
              onChange={(v) => set('nuoviDipendenti', Math.round(v))}
            />
            {params.nuoviDipendenti !== 0 && (
              <CampoEuro
                label="Costo annuo ciascuno"
                valore={params.costoDipendenteCents}
                onChange={(v) => set('costoDipendenteCents', v)}
              />
            )}
            <Leva
              label="Altri costi fissi"
              valore={params.altriCostiFissiPercent}
              min={-30}
              max={30}
              unita="%"
              onChange={(v) => set('altriCostiFissiPercent', v)}
            />
          </Gruppo>

          <Gruppo titolo="Capitale circolante — giorni obiettivo">
            <CampoNumero
              label="Incasso clienti (DSO)"
              valore={params.dsoTarget}
              unita="gg"
              placeholder={`ora ${days(attuale.dso)}`}
              onChange={(v) => set('dsoTarget', v)}
            />
            <CampoNumero
              label="Magazzino (DIO)"
              valore={params.dioTarget}
              unita="gg"
              placeholder={`ora ${days(attuale.dio)}`}
              onChange={(v) => set('dioTarget', v)}
            />
            <CampoNumero
              label="Pagamento fornitori (DPO)"
              valore={params.dpoTarget}
              unita="gg"
              placeholder={`ora ${days(attuale.dpo)}`}
              onChange={(v) => set('dpoTarget', v)}
            />
          </Gruppo>

          <Gruppo titolo="Investimenti e finanziamenti">
            <CampoEuro
              label="Nuovo investimento"
              valore={params.investimentoCents}
              onChange={(v) => set('investimentoCents', v)}
            />
            {params.investimentoCents > 0 && (
              <CampoNumero
                label="Ammortamento in"
                valore={params.investimentoAnni}
                unita="anni"
                onChange={(v) => set('investimentoAnni', v ?? 1)}
              />
            )}
            <CampoEuro
              label="Nuovo finanziamento"
              valore={params.finanziamentoCents}
              onChange={(v) => set('finanziamentoCents', v)}
            />
            {params.finanziamentoCents > 0 && (
              <>
                <CampoNumero
                  label="Durata"
                  valore={params.finanziamentoMesi}
                  unita="mesi"
                  onChange={(v) => set('finanziamentoMesi', v ?? 1)}
                />
                <CampoNumero
                  label="Tasso annuo"
                  valore={params.finanziamentoTasso}
                  unita="%"
                  onChange={(v) => set('finanziamentoTasso', v ?? 0)}
                />
                <CampoNumero
                  label="Preammortamento"
                  valore={params.finanziamentoPreammortamentoMesi}
                  unita="mesi"
                  onChange={(v) => set('finanziamentoPreammortamentoMesi', v ?? 0)}
                />
              </>
            )}
          </Gruppo>
        </Card>
      </div>

      {/* --- risultati ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-400">
            Base: <span className="text-ink-200">{base.label}</span> · proiezione sui 12 mesi da oggi
          </p>
          <div className="flex gap-2">
            <Button className="px-3 py-1.5 text-xs" onClick={esporta} disabled={busy}>
              Esporta scenario
            </Button>
            <Button className="px-3 py-1.5 text-xs" onClick={onVaiTesoreria}>
              Vai alla Tesoreria
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {CONFRONTI.map((c) => (
            <CardConfronto
              key={c.label}
              label={c.label}
              attuale={c.valore(attuale)}
              simulato={c.valore(simulato)}
              formato={c.percento ? pct : eur}
              buono={c.buono}
              minimo={c.percento ? 0.05 : 100}
              formatoDelta={
                c.percento ? (v) => `${v.toFixed(1).replace('.', ',')} punti` : undefined
              }
            />
          ))}
        </div>

        {simulato.liquiditaFinale < 0 || simulato.curva.some((v) => v < (soglia ?? 0)) ? (
          <Alert>
            Nello scenario la liquidità scende sotto{' '}
            {soglia ? `la soglia minima di ${euro(soglia)}` : 'zero'} durante l'anno.
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-5">
          <Card title="Conto economico: attuale e scenario">
            <div className="px-3 py-4">
              <ConfrontoBarre dati={barre} />
            </div>
          </Card>
          <Card title="Liquidità nei prossimi 12 mesi">
            <div className="px-3 py-4">
              <ConfrontoCassa dati={cassa} soglia={soglia} />
            </div>
          </Card>
        </div>

        <Card title="Dettaglio degli impatti">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs text-ink-400">
                <th className="px-5 py-2.5 text-left font-medium">Voce</th>
                <th className="px-5 py-2.5 text-right font-medium">Attuale</th>
                <th className="px-5 py-2.5 text-right font-medium">Scenario</th>
                <th className="px-5 py-2.5 text-right font-medium">Differenza</th>
                <th className="px-5 py-2.5 text-left font-medium">Da dove arriva</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => {
                const d = r.simulato - r.attuale
                const risultato = r.key === 'ebitda' || r.key === 'utile' || r.key === 'cashflow'
                return (
                  <tr key={r.key} className={`border-b border-ink-800 last:border-0 ${risultato ? 'bg-ink-900/60 font-medium' : ''}`}>
                    <td className="px-5 py-2 text-ink-200">{r.label}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums text-ink-400">{euro(r.attuale)}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums text-ink-100">{euro(r.simulato)}</td>
                    <td className={`whitespace-nowrap px-5 py-2 text-right tabular-nums ${d === 0 ? 'text-ink-500' : 'text-ink-200'}`}>
                      {d === 0 ? '—' : `${d > 0 ? '+' : ''}${euro(d)}`}
                    </td>
                    <td className="px-5 py-2 text-xs text-ink-400">{r.nota}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

        {(params.investimentoCents > 0 || nf) && (
          <Card title="Investimento e finanziamento">
            <div className="grid grid-cols-4 gap-px bg-ink-700">
              {[
                { l: 'Rata mensile', v: nf ? euro(nf.rata, true) : '—' },
                { l: 'Interessi totali', v: nf ? euro(nf.interessiTotali) : '—' },
                { l: 'Interessi nei 12 mesi', v: nf ? euro(nf.interessi12Mesi) : '—' },
                { l: 'Ammortamento annuo', v: simulato.ammortamentoInvestimento ? euro(simulato.ammortamentoInvestimento) : '—' }
              ].map((x) => (
                <div key={x.l} className="bg-ink-850 px-5 py-3">
                  <p className="text-xs text-ink-400">{x.l}</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-ink-100">{x.v}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <p className="text-xs leading-relaxed text-ink-500">
          Simulazione indicativa. I costi variabili seguono i ricavi; crediti, magazzino e fornitori seguono i
          volumi; le imposte usano l'aliquota effettiva della base ({percent(simulato.aliquotaImposte * 100)}); il
          cash flow è EBITDA meno imposte, variazione del circolante, investimenti e rate, più i nuovi
          finanziamenti.
        </p>
      </div>
    </div>
  )
}
