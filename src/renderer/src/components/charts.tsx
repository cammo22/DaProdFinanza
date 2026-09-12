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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { euro, percent } from '../lib/format'

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
  previsione: '#fbbf24'
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
export function CompositionePie({ fette }: { fette: FettaCosto[] }): React.JSX.Element {
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
          <span className="text-xs text-ink-400">Totale costi</span>
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
