import type { WorkingCapitalView as Vista } from '@shared/analysis'
import { Disposizione } from '../../components/Disposizione'
import { StrisciaIndicatori } from '../../components/widgets'
import {
  delta,
  deltaPercent,
  type WorkingCapitalNote,
  type WorkingCapitalSnapshot
} from '@shared/engine'
import { days, euro, percent } from '../../lib/format'
import { Card } from '../../components/ui'
import { COLORI, SerieCcc, SerieCiclo, Sparkline } from '../../components/charts'

/**
 * Capitale Circolante — AGENTS.md §10.5, docs/MODELLO_FINANZIARIO.md §6.
 *
 * Le card confrontano con la fine dell'anno precedente, la tabella degli
 * indici con lo stesso periodo dell'anno prima: sono i due confronti dei
 * mockup, e rispondono a due domande diverse ("da inizio anno come sta
 * andando?" e "rispetto a un anno fa?").
 */

const TONO: Record<WorkingCapitalNote['tone'], string> = {
  positive: 'bg-positive',
  negative: 'bg-negative',
  neutral: 'bg-ink-400'
}

function Variazione({
  valore,
  suffisso,
  altoEBuono
}: {
  valore: number | null
  suffisso: 'euro' | 'giorni' | 'percento'
  /** null = la variazione non ha un verso buono o cattivo. */
  altoEBuono: boolean | null
}): React.JSX.Element {
  if (valore === null || !Number.isFinite(valore)) return <span className="text-ink-500">—</span>
  // Una variazione che arrotondata vale zero si scrive zero, senza segno.
  const arrotondato =
    suffisso === 'giorni'
      ? Math.round(valore)
      : suffisso === 'percento'
        ? Math.round(valore * 10) / 10
        : Math.round(valore / 100)
  const segno = arrotondato > 0 ? '+' : ''
  const tono =
    altoEBuono === null || arrotondato === 0
      ? 'text-ink-300'
      : (valore > 0) === altoEBuono
        ? 'text-positive'
        : 'text-negative'
  const testo =
    suffisso === 'euro'
      ? `${segno}${euro(arrotondato === 0 ? 0 : valore)}`
      : suffisso === 'giorni'
        ? `${segno}${arrotondato === 0 ? 0 : arrotondato} gg`
        : `${segno}${percent(arrotondato === 0 ? 0 : valore)}`
  return <span className={`tabular-nums ${tono}`}>{testo}</span>
}

const CARD: {
  key: keyof WorkingCapitalSnapshot
  label: string
  /** Per il capitale circolante, un aumento assorbe cassa. */
  altoEBuono: boolean | null
}[] = [
  { key: 'creditiCommerciali', label: 'Crediti commerciali', altoEBuono: false },
  { key: 'magazzino', label: 'Magazzino', altoEBuono: false },
  { key: 'debitiFornitori', label: 'Debiti fornitori', altoEBuono: null },
  { key: 'capitaleCircolanteNetto', label: 'Capitale circolante netto', altoEBuono: false }
]

const INDICI: {
  key: 'dso' | 'dio' | 'dpo' | 'ccc'
  sigla: string
  nome: string
  definizione: string
  colore: string
  altoEBuono: boolean | null
}[] = [
  {
    key: 'dso',
    sigla: 'DSO',
    nome: 'Giorni medi di incasso',
    definizione: 'Crediti commerciali ÷ ricavi giornalieri',
    colore: COLORI.dso,
    altoEBuono: false
  },
  {
    key: 'dio',
    sigla: 'DIO',
    nome: 'Giorni medi di magazzino',
    definizione: 'Magazzino ÷ costo del venduto giornaliero',
    colore: COLORI.dio,
    altoEBuono: false
  },
  {
    key: 'dpo',
    sigla: 'DPO',
    nome: 'Giorni medi di pagamento',
    definizione: 'Debiti fornitori ÷ acquisti giornalieri',
    colore: COLORI.dpo,
    altoEBuono: null
  },
  {
    key: 'ccc',
    sigla: 'CCC',
    nome: 'Ciclo di cassa',
    definizione: 'DSO + DIO − DPO',
    colore: COLORI.ccc,
    altoEBuono: false
  }
]

const COMPONENTI: { key: keyof WorkingCapitalSnapshot; label: string; segno: 1 | -1 }[] = [
  { key: 'creditiCommerciali', label: 'Crediti commerciali', segno: 1 },
  { key: 'magazzino', label: 'Magazzino', segno: 1 },
  { key: 'altriCrediti', label: 'Altri crediti', segno: 1 },
  { key: 'debitiFornitori', label: 'Debiti verso fornitori', segno: -1 },
  { key: 'altriDebitiCorrenti', label: 'Altri debiti correnti', segno: -1 }
]

/** Da "X in aumento del 12% …: assorbono più liquidità." a "Assorbono più liquidità." */
function motivo(testo: string): string {
  const dopo = testo.split(': ')[1]
  return dopo ? dopo.charAt(0).toUpperCase() + dopo.slice(1) : testo
}

export function WorkingCapitalView({ vista }: { vista: Vista }): React.JSX.Element {
  const { current, previousYear, previousYearEnd, series, notes, aging } = vista
  const ultimi12 = series.slice(-12)
  const notaDi = (key: string): WorkingCapitalNote | undefined =>
    notes.find((n) => n.subject === key)

  return (
    <Disposizione vista="capitale-circolante">
      {/* Letture in più, in stile cruscotto. */}
      <StrisciaIndicatori
        indicatori={[
          {
            label: 'Capitale circolante netto',
            valore: euro(current.capitaleCircolanteNetto),
            sotto: previousYear ? `anno prima ${euro(previousYear.snapshot.capitaleCircolanteNetto)}` : undefined
          },
          {
            label: 'Crediti scaduti nello scadenziario',
            valore: aging.openCents ? percent((aging.overdueCents / aging.openCents) * 100, 0) : '—',
            quota: aging.openCents ? aging.overdueCents / aging.openCents : null,
            stile: 'barra',
            colore: aging.openCents && aging.overdueCents / aging.openCents > 0.1 ? 'bg-negative' : 'bg-positive',
            sotto: `${euro(aging.overdueCents)} scaduti su ${euro(aging.openCents)} aperti`
          },
          {
            label: 'Giorni di incasso',
            valore: days(current.dso),
            quota: current.dso === null ? null : current.dso / 120,
            colore: 'bg-brand-400',
            sotto: previousYear ? `anno prima ${days(previousYear.snapshot.dso)}` : undefined
          },
          {
            label: 'Giorni di pagamento',
            valore: days(current.dpo),
            quota: current.dpo === null ? null : current.dpo / 120,
            colore: 'bg-brand-400',
            sotto: previousYear ? `anno prima ${days(previousYear.snapshot.dpo)}` : undefined
          }
        ]}
      />

      <div className="grid grid-cols-4 gap-4">
        {CARD.map((c) => {
          const valore = current[c.key] as number
          const prima = previousYearEnd ? (previousYearEnd.snapshot[c.key] as number) : null
          return (
            <div key={c.key} className="rounded-xl border border-ink-700 bg-ink-850 px-5 py-4">
              <p className="text-xs text-ink-400">{c.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink-100">{euro(valore)}</p>
              <p className="mt-1 text-xs">
                <Variazione valore={delta(valore, prima)} suffisso="euro" altoEBuono={c.altoEBuono} />
                <span className="text-ink-500">
                  {previousYearEnd ? ` vs ${previousYearEnd.label}` : ' · manca la fine anno precedente'}
                </span>
              </p>
            </div>
          )
        })}
      </div>

      <Card title="Note automatiche">
        {notes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-400">
            {previousYear
              ? 'Nessuna variazione rilevante rispetto allo stesso periodo dell’anno scorso.'
              : 'Le note confrontano il periodo con lo stesso periodo dell’anno prima, che non è caricato.'}
          </p>
        ) : (
          <ul className="divide-y divide-ink-800">
            {notes.map((n) => (
              <li key={n.subject + n.text} className="flex items-start gap-3 px-5 py-3 text-sm text-ink-200">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONO[n.tone]}`} />
                {n.text}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-ink-700 px-5 py-2.5 text-xs text-ink-500">
          Regole: un indice di ciclo si segnala quando si sposta di almeno 5 giorni, una componente
          quando varia di almeno il 10%.
        </p>
      </Card>

      <Card title="Ciclo del circolante">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs text-ink-400">
              <th className="px-5 py-2.5 text-left font-medium">Indicatore</th>
              <th className="px-5 py-2.5 text-right font-medium">{vista.period.label}</th>
              <th className="px-5 py-2.5 text-right font-medium">
                {previousYear?.label ?? 'Anno precedente'}
              </th>
              <th className="px-5 py-2.5 text-right font-medium">Variazione</th>
              <th className="px-5 py-2.5 text-right font-medium">Var. %</th>
              <th className="px-5 py-2.5 text-right font-medium">Ultimi 12 mesi</th>
            </tr>
          </thead>
          <tbody>
            {INDICI.map((i) => {
              const ora = current[i.key]
              const prima = previousYear?.snapshot[i.key] ?? null
              return (
                <tr key={i.key} className="border-b border-ink-800 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink-100">
                      <span className="mr-2 font-mono text-xs" style={{ color: i.colore }}>
                        {i.sigla}
                      </span>
                      {i.nome}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">{i.definizione}</p>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink-100">
                    {days(ora)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-300">{days(prima)}</td>
                  <td className="px-5 py-3 text-right">
                    <Variazione valore={delta(ora, prima)} suffisso="giorni" altoEBuono={i.altoEBuono} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Variazione
                      valore={deltaPercent(ora, prima)}
                      suffisso="percento"
                      altoEBuono={i.altoEBuono}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      {ultimi12.length > 1 ? (
                        <Sparkline valori={ultimi12.map((p) => p[i.key])} colore={i.colore} />
                      ) : (
                        <span className="text-xs text-ink-500">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {series.length > 1 ? (
        <Disposizione vista="capitale-circolante-riquadri-1" maniglia="sopra" className="grid grid-cols-2 gap-5">
          <Card title={`Ciclo di cassa — ultimi ${series.length} mesi`}>
            <div className="px-3 py-4">
              <SerieCcc dati={series} />
            </div>
          </Card>
          <Card title="Andamento DSO, DIO, DPO e CCC — 12 mesi">
            <div className="px-3 py-4">
              <SerieCiclo dati={ultimi12} />
            </div>
          </Card>
        </Disposizione>
      ) : (
        <Card>
          <p className="px-5 py-4 text-sm text-ink-400">
            I grafici dell'andamento servono almeno due mesi caricati.
          </p>
        </Card>
      )}

      <Card title="Componenti del capitale circolante">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs text-ink-400">
              <th className="px-5 py-2.5 text-left font-medium">Voce</th>
              <th className="px-5 py-2.5 text-right font-medium">{vista.period.label}</th>
              <th className="px-5 py-2.5 text-right font-medium">
                {previousYear?.label ?? 'Anno precedente'}
              </th>
              <th className="px-5 py-2.5 text-right font-medium">Variazione</th>
              <th className="px-5 py-2.5 text-right font-medium">Var. %</th>
              <th className="px-5 py-2.5 text-left font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENTI.map((c) => {
              const ora = current[c.key] as number
              const prima = previousYear ? (previousYear.snapshot[c.key] as number) : null
              const nota = notaDi(c.key)
              return (
                <tr key={c.key} className="border-b border-ink-800">
                  <td className="px-5 py-2.5 text-ink-200">
                    {c.segno < 0 && <span className="mr-1 text-ink-500">−</span>}
                    {c.label}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-ink-100">{euro(ora)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-ink-300">{euro(prima)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Variazione valore={delta(ora, prima)} suffisso="euro" altoEBuono={null} />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Variazione valore={deltaPercent(ora, prima)} suffisso="percento" altoEBuono={null} />
                  </td>
                  <td className="max-w-xs px-5 py-2.5 text-xs text-ink-400">
                    {nota ? motivo(nota.text) : ''}
                    {c.key === 'creditiCommerciali' && aging.overdueCents > 0 && (
                      <span className="block text-negative">
                        Scaduti oltre 60 gg: {euro(aging.overdueCents)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-ink-900/60 font-semibold">
              <td className="px-5 py-3 text-ink-100">Capitale circolante netto</td>
              <td className="px-5 py-3 text-right tabular-nums text-ink-100">
                {euro(current.capitaleCircolanteNetto)}
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-ink-300">
                {euro(previousYear?.snapshot.capitaleCircolanteNetto ?? null)}
              </td>
              <td className="px-5 py-3 text-right">
                <Variazione
                  valore={delta(
                    current.capitaleCircolanteNetto,
                    previousYear?.snapshot.capitaleCircolanteNetto ?? null
                  )}
                  suffisso="euro"
                  altoEBuono={false}
                />
              </td>
              <td className="px-5 py-3 text-right">
                <Variazione
                  valore={deltaPercent(
                    current.capitaleCircolanteNetto,
                    previousYear?.snapshot.capitaleCircolanteNetto ?? null
                  )}
                  suffisso="percento"
                  altoEBuono={false}
                />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </Card>
    </Disposizione>
  )
}
