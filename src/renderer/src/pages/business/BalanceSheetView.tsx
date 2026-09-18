import type { Analysis } from '@shared/analysis'
import { Disposizione } from '../../components/Disposizione'
import { StrisciaIndicatori } from '../../components/widgets'
import { THRESHOLDS } from '@shared/engine'
import { days, euro, percent, share, times, tone } from '../../lib/format'
import { Alert, Card } from '../../components/ui'

/**
 * Stato Patrimoniale riclassificato e indici — AGENTS.md §10.4.
 *
 * Le soglie accanto agli indici non sono giudizi nostri: sono quelle scritte
 * nel foglio del consulente (docs/MODELLO_FINANZIARIO.md §5).
 */

function Riga({
  label,
  cents,
  totale,
  forte = false,
  indent = false
}: {
  label: string
  cents: number
  totale?: number
  forte?: boolean
  indent?: boolean
}): React.JSX.Element {
  return (
    <tr className={`border-t border-ink-800 ${forte ? 'bg-ink-900/60' : ''}`}>
      <td
        className={`px-5 py-2 ${forte ? 'font-semibold text-ink-100' : ''} ${
          indent ? 'pl-9 text-ink-300' : 'text-ink-300'
        }`}
      >
        {label}
      </td>
      <td
        className={`px-5 py-2 text-right tabular-nums ${
          forte ? 'font-semibold text-ink-100' : 'text-ink-300'
        }`}
      >
        {euro(cents)}
      </td>
      <td className="w-24 px-5 py-2 text-right tabular-nums text-xs text-ink-400">
        {totale === undefined ? '' : share(cents, totale)}
      </td>
    </tr>
  )
}

function Indice({
  label,
  value,
  nota,
  colore
}: {
  label: string
  value: string
  nota?: string
  colore?: string
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-ink-800 px-5 py-2.5 first:border-0">
      <div>
        <p className="text-sm text-ink-300">{label}</p>
        {nota && <p className="text-xs text-ink-500">{nota}</p>}
      </div>
      <p className={`shrink-0 text-sm font-semibold tabular-nums ${colore ?? 'text-ink-100'}`}>
        {value}
      </p>
    </div>
  )
}

export function BalanceSheetView({ analysis }: { analysis: Analysis }): React.JSX.Element {
  const b = analysis.balanceSheet
  const r = analysis.ratios

  return (
    <Disposizione vista="stato-patrimoniale">
      {/* Letture in più, in stile cruscotto: come è finanziata l'azienda. */}
      <StrisciaIndicatori
        indicatori={[
          {
            label: 'Capitale investito',
            valore: euro(b.capitaleInvestito),
            quota: b.totaleAttivo ? b.attivoFissoNetto / b.totaleAttivo : null,
            stile: 'barra',
            colore: 'bg-brand-500',
            sotto: `${percent(b.totaleAttivo ? (b.attivoFissoNetto / b.totaleAttivo) * 100 : null, 0)} immobilizzato`
          },
          {
            label: 'Mezzi propri',
            valore: percent(r.indipendenzaFinanziaria),
            quota: r.indipendenzaFinanziaria === null ? null : r.indipendenzaFinanziaria / 100,
            stile: 'barra',
            soglia: 0.3,
            colore: (r.indipendenzaFinanziaria ?? 0) >= 30 ? 'bg-positive' : 'bg-warning',
            sotto: `patrimonio netto ${euro(b.patrimonioNetto)} · riferimento 30%`
          },
          {
            label: 'Immobilizzazioni coperte da fonti stabili',
            valore:
              b.attivoFissoNetto > 0
                ? `${((b.patrimonioNetto + b.debitiMedioLungo) / b.attivoFissoNetto).toFixed(2).replace('.', ',')}x`
                : '—',
            quota:
              b.attivoFissoNetto > 0 ? (b.patrimonioNetto + b.debitiMedioLungo) / b.attivoFissoNetto / 2 : null,
            stile: 'barra',
            soglia: 0.5,
            colore:
              b.patrimonioNetto + b.debitiMedioLungo >= b.attivoFissoNetto ? 'bg-positive' : 'bg-negative',
            sotto: '(netto + debiti a lungo) / attivo fisso: sopra 1x è sano'
          },
          {
            label: 'Liquidità sui debiti a breve',
            valore: b.debitiBreve ? percent((b.liquiditaImmediate / b.debitiBreve) * 100, 0) : '—',
            quota: b.debitiBreve ? b.liquiditaImmediate / b.debitiBreve : null,
            colore: b.liquiditaImmediate >= b.debitiBreve ? 'bg-positive' : 'bg-warning',
            sotto: `cassa e banche ${euro(b.liquiditaImmediate)} · debiti a breve ${euro(b.debitiBreve)}`
          }
        ]}
      />

      {b.sbilancio !== 0 && (
        <Alert>
          Attivo e passivo non quadrano: differenza di {euro(b.sbilancio)}. Il bilancio importato è
          incompleto oppure un conto è finito nella sezione sbagliata.
        </Alert>
      )}

      <Disposizione vista="stato-patrimoniale-riquadri-1" maniglia="sopra" className="grid grid-cols-2 gap-5">
        <Card title="Attivo">
          <table className="w-full text-sm">
            <tbody>
              <Riga label="Immobilizzazioni immateriali" cents={b.immobilizzazioniImmateriali} totale={b.totaleAttivo} indent />
              <Riga label="Immobilizzazioni materiali" cents={b.immobilizzazioniMateriali} totale={b.totaleAttivo} indent />
              <Riga label="Immobilizzazioni finanziarie" cents={b.immobilizzazioniFinanziarie} totale={b.totaleAttivo} indent />
              <Riga label="Attivo fisso netto" cents={b.attivoFissoNetto} totale={b.totaleAttivo} forte />
              <Riga label="Magazzino" cents={b.magazzino} totale={b.totaleAttivo} indent />
              <Riga label="Liquidità differite" cents={b.liquiditaDifferite} totale={b.totaleAttivo} indent />
              <Riga label="Liquidità immediate" cents={b.liquiditaImmediate} totale={b.totaleAttivo} indent />
              <Riga label="Attivo circolante" cents={b.attivoCircolante} totale={b.totaleAttivo} forte />
              <Riga label="TOTALE ATTIVO" cents={b.totaleAttivo} totale={b.totaleAttivo} forte />
            </tbody>
          </table>
        </Card>

        <Card title="Passivo e patrimonio netto">
          <table className="w-full text-sm">
            <tbody>
              <Riga label="Patrimonio netto" cents={b.patrimonioNetto} totale={b.totalePassivo} indent />
              <Riga label="Debiti a medio/lungo termine" cents={b.debitiMedioLungo} totale={b.totalePassivo} indent />
              <Riga label="Debiti a breve termine" cents={b.debitiBreve} totale={b.totalePassivo} indent />
              <Riga label="TOTALE PASSIVO" cents={b.totalePassivo} totale={b.totalePassivo} forte />
            </tbody>
          </table>

          <div className="border-t border-ink-700 px-5 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Capitale circolante netto
            </h3>
            <table className="w-full text-sm">
              <tbody>
                <Riga label="Crediti commerciali" cents={b.creditiCommerciali} indent />
                <Riga label="Magazzino" cents={b.magazzino} indent />
                <Riga label="Altri crediti" cents={b.altriCrediti} indent />
                <Riga label="− Debiti verso fornitori" cents={b.debitiFornitori} indent />
                <Riga label="− Altri debiti correnti" cents={b.altriDebitiCorrenti} indent />
                <Riga label="CCN" cents={b.capitaleCircolanteNetto} forte />
              </tbody>
            </table>
          </div>
        </Card>
      </Disposizione>

      <Disposizione vista="stato-patrimoniale-riquadri-2" maniglia="sopra" className="grid grid-cols-3 gap-5">
        <Card title="Redditività">
          <div className="py-1">
            <Indice label="ROE" value={percent(r.roe)} nota="Utile sul capitale proprio" />
            <Indice label="ROI" value={percent(r.roi)} nota="Reddito operativo sul capitale investito" />
            <Indice label="ROS" value={percent(r.ros)} nota={THRESHOLDS.ros.note} colore={tone(r.ros, THRESHOLDS.ros.min)} />
            <Indice label="MOL %" value={percent(r.molPercent)} nota={THRESHOLDS.molPercent.note} colore={tone(r.molPercent, THRESHOLDS.molPercent.min)} />
          </div>
        </Card>

        <Card title="Struttura e liquidità">
          <div className="py-1">
            <Indice
              label="Indipendenza finanziaria"
              value={percent(r.indipendenzaFinanziaria)}
              nota={THRESHOLDS.indipendenzaFinanziaria.note}
              colore={tone(r.indipendenzaFinanziaria, THRESHOLDS.indipendenzaFinanziaria.min)}
            />
            <Indice label="Margine di struttura primario" value={euro(r.margineStrutturaPrimario)} nota="Se negativo non è di per sé un allarme" />
            <Indice
              label="Margine di struttura secondario"
              value={euro(r.margineStrutturaSecondario)}
              nota="Deve restare sopra zero"
              colore={tone(r.margineStrutturaSecondario, 0)}
            />
            <Indice label="Indice di disponibilità" value={times(r.indiceDisponibilita)} nota={THRESHOLDS.indiceDisponibilita.note} colore={tone(r.indiceDisponibilita, 1)} />
            <Indice label="Indice di liquidità" value={times(r.indiceLiquidita)} nota={THRESHOLDS.indiceLiquidita.note} colore={tone(r.indiceLiquidita, 1)} />
          </div>
        </Card>

        <Card title="Circolante e indebitamento">
          <div className="py-1">
            <Indice label="DSO" value={days(r.dso)} nota="Giorni medi di incasso dai clienti" />
            <Indice label="DIO" value={days(r.dio)} nota="Giorni medi di giacenza del magazzino" />
            <Indice label="DPO" value={days(r.dpo)} nota="Giorni medi di pagamento ai fornitori" />
            <Indice label="Ciclo del circolante" value={days(r.ccc)} nota="DSO + DIO − DPO: più basso è meglio" />
            <Indice label="PFN" value={euro(r.posizioneFinanziariaNetta)} nota="Debiti finanziari meno liquidità" />
            <Indice label="PFN / EBITDA" value={times(r.pfnSuEbitda)} nota="Sull'EBITDA degli ultimi 12 mesi" />
            <Indice label="Debt / Equity" value={times(r.debtEquity)} />
            <Indice
              label="DSCR"
              value={times(r.dscr)}
              nota={
                r.dscr === null
                  ? 'Serve almeno un finanziamento nel modulo Banche'
                  : 'EBITDA 12 mesi ÷ rate dei 12 mesi successivi · ok da 1,25x'
              }
              colore={tone(r.dscr, THRESHOLDS.dscr.min)}
            />
          </div>
        </Card>
      </Disposizione>
    </Disposizione>
  )
}
