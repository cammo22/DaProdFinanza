import type { Analysis } from '@shared/analysis'
import { THRESHOLDS } from '@shared/engine'
import { days, euro, percent, times, tone } from '../../lib/format'
import { Card } from '../../components/ui'

/**
 * Panoramica — AGENTS.md §10.2.
 *
 * Gli avvisi in alto nascono da regole sulle soglie del foglio del consulente
 * (docs/MODELLO_FINANZIARIO.md §5): non c'è nessun modello che indovina, sono
 * confronti espliciti, e ognuno dice da quale numero arriva.
 *
 * I quattro grafici a 12 mesi previsti da §10.2 arriveranno quando ci saranno
 * più periodi caricati: con un solo periodo non c'è una serie da disegnare.
 */

type Livello = 'rosso' | 'giallo'

interface Avviso {
  livello: Livello
  titolo: string
  dettaglio: string
}

function avvisi(analysis: Analysis): Avviso[] {
  const a = analysis.incomeStatement.aggregates
  const r = analysis.ratios
  const b = analysis.balanceSheet
  const out: Avviso[] = []

  if (a.utile < 0) {
    out.push({
      livello: 'rosso',
      titolo: `Risultato di periodo negativo: ${euro(a.utile)}`,
      dettaglio: 'I costi superano i ricavi nel periodo analizzato.'
    })
  }

  if (r.molPercent !== null && r.molPercent < THRESHOLDS.molPercent.min) {
    out.push({
      livello: r.molPercent < 0 ? 'rosso' : 'giallo',
      titolo: `Margine operativo al ${percent(r.molPercent)}`,
      dettaglio: THRESHOLDS.molPercent.note
    })
  }

  if (r.margineSicurezzaPercent !== null && r.margineSicurezzaPercent < 10) {
    out.push({
      livello: r.margineSicurezzaPercent < 0 ? 'rosso' : 'giallo',
      titolo:
        r.margineSicurezzaPercent < 0
          ? 'Ricavi sotto il punto di pareggio'
          : `Solo ${percent(r.margineSicurezzaPercent)} sopra il pareggio`,
      dettaglio: `Il break-even è a ${euro(r.bepCents)} di ricavi.`
    })
  }

  if (r.indiceDisponibilita !== null && r.indiceDisponibilita < 1) {
    out.push({
      livello: 'rosso',
      titolo: `L'attivo circolante non copre i debiti a breve (${times(r.indiceDisponibilita)})`,
      dettaglio: 'Tensione finanziaria: i debiti in scadenza superano quello che si può liquidare.'
    })
  }

  if (r.margineStrutturaSecondario < 0) {
    out.push({
      livello: 'giallo',
      titolo: 'Immobilizzazioni finanziate anche da debiti a breve',
      dettaglio: `Margine di struttura secondario ${euro(r.margineStrutturaSecondario)}.`
    })
  }

  if (r.pfnSuEbitda !== null && r.pfnSuEbitda > 3) {
    out.push({
      livello: r.pfnSuEbitda > 4 ? 'rosso' : 'giallo',
      titolo: `Indebitamento a ${times(r.pfnSuEbitda)} l'EBITDA`,
      dettaglio: `Posizione finanziaria netta ${euro(r.posizioneFinanziariaNetta)}.`
    })
  }

  if (b.sbilancio !== 0) {
    out.push({
      livello: 'giallo',
      titolo: `Attivo e passivo non quadrano per ${euro(b.sbilancio)}`,
      dettaglio: 'Il bilancio importato è incompleto o un conto è nella sezione sbagliata.'
    })
  }

  return out
}

function Kpi({
  label,
  value,
  hint,
  colore
}: {
  label: string
  value: string
  hint?: string
  colore?: string
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-ink-800 px-5 py-3 first:border-0">
      <span className="text-sm text-ink-300">{label}</span>
      <span className="shrink-0 text-right">
        <span className={`text-base font-semibold tabular-nums ${colore ?? 'text-ink-100'}`}>
          {value}
        </span>
        {hint && <span className="ml-2 text-xs text-ink-400">{hint}</span>}
      </span>
    </div>
  )
}

export function OverviewView({ analysis }: { analysis: Analysis }): React.JSX.Element {
  const a = analysis.incomeStatement.aggregates
  const r = analysis.ratios
  const b = analysis.balanceSheet
  const lista = avvisi(analysis)

  return (
    <div className="flex flex-col gap-5">
      {lista.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {lista.map((avviso) => (
            <div
              key={avviso.titolo}
              className={`rounded-xl border px-5 py-4 ${
                avviso.livello === 'rosso'
                  ? 'border-negative/40 bg-negative/10'
                  : 'border-warning/40 bg-warning/10'
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  avviso.livello === 'rosso' ? 'text-negative' : 'text-warning'
                }`}
              >
                {avviso.titolo}
              </p>
              <p className="mt-0.5 text-xs text-ink-300">{avviso.dettaglio}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-positive/40 bg-positive/10 px-5 py-4">
          <p className="text-sm font-semibold text-positive">Nessun avviso su questo periodo</p>
          <p className="mt-0.5 text-xs text-ink-300">
            Tutti gli indici con una soglia definita sono entro i valori di riferimento.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <Card title="KPI economici">
          <div className="py-1">
            <Kpi label="Ricavi del periodo" value={euro(a.ricaviNetti)} />
            <Kpi
              label="Margine di contribuzione"
              value={euro(a.margineContribuzione)}
              hint={
                a.ricaviNetti ? percent((a.margineContribuzione / a.ricaviNetti) * 100) : undefined
              }
            />
            <Kpi
              label="EBITDA / MOL"
              value={euro(a.ebitda)}
              hint={percent(r.molPercent)}
              colore={tone(r.molPercent, THRESHOLDS.molPercent.min)}
            />
            <Kpi label="Reddito operativo (EBIT)" value={euro(a.ebit)} hint={percent(r.ros)} />
            <Kpi
              label="Utile netto"
              value={euro(a.utile)}
              colore={a.utile >= 0 ? 'text-positive' : 'text-negative'}
            />
            <Kpi label="Break-even" value={euro(r.bepCents)} hint={percent(r.margineSicurezzaPercent)} />
          </div>
        </Card>

        <Card title="KPI finanziari">
          <div className="py-1">
            <Kpi label="Liquidità immediate" value={euro(b.liquiditaImmediate)} />
            <Kpi label="Capitale circolante netto" value={euro(b.capitaleCircolanteNetto)} />
            <Kpi
              label="Ciclo del circolante"
              value={days(r.ccc)}
              hint="DSO + DIO − DPO"
            />
            <Kpi
              label="Posizione finanziaria netta"
              value={euro(r.posizioneFinanziariaNetta)}
              hint={r.pfnSuEbitda === null ? undefined : `${times(r.pfnSuEbitda)} EBITDA`}
            />
            <Kpi
              label="Indipendenza finanziaria"
              value={percent(r.indipendenzaFinanziaria)}
              colore={tone(r.indipendenzaFinanziaria, THRESHOLDS.indipendenzaFinanziaria.min)}
            />
            <Kpi
              label="Indice di disponibilità"
              value={times(r.indiceDisponibilita)}
              colore={tone(r.indiceDisponibilita, 1)}
            />
          </div>
        </Card>
      </div>

      <Card title="Andamento a 12 mesi">
        <p className="px-5 py-6 text-sm text-ink-400">
          I grafici di §10.2 si disegnano quando ci sono più periodi caricati: con un solo periodo
          non c&apos;è una serie storica da mostrare. Importa altri mesi dalla scheda{' '}
          <span className="text-ink-300">Import</span> e compariranno qui.
        </p>
      </Card>
    </div>
  )
}
