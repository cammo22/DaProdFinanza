import { useMemo, useState } from 'react'
import { Pannelli } from '../../components/Pannelli'
import { StrisciaIndicatori } from '../../components/widgets'
import type { TreasuryView as Vista } from '@shared/analysis'
import { daysBetween, residual } from '@shared/engine'
import type { TreasuryItem } from '@shared/types'
import { api } from '../../lib/api'
import { dataBreve, dataIt, euro } from '../../lib/format'
import { Alert, Button, Card, EmptyState } from '../../components/ui'
import { GraficoTesoreria, type PuntoTesoreria } from '../../components/charts'
import { ItemModal, PaymentModal, SettingsModal } from './TreasuryForms'

/**
 * Tesoreria / Cash Flow e Scadenziario — AGENTS.md §10.6.
 *
 * Tre sotto-schede, come nei mockup: la previsione, lo scadenziario (fatture
 * da incassare e da pagare) e le previsioni inserite a mano. Ogni euro della
 * previsione si ritrova in una riga di una delle altre due.
 */

type Scheda = 'previsione' | 'scadenziario' | 'previsioni'

const SCHEDE: { id: Scheda; label: string }[] = [
  { id: 'previsione', label: 'Cash Flow (previsione)' },
  { id: 'scadenziario', label: 'Scadenziario' },
  { id: 'previsioni', label: 'Previsioni manuali' }
]

/** Punti del grafico: consuntivo mensile, poi la previsione settimanale da oggi. */
export function puntiTesoreria(vista: Vista): PuntoTesoreria[] {
  const storico: PuntoTesoreria[] = vista.consuntivo
    .filter((p) => p.date < vista.today)
    .map((p) => {
      const [mese, anno] = p.label.split(' ')
      return {
        label: anno ? `${mese!.slice(0, 3)} '${anno.slice(-2)}` : p.label,
        consuntivo: p.liquidita,
        previsione: null
      }
    })
  const previsione: PuntoTesoreria[] = vista.curve.map((p, i) => ({
    label: i === 0 ? 'Oggi' : dataBreve(p.date),
    // Il punto di oggi appartiene a entrambe le linee, che così si toccano.
    consuntivo: i === 0 ? p.liquidita : null,
    previsione: p.liquidita
  }))
  return [...storico, ...previsione]
}

function Kpi({
  label,
  valore,
  nota,
  tono = 'text-ink-100'
}: {
  label: string
  valore: string
  nota?: string
  tono?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3.5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tono}`}>{valore}</p>
      {nota && <p className="mt-0.5 truncate text-[11px] text-ink-500" title={nota}>{nota}</p>}
    </div>
  )
}

function stato(item: TreasuryItem, oggi: string): { testo: string; classe: string } {
  const residuo = residual(item)
  if (residuo === 0) {
    return { testo: item.direction === 'in' ? 'Incassata' : 'Pagata', classe: 'text-positive' }
  }
  if (item.due_date < oggi) {
    return {
      testo: `Scaduta da ${daysBetween(item.due_date, oggi)} gg`,
      classe: 'text-negative'
    }
  }
  if (item.paid_cents > 0) return { testo: 'Pagamento parziale', classe: 'text-warning' }
  return { testo: item.direction === 'in' ? 'Da incassare' : 'Da pagare', classe: 'text-ink-300' }
}

export function TreasuryView({
  vista,
  companyUuid,
  canEdit,
  onChanged
}: {
  vista: Vista
  companyUuid: string
  canEdit: boolean
  onChanged: () => void
}): React.JSX.Element {
  const [scheda, setScheda] = useState<Scheda>('previsione')
  const [modulo, setModulo] = useState<
    | { tipo: 'item'; source: 'scadenziario' | 'manuale'; item: TreasuryItem | null }
    | { tipo: 'pagamento'; item: TreasuryItem }
    | { tipo: 'impostazioni' }
    | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const trenta = vista.horizons.find((h) => h.days === 30)
  const soglia = vista.sogliaMinima
  const punti = useMemo(() => puntiTesoreria(vista), [vista])

  const chiudi = (): void => setModulo(null)
  const salvato = (): void => {
    setModulo(null)
    onChanged()
  }

  const elimina = async (item: TreasuryItem): Promise<void> => {
    if (!confirm(`Eliminare "${item.description}"?`)) return
    try {
      await api.delete(`/api/companies/${companyUuid}/treasury/items/${item.uuid}`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    }
  }

  return (
    <Pannelli vista="tesoreria">
      {/* Letture in più, in stile cruscotto. */}
      {(() => {
        const novanta = vista.horizons.find((h) => h.days === 90)
        const uscitaGiorno = novanta && novanta.totaleUscite > 0 ? novanta.totaleUscite / 90 : null
        const autonomia = uscitaGiorno ? Math.floor(vista.liquiditaOggi / uscitaGiorno) : null
        const incassi = trenta?.totaleEntrate ?? 0
        const pagamenti = trenta?.totaleUscite ?? 0
        return (
          <StrisciaIndicatori
            indicatori={[
              {
                label: 'Autonomia di cassa',
                valore: autonomia === null ? '—' : `${autonomia} gg`,
                quota: autonomia === null ? null : autonomia / 180,
                colore: autonomia !== null && autonomia < 30 ? 'bg-negative' : 'bg-positive',
                sotto: 'giorni di uscite coperti dalla liquidità di oggi, senza nuovi incassi'
              },
              {
                label: 'Incassi / pagamenti a 30 giorni',
                valore: pagamenti ? `${(incassi / pagamenti).toFixed(2).replace('.', ',')}x` : '—',
                quota: incassi + pagamenti ? incassi / (incassi + pagamenti) : null,
                stile: 'barra',
                soglia: 0.5,
                colore: incassi >= pagamenti ? 'bg-positive' : 'bg-warning',
                sotto: `${euro(incassi)} in entrata · ${euro(pagamenti)} in uscita`
              },
              {
                label: 'Affidamenti disponibili',
                valore: euro(vista.affidamenti.disponibile),
                quota: vista.affidamenti.accordato
                  ? vista.affidamenti.disponibile / vista.affidamenti.accordato
                  : null,
                colore: 'bg-brand-400',
                sotto: vista.affidamenti.accordato
                  ? `su ${euro(vista.affidamenti.accordato)} accordati`
                  : 'nessuna linea di credito'
              },
              {
                label: 'Scaduti da sistemare',
                valore: String(vista.scaduti.righe),
                sotto: `incassi ${euro(vista.scaduti.entrate)} · pagamenti ${euro(vista.scaduti.uscite)}`
              }
            ]}
          />
        )
      })()}

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-cols-6 gap-3">
        <Kpi
          label="Liquidità oggi"
          valore={euro(vista.liquiditaOggi)}
          nota={`Da ${vista.opening.label}`}
          tono={soglia !== null && vista.liquiditaOggi < soglia ? 'text-negative' : 'text-ink-100'}
        />
        <Kpi label="Incassi prossimi 30 gg" valore={euro(trenta?.totaleEntrate ?? 0)} tono="text-positive" />
        <Kpi label="Pagamenti prossimi 30 gg" valore={euro(trenta?.totaleUscite ?? 0)} tono="text-negative" />
        <Kpi
          label="Cash flow previsto 30 gg"
          valore={euro(trenta?.cashFlow ?? 0)}
          tono={(trenta?.cashFlow ?? 0) < 0 ? 'text-negative' : 'text-positive'}
        />
        <Kpi
          label="Liquidità tra 30 gg"
          valore={euro(trenta?.liquiditaFinale ?? vista.liquiditaOggi)}
          tono={
            soglia !== null && (trenta?.liquiditaFinale ?? 0) < soglia ? 'text-negative' : 'text-ink-100'
          }
        />
        <Kpi
          label="Affidamenti disponibili"
          valore={euro(vista.affidamenti.disponibile)}
          nota={
            vista.affidamenti.accordato > 0
              ? `Su ${euro(vista.affidamenti.accordato)} accordati`
              : 'Nessuna linea di credito registrata'
          }
        />
      </div>

      {vista.tensione && (
        <Alert>
          <strong>Tensione finanziaria tra {vista.tensione.days} giorni.</strong> Il{' '}
          {dataIt(vista.tensione.date)} la liquidità prevista scende a {euro(vista.tensione.liquidita)}
          {vista.tensione.soglia > 0
            ? `, sotto la soglia minima di ${euro(vista.tensione.soglia)}.`
            : ', sotto zero.'}
        </Alert>
      )}
      {vista.scaduti.righe > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {vista.scaduti.righe} scadenz{vista.scaduti.righe === 1 ? 'a' : 'e'} già passat
          {vista.scaduti.righe === 1 ? 'a' : 'e'} e non saldat{vista.scaduti.righe === 1 ? 'a' : 'e'}:{' '}
          {euro(vista.scaduti.entrate)} da incassare, {euro(vista.scaduti.uscite)} da pagare. Nella
          previsione contano da oggi.
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-ink-700">
        {SCHEDE.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScheda(s.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              scheda === s.id
                ? 'border-brand-400 font-medium text-brand-300'
                : 'border-transparent text-ink-400 hover:text-ink-100'
            }`}
          >
            {s.label}
          </button>
        ))}
        {canEdit && (
          <Button
            className="mb-1.5 ml-auto px-3 py-1 text-xs"
            onClick={() => setModulo({ tipo: 'impostazioni' })}
          >
            Saldo e soglia…
          </Button>
        )}
      </div>

      {scheda === 'previsione' && (
        <>
          <Card title="Previsione di tesoreria">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-xs text-ink-400">
                    <th className="px-5 py-2.5 text-left font-medium" />
                    {vista.horizons.map((h) => (
                      <th key={h.days} className="px-4 py-2.5 text-right font-medium">
                        {h.label}
                        <span className="block text-[10px] font-normal text-ink-500">al {dataIt(h.end)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ink-800">
                    <td className="px-5 py-2 text-ink-200">Liquidità iniziale</td>
                    {vista.horizons.map((h) => (
                      <td key={h.days} className="px-4 py-2 text-right tabular-nums text-ink-100">
                        {euro(h.liquiditaIniziale)}
                      </td>
                    ))}
                  </tr>
                  <Gruppo titolo="Entrate" />
                  {vista.categorieEntrate.map((c) => (
                    <Riga key={`in-${c}`} label={c} valori={vista.horizons.map((h) => h.entrate[c] ?? 0)} />
                  ))}
                  <Totale label="Totale entrate" valori={vista.horizons.map((h) => h.totaleEntrate)} classe="text-positive" />
                  <Gruppo titolo="Uscite" />
                  {vista.categorieUscite.map((c) => (
                    <Riga key={`out-${c}`} label={c} valori={vista.horizons.map((h) => h.uscite[c] ?? 0)} />
                  ))}
                  <Totale label="Totale uscite" valori={vista.horizons.map((h) => h.totaleUscite)} classe="text-negative" />
                  <tr className="border-b border-ink-700">
                    <td className="px-5 py-2.5 font-medium text-ink-100">Cash flow</td>
                    {vista.horizons.map((h) => (
                      <td
                        key={h.days}
                        className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                          h.cashFlow < 0 ? 'text-negative' : 'text-positive'
                        }`}
                      >
                        {euro(h.cashFlow)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-ink-900/60">
                    <td className="px-5 py-3 font-semibold text-ink-100">Liquidità finale prevista</td>
                    {vista.horizons.map((h) => (
                      <td
                        key={h.days}
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          h.liquiditaFinale < (soglia ?? 0) ? 'text-negative' : 'text-ink-100'
                        }`}
                      >
                        {euro(h.liquiditaFinale)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-ink-700 px-5 py-2.5 text-xs text-ink-500">
              Si parte da {vista.opening.label}
              {vista.opening.date < vista.today ? ', più incassi e pagamenti registrati dopo quella data' : ''}.
              Entrano le scadenze aperte, le previsioni manuali e le rate dei finanziamenti del modulo
              Banche. Gli affidamenti disponibili non sono contati come liquidità.
            </p>
          </Card>

          <Card title="Liquidità — consuntivo e previsione a 6 mesi">
            <div className="px-3 py-4">
              <GraficoTesoreria dati={punti} soglia={soglia} />
            </div>
          </Card>
        </>
      )}

      {scheda === 'scadenziario' && (
        <Scadenziario
          vista={vista}
          canEdit={canEdit}
          onNuova={() => setModulo({ tipo: 'item', source: 'scadenziario', item: null })}
          onModifica={(item) => setModulo({ tipo: 'item', source: 'scadenziario', item })}
          onPaga={(item) => setModulo({ tipo: 'pagamento', item })}
          onElimina={elimina}
        />
      )}

      {scheda === 'previsioni' && (
        <Card
          title="Previsioni manuali inserite"
          actions={
            canEdit && (
              <Button
                variant="primary"
                className="px-3 py-1 text-xs"
                onClick={() => setModulo({ tipo: 'item', source: 'manuale', item: null })}
              >
                + Nuova previsione
              </Button>
            )
          }
        >
          {vista.items.filter((i) => i.source === 'manuale').length === 0 ? (
            <EmptyState
              title="Nessuna previsione"
              description="Aggiungi i movimenti che non sono ancora fatture: stipendi, affitto, versamenti degli incassi di cassa, imposte."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-xs text-ink-400">
                  <th className="px-5 py-2.5 text-left font-medium">Data</th>
                  <th className="px-5 py-2.5 text-left font-medium">Descrizione</th>
                  <th className="px-5 py-2.5 text-left font-medium">Categoria</th>
                  <th className="px-5 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-5 py-2.5 text-right font-medium">Importo</th>
                  <th className="px-5 py-2.5 text-left font-medium">Ricorrenza</th>
                  {canEdit && <th className="px-5 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {vista.items
                  .filter((i) => i.source === 'manuale')
                  .map((item) => (
                    <tr key={item.uuid} className="border-b border-ink-800 last:border-0">
                      <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-300">{dataIt(item.due_date)}</td>
                      <td className="px-5 py-2.5 text-ink-100">{item.description}</td>
                      <td className="px-5 py-2.5 text-ink-300">{item.category}</td>
                      <td className={`px-5 py-2.5 ${item.direction === 'in' ? 'text-positive' : 'text-negative'}`}>
                        {item.direction === 'in' ? 'Entrata' : 'Uscita'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-ink-100">{euro(item.amount_cents)}</td>
                      <td className="px-5 py-2.5 text-xs text-ink-400">
                        {item.recurrence === 'monthly'
                          ? `Ogni mese${item.recurrence_until ? ` fino al ${dataIt(item.recurrence_until)}` : ''}`
                          : item.due_date < vista.today
                            ? 'Una volta · superata'
                            : 'Una volta'}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-5 py-2.5 text-right">
                          <Azione onClick={() => setModulo({ tipo: 'item', source: 'manuale', item })}>
                            Modifica
                          </Azione>
                          <Azione onClick={() => elimina(item)} pericolo>
                            Elimina
                          </Azione>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {modulo?.tipo === 'item' && (
        <ItemModal
          companyUuid={companyUuid}
          source={modulo.source}
          item={modulo.item}
          onClose={chiudi}
          onSaved={salvato}
        />
      )}
      {modulo?.tipo === 'pagamento' && (
        <PaymentModal companyUuid={companyUuid} item={modulo.item} onClose={chiudi} onSaved={salvato} />
      )}
      {modulo?.tipo === 'impostazioni' && (
        <SettingsModal companyUuid={companyUuid} settings={vista.settings} onClose={chiudi} onSaved={salvato} />
      )}
    </Pannelli>
  )
}

function Gruppo({ titolo }: { titolo: string }): React.JSX.Element {
  return (
    <tr>
      <td colSpan={99} className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {titolo}
      </td>
    </tr>
  )
}

function Riga({ label, valori }: { label: string; valori: number[] }): React.JSX.Element {
  return (
    <tr>
      <td className="py-1.5 pl-8 pr-5 text-ink-300">{label}</td>
      {valori.map((v, i) => (
        <td key={i} className="px-4 py-1.5 text-right tabular-nums text-ink-300">
          {v ? euro(v) : <span className="text-ink-600">—</span>}
        </td>
      ))}
    </tr>
  )
}

function Totale({
  label,
  valori,
  classe
}: {
  label: string
  valori: number[]
  classe: string
}): React.JSX.Element {
  return (
    <tr className="border-b border-ink-800">
      <td className="px-5 py-2 font-medium text-ink-200">{label}</td>
      {valori.map((v, i) => (
        <td key={i} className={`px-4 py-2 text-right font-medium tabular-nums ${classe}`}>
          {euro(v)}
        </td>
      ))}
    </tr>
  )
}

function Azione({
  children,
  onClick,
  pericolo = false
}: {
  children: React.ReactNode
  onClick: () => void
  pericolo?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ml-3 text-xs ${pericolo ? 'text-negative/80 hover:text-negative' : 'text-brand-300 hover:text-brand-200'}`}
    >
      {children}
    </button>
  )
}

function Scadenziario({
  vista,
  canEdit,
  onNuova,
  onModifica,
  onPaga,
  onElimina
}: {
  vista: Vista
  canEdit: boolean
  onNuova: () => void
  onModifica: (item: TreasuryItem) => void
  onPaga: (item: TreasuryItem) => void
  onElimina: (item: TreasuryItem) => void
}): React.JSX.Element {
  const [filtro, setFiltro] = useState<'tutte' | 'in' | 'out'>('tutte')
  const [saldate, setSaldate] = useState(false)

  const righe = vista.items.filter(
    (i) =>
      i.source === 'scadenziario' &&
      (filtro === 'tutte' || i.direction === filtro) &&
      (saldate || residual(i) > 0)
  )
  const aperte = vista.items.filter((i) => i.source === 'scadenziario' && residual(i) > 0)
  const daIncassare = aperte.filter((i) => i.direction === 'in').reduce((s, i) => s + residual(i), 0)
  const daPagare = aperte.filter((i) => i.direction === 'out').reduce((s, i) => s + residual(i), 0)

  return (
    <Card
      title="Scadenziario clienti e fornitori"
      actions={
        canEdit && (
          <Button variant="primary" className="px-3 py-1 text-xs" onClick={onNuova}>
            + Nuova scadenza
          </Button>
        )
      }
    >
      <div className="flex items-center gap-4 border-b border-ink-700 px-5 py-3 text-sm">
        {(
          [
            ['tutte', 'Tutte'],
            ['in', `Da incassare · ${euro(daIncassare)}`],
            ['out', `Da pagare · ${euro(daPagare)}`]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltro(id)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              filtro === id ? 'bg-brand-500/15 text-brand-300' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-400">
          <input
            type="checkbox"
            checked={saldate}
            onChange={(e) => setSaldate(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          Mostra anche quelle saldate
        </label>
      </div>

      {righe.length === 0 ? (
        <EmptyState
          title="Nessuna scadenza"
          description="Inserisci le fatture da incassare e da pagare: la previsione di cassa le usa alla loro data."
        />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-xs text-ink-400">
              <th className="px-5 py-2.5 text-left font-medium">Scadenza</th>
              <th className="px-5 py-2.5 text-left font-medium">Controparte</th>
              <th className="px-5 py-2.5 text-left font-medium">Descrizione</th>
              <th className="px-5 py-2.5 text-left font-medium">Documento</th>
              <th className="px-5 py-2.5 text-right font-medium">Importo</th>
              <th className="px-5 py-2.5 text-right font-medium">Residuo</th>
              <th className="px-5 py-2.5 text-left font-medium">Stato</th>
              {canEdit && <th className="px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {righe.map((item) => {
              const s = stato(item, vista.today)
              const residuo = residual(item)
              return (
                <tr key={item.uuid} className="border-b border-ink-800 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-300">{dataIt(item.due_date)}</td>
                  <td className="px-5 py-2.5 text-ink-100">
                    <span
                      className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                        item.direction === 'in' ? 'bg-positive' : 'bg-negative'
                      }`}
                      title={item.direction === 'in' ? 'Da incassare' : 'Da pagare'}
                    />
                    {item.counterparty ?? '—'}
                  </td>
                  <td className="px-5 py-2.5 text-ink-300">{item.description}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-ink-400">
                    {item.document_ref ?? '—'}
                    {item.payment_method && <span className="block text-ink-500">{item.payment_method}</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-ink-300">{euro(item.amount_cents)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium tabular-nums text-ink-100">{euro(residuo)}</td>
                  <td className={`whitespace-nowrap px-5 py-2.5 text-xs ${s.classe}`}>{s.testo}</td>
                  {canEdit && (
                    <td className="whitespace-nowrap px-5 py-2.5 text-right">
                      {residuo > 0 && (
                        <Azione onClick={() => onPaga(item)}>
                          {item.direction === 'in' ? 'Incassa' : 'Paga'}
                        </Azione>
                      )}
                      <Azione onClick={() => onModifica(item)}>Modifica</Azione>
                      <Azione onClick={() => onElimina(item)} pericolo>
                        Elimina
                      </Azione>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}
