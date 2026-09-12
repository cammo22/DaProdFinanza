import type { Analysis, SeriesPoint } from '@shared/analysis'
import { SCHEME_LABELS, SCHEMES, type Scheme } from '@shared/engine'
import { euro, percent, share, tone } from '../../lib/format'
import { Card, Select } from '../../components/ui'
import { BarraBreakEven, CompositionePie, SerieEconomica } from '../../components/charts'

/**
 * Conto Economico riclassificato — AGENTS.md §10.3.
 *
 * La tabella mostra il valore e la quota sui ricavi, come nel prospetto che il
 * consulente già usa. Il selettore di schema espone anche gli altri due modi di
 * riclassificare di §3: sono gli stessi conti letti in un ordine diverso, e
 * chiudono sullo stesso utile.
 */

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
    <div className="bg-ink-850 px-5 py-4">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${colore ?? 'text-ink-100'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

export function IncomeStatementView({
  analysis,
  serie,
  scheme,
  onScheme
}: {
  analysis: Analysis
  serie: SeriesPoint[]
  scheme: Scheme
  onScheme: (scheme: Scheme) => void
}): React.JSX.Element {
  const a = analysis.incomeStatement.aggregates
  const r = analysis.ratios

  // La composizione dei costi si legge da un solo periodo: le voci a zero
  // sparirebbero come spicchi invisibili, quindi si tolgono.
  const fetteCosti = [
    { nome: 'Materie prime', valore: a.costiMateriePrime },
    { nome: 'Produzione', valore: a.costiProduzione },
    { nome: 'Personale', valore: a.costiPersonale },
    { nome: 'Commerciali', valore: a.costiCommerciali },
    { nome: 'Generali e amministrativi', valore: a.costiGenerali },
    { nome: 'Ammortamenti', valore: a.ammortamenti },
    { nome: 'Oneri finanziari', valore: a.oneriFinanziari }
  ].filter((fetta) => fetta.valore > 0)

  return (
    <div className="flex flex-col gap-5">
      <Card title="Indicatori del periodo">
        <div className="grid grid-cols-6 gap-px bg-ink-700">
          <Kpi label="Ricavi totali" value={euro(a.ricaviNetti)} />
          <Kpi
            label="Margine di contribuzione"
            value={euro(a.margineContribuzione)}
            hint={share(a.margineContribuzione, a.ricaviNetti)}
          />
          <Kpi
            label="EBITDA / MOL"
            value={euro(a.ebitda)}
            hint={`${percent(r.molPercent)} dei ricavi operativi`}
            colore={tone(r.molPercent, 15)}
          />
          <Kpi label="Reddito operativo" value={euro(a.ebit)} hint={`ROS ${percent(r.ros)}`} />
          <Kpi
            label="Utile netto"
            value={euro(a.utile)}
            hint={share(a.utile, a.ricaviNetti)}
            colore={a.utile >= 0 ? 'text-positive' : 'text-negative'}
          />
          <Kpi
            label="Break-even"
            value={euro(r.bepCents)}
            hint={
              r.margineSicurezzaPercent === null
                ? 'margine di sicurezza —'
                : `${percent(r.margineSicurezzaPercent)} di margine`
            }
            colore={tone(r.margineSicurezzaPercent, 0)}
          />
        </div>
      </Card>

      <Card
        title="Conto economico gestionale riclassificato"
        actions={
          <Select
            value={scheme}
            onChange={(e) => onScheme(e.target.value as Scheme)}
            className="w-60 py-1 text-xs"
          >
            {SCHEMES.map((s) => (
              <option key={s} value={s}>
                {SCHEME_LABELS[s]}
              </option>
            ))}
          </Select>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-ink-400">
              <th className="px-5 py-2 text-left font-medium">Voce</th>
              <th className="px-5 py-2 text-right font-medium">Valore</th>
              <th className="w-24 px-5 py-2 text-right font-medium">% ricavi</th>
            </tr>
          </thead>
          <tbody>
            {analysis.incomeStatement.lines.map((line) => {
              const forte = line.kind !== 'voce'
              const risultato = line.kind === 'risultato'
              return (
                <tr
                  key={line.key}
                  className={`border-t border-ink-800 ${forte ? 'bg-ink-900/60' : ''}`}
                >
                  <td
                    className={`px-5 py-2 ${
                      forte ? 'font-semibold text-ink-100' : 'pl-9 text-ink-300'
                    }`}
                  >
                    <span className="mr-2 inline-block w-3 text-ink-500">{line.sign}</span>
                    {line.label}
                  </td>
                  <td
                    className={`px-5 py-2 text-right tabular-nums ${
                      risultato
                        ? line.amount_cents >= 0
                          ? 'font-semibold text-positive'
                          : 'font-semibold text-negative'
                        : forte
                          ? 'font-semibold text-ink-100'
                          : 'text-ink-300'
                    }`}
                  >
                    {euro(line.amount_cents)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-xs text-ink-400">
                    {share(line.amount_cents, a.ricaviNetti)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Ricavi, costi ed EBITDA nel tempo">
          <div className="px-3 py-4">
            {serie.length > 1 ? (
              <SerieEconomica dati={serie} />
            ) : (
              <p className="px-2 py-10 text-center text-sm text-ink-400">
                Serve più di un periodo per disegnare un andamento. Importa altri mesi e il
                grafico compare qui.
              </p>
            )}
          </div>
        </Card>

        <Card title="Composizione dei costi">
          <div className="px-5 py-4">
            {fetteCosti.length > 0 ? (
              <CompositionePie fette={fetteCosti} />
            ) : (
              <p className="py-10 text-center text-sm text-ink-400">Nessun costo nel periodo.</p>
            )}
          </div>
        </Card>
      </div>

      <Card title="Break-even e margine di sicurezza">
        <div className="px-5 py-5">
          <BarraBreakEven
            bepCents={r.bepCents}
            ricaviCents={a.ricaviNetti}
            margineSicurezza={r.margineSicurezzaPercent}
          />
        </div>
      </Card>

      <Card title="Gli altri due schemi — stessi conti, stesso utile">
        <div className="grid grid-cols-2 gap-px bg-ink-700">
          {analysis.alternativeSchemes.map((alt) => (
            <div key={alt.scheme} className="bg-ink-850 px-5 py-4">
              <h3 className="text-sm font-medium text-ink-100">{alt.label}</h3>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {alt.lines
                    .filter((l) => l.kind !== 'voce')
                    .map((l) => (
                      <tr key={l.key}>
                        <td className="py-1 text-ink-300">{l.label}</td>
                        <td className="py-1 text-right tabular-nums text-ink-100">
                          {euro(l.amount_cents)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
