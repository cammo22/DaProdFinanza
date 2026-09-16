import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { days, euro, percent } from '../lib/format'

/**
 * I grafici delle schermate di analisi — AGENTS.md §10.2 e §10.3.
 *
 * Tutti ricevono importi in **centesimi** e convertono qui: il resto
 * dell'applicazione non deve pensare all'unità. Gli assi mostrano migliaia di
 * euro, come nei mockup, perché su un grafico le cifre intere non si leggono.
 */

const ASSE = { stroke: '#64748b', fontSize: 11 }
const GRIGLIA = '#1d2636'

export const COLORI = {
  ricavi: '#34d399',
  costi: '#f87171',
  ebitda: '#a78bfa',
  utile: '#60a5fa',
  liquidita: '#34d399',
  previsione: '#fbbf24',
  dso: '#60a5fa',
  dio: '#fbbf24',
  dpo: '#f472b6',
  ccc: '#a78bfa',
  soglia: '#f87171'
} as const

/** Palette della composizione costi: tinte distinte, leggibili sul fondo scuro. */
const TORTA = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#38bdf8', '#f472b6', '#94a3b8']

/**
 * Etichette compatte per l'asse: "Gennaio 2026" non ci sta, "Gen" sì. L'anno
 * compare solo quando la serie ne attraversa più di uno, altrimenti è rumore.
 */
function etichettaAsse(dati: { label: string }[]): (label: string) => string {
  const anni = new Set(dati.map((d) => d.label.split(' ').at(-1)))
  const mostraAnno = anni.size > 1
  return (label) => {
    const parti = String(label).split(' ')
    if (parti.length < 2) return String(label)
    const [mese, anno] = parti
    return mostraAnno ? `${mese.slice(0, 3)} '${anno.slice(-2)}` : mese.slice(0, 3)
  }
}

const migliaia = (cents: number): string => {
  const k = cents / 100_000
  return Math.abs(k) >= 1 ? `${Math.round(k)}k` : String(Math.round(cents / 100))
}

function Riquadro({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-xs shadow-lg">
      {children}
    </div>
  )
}

interface TooltipProps {
  active?: boolean
  label?: string | number
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]
}

function TooltipEuro({ active, payload, label }: TooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <Riquadro>
      <p className="mb-1 font-medium text-ink-100">{label}</p>
      {payload.map((voce) => (
        <p key={voce.dataKey} className="flex items-center gap-2 text-ink-300">
          <span className="h-2 w-2 rounded-full" style={{ background: voce.color }} />
          {voce.name}
          <span className="ml-auto tabular-nums text-ink-100">{euro(voce.value ?? 0)}</span>
        </p>
      ))}
    </Riquadro>
  )
}

export interface PuntoSerie {
  label: string
  ricavi: number
  costiTotali: number
  ebitda: number
  utile: number
  liquidita: number
}

/** Ricavi, costi ed EBITDA a confronto nel tempo — §10.3. */
export function SerieEconomica({ dati }: { dati: PuntoSerie[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dati} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          tickFormatter={etichettaAsse(dati)}
        />
        <YAxis tick={ASSE} axisLine={false} tickLine={false} tickFormatter={migliaia} width={48} />
        <Tooltip content={<TooltipEuro />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b99ad' }} iconType="plainline" />
        <Line name="Ricavi" dataKey="ricavi" stroke={COLORI.ricavi} strokeWidth={2} dot={false} />
        <Line name="Costi totali" dataKey="costiTotali" stroke={COLORI.costi} strokeWidth={2} dot={false} />
        <Line name="EBITDA" dataKey="ebitda" stroke={COLORI.ebitda} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Una singola grandezza a barre nel tempo — §10.2. */
export function SerieABarre({
  dati,
  chiave,
  nome,
  colore
}: {
  dati: PuntoSerie[]
  chiave: keyof PuntoSerie
  nome: string
  colore: string
}): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dati} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          tickFormatter={etichettaAsse(dati)}
        />
        <YAxis tick={ASSE} axisLine={false} tickLine={false} tickFormatter={migliaia} width={48} />
        <Tooltip content={<TooltipEuro />} cursor={{ fill: '#1d2636', opacity: 0.4 }} />
        <Bar name={nome} dataKey={chiave} radius={[3, 3, 0, 0]}>
          {dati.map((punto, i) => (
            // Un valore negativo si colora di rosso: su un utile è l'informazione
            // più importante del grafico.
            <Cell
              key={i}
              fill={(punto[chiave] as number) < 0 ? COLORI.costi : colore}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Andamento della liquidità — §10.2. La previsione arriva con la Fase 5. */
export function SerieLiquidita({ dati }: { dati: PuntoSerie[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={dati} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          tickFormatter={etichettaAsse(dati)}
        />
        <YAxis tick={ASSE} axisLine={false} tickLine={false} tickFormatter={migliaia} width={48} />
        <Tooltip content={<TooltipEuro />} />
        <Line
          name="Liquidità"
          dataKey="liquidita"
          stroke={COLORI.liquidita}
          strokeWidth={2}
          dot={{ r: 2.5, fill: COLORI.liquidita }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface FettaCosto {
  nome: string
  valore: number
}

/** Composizione dei costi — §10.3. Basta un solo periodo. */
export function CompositionePie({
  fette,
  etichetta = 'Totale costi'
}: {
  fette: FettaCosto[]
  etichetta?: string
}): React.JSX.Element {
  const totale = fette.reduce((somma, f) => somma + f.valore, 0)

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fette}
              dataKey="valore"
              nameKey="nome"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="none"
            >
              {fette.map((_, i) => (
                <Cell key={i} fill={TORTA[i % TORTA.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipEuro />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-ink-400">{etichetta}</span>
          <span className="text-sm font-semibold text-ink-100">{euro(totale)}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5">
        {fette.map((fetta, i) => (
          <li key={fetta.nome} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: TORTA[i % TORTA.length] }}
            />
            <span className="text-ink-300">{fetta.nome}</span>
            <span className="ml-auto tabular-nums text-ink-400">
              {totale ? percent((fetta.valore / totale) * 100, 0) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Break-even e margine di sicurezza — §10.3.
 * Non è un grafico da libreria: è una barra che confronta due numeri, e
 * disegnarla a mano costa meno che configurarne una.
 */
export function BarraBreakEven({
  bepCents,
  ricaviCents,
  margineSicurezza
}: {
  bepCents: number | null
  ricaviCents: number
  margineSicurezza: number | null
}): React.JSX.Element {
  if (bepCents === null || ricaviCents <= 0) {
    return (
      <p className="text-sm text-ink-400">
        Il punto di pareggio non è calcolabile: serve un margine di contribuzione positivo.
      </p>
    )
  }

  const massimo = Math.max(bepCents, ricaviCents)
  const quotaBep = (bepCents / massimo) * 100
  const quotaRicavi = (ricaviCents / massimo) * 100
  const sotto = ricaviCents < bepCents

  return (
    <div>
      <div className="flex items-end justify-between text-xs">
        <span>
          <span className="block font-semibold text-negative">{euro(bepCents)}</span>
          <span className="text-ink-400">Break-even</span>
        </span>
        <span className="text-right">
          <span className={`block font-semibold ${sotto ? 'text-negative' : 'text-positive'}`}>
            {euro(ricaviCents)}
          </span>
          <span className="text-ink-400">Ricavi del periodo</span>
        </span>
      </div>

      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-ink-800">
        <div
          className="absolute inset-y-0 left-0 bg-negative/70"
          style={{ width: `${quotaBep}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 ${sotto ? 'bg-negative' : 'bg-positive'}`}
          style={{ width: `${quotaRicavi}%`, clipPath: `inset(0 0 0 ${quotaBep}%)` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-ink-100"
          style={{ left: `${quotaBep}%` }}
          title="Punto di pareggio"
        />
      </div>

      <p className="mt-3 text-center text-sm">
        <span className="text-ink-400">Margine di sicurezza </span>
        <span className={`font-semibold ${sotto ? 'text-negative' : 'text-positive'}`}>
          {euro(ricaviCents - bepCents)} · {percent(margineSicurezza)}
        </span>
      </p>
    </div>
  )
}

function TooltipGiorni({ active, payload, label }: TooltipProps): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <Riquadro>
      <p className="mb-1 font-medium text-ink-100">{label}</p>
      {payload.map((voce) => (
        <p key={voce.dataKey} className="flex items-center gap-2 text-ink-300">
          <span className="h-2 w-2 rounded-full" style={{ background: voce.color }} />
          {voce.name}
          <span className="ml-auto tabular-nums text-ink-100">
            {voce.value === null || voce.value === undefined ? '—' : days(voce.value)}
          </span>
        </p>
      ))}
    </Riquadro>
  )
}

export interface PuntoCiclo {
  label: string
  dso: number | null
  dio: number | null
  dpo: number | null
  ccc: number | null
  cccMedia: number | null
}

/** DSO, DIO, DPO e CCC sovrapposti — §10.5. */
export function SerieCiclo({ dati }: { dati: PuntoCiclo[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dati} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          tickFormatter={etichettaAsse(dati)}
        />
        <YAxis
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
          domain={[(min: number) => Math.floor(min) - 1, (max: number) => Math.ceil(max) + 1]}
        />
        <Tooltip content={<TooltipGiorni />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b99ad' }} iconType="plainline" />
        <Line name="DSO" dataKey="dso" stroke={COLORI.dso} strokeWidth={2} dot={false} />
        <Line name="DIO" dataKey="dio" stroke={COLORI.dio} strokeWidth={2} dot={false} />
        <Line name="DPO" dataKey="dpo" stroke={COLORI.dpo} strokeWidth={2} dot={false} />
        <Line name="CCC" dataKey="ccc" stroke={COLORI.ccc} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** CCC con media mobile a 3 mesi — §10.5. */
export function SerieCcc({ dati }: { dati: PuntoCiclo[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dati} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          tickFormatter={etichettaAsse(dati)}
        />
        <YAxis
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
          domain={[(min: number) => Math.floor(min) - 1, (max: number) => Math.ceil(max) + 1]}
        />
        <Tooltip content={<TooltipGiorni />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b99ad' }} iconType="plainline" />
        <Line
          name="CCC"
          dataKey="ccc"
          stroke={COLORI.ccc}
          strokeWidth={2}
          dot={{ r: 2, fill: COLORI.ccc }}
        />
        <Line
          name="Media mobile 3 mesi"
          dataKey="cccMedia"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Mini-grafico da tabella: solo la forma dell'andamento. */
export function Sparkline({
  valori,
  colore
}: {
  valori: (number | null)[]
  colore: string
}): React.JSX.Element {
  const dati = valori.map((v, i) => ({ i, v }))
  return (
    <div className="h-7 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dati} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            dataKey="v"
            stroke={colore}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface PuntoTesoreria {
  label: string
  consuntivo: number | null
  previsione: number | null
}

/**
 * Liquidità: storico a consuntivo e previsione, con la soglia minima e il
 * marcatore di oggi — §10.2 e §10.6. I due tratti si toccano sul punto "Oggi".
 */
export function GraficoTesoreria({
  dati,
  soglia,
  altezza = 240
}: {
  dati: PuntoTesoreria[]
  soglia: number | null
  altezza?: number
}): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={altezza}>
      <LineChart data={dati} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={ASSE}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={ASSE} axisLine={false} tickLine={false} tickFormatter={migliaia} width={48} />
        <Tooltip content={<TooltipEuro />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b99ad' }} iconType="plainline" />
        {soglia !== null && (
          <ReferenceLine
            y={soglia}
            stroke={COLORI.soglia}
            strokeDasharray="4 4"
            label={{
              value: 'Soglia minima',
              fill: COLORI.soglia,
              fontSize: 10,
              position: 'insideBottomLeft'
            }}
          />
        )}
        <ReferenceLine
          x="Oggi"
          stroke="#e2e8f0"
          strokeDasharray="2 3"
          label={{ value: 'OGGI', fill: '#e2e8f0', fontSize: 10, position: 'top' }}
        />
        <Line
          name="Consuntivo"
          dataKey="consuntivo"
          stroke={COLORI.liquidita}
          strokeWidth={2}
          dot={{ r: 2.5, fill: COLORI.liquidita }}
        />
        <Line
          name="Previsione"
          dataKey="previsione"
          stroke={COLORI.previsione}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface VoceConfronto {
  nome: string
  attuale: number
  simulato: number
}

/** Conto economico attuale e simulato, affiancati — §10.8. */
export function ConfrontoBarre({ dati }: { dati: VoceConfronto[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={dati} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="nome" tick={ASSE} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={ASSE} axisLine={false} tickLine={false} tickFormatter={migliaia} width={48} />
        <Tooltip content={<TooltipEuro />} cursor={{ fill: '#1d2636', opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b99ad' }} />
        <ReferenceLine y={0} stroke="#334155" />
        <Bar name="Attuale" dataKey="attuale" fill="#64748b" radius={[3, 3, 0, 0]} />
        <Bar name="Scenario" dataKey="simulato" fill={COLORI.utile} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface PuntoCassaSimulata {
  label: string
  attuale: number
  simulato: number
}

/** Liquidità mese per mese, attuale e simulata, con la soglia minima — §10.8. */
export function ConfrontoCassa({
  dati,
  soglia
}: {
  dati: PuntoCassaSimulata[]
  soglia: number | null
}): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={dati} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRIGLIA} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={ASSE} axisLine={false} tickLine={false} />
        <YAxis tick={ASSE} axisLine={false} tickLine={false} tickFormatter={migliaia} width={48} />
        <Tooltip content={<TooltipEuro />} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8b99ad' }} iconType="plainline" />
        {soglia !== null && (
          <ReferenceLine
            y={soglia}
            stroke={COLORI.soglia}
            strokeDasharray="4 4"
            label={{
              value: 'Soglia minima',
              fill: COLORI.soglia,
              fontSize: 10,
              position: 'insideBottomLeft'
            }}
          />
        )}
        <Line name="Attuale" dataKey="attuale" stroke="#94a3b8" strokeWidth={2} dot={false} />
        <Line
          name="Scenario"
          dataKey="simulato"
          stroke={COLORI.previsione}
          strokeWidth={2.5}
          dot={{ r: 2, fill: COLORI.previsione }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
