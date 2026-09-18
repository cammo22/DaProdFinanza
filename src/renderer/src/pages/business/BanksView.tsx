import { useState } from 'react'
import { StrisciaIndicatori } from '../../components/widgets'
import type { BankingView } from '@shared/analysis'
import {
  CREDIT_LINE_LABELS,
  FREQUENCY_LABELS,
  LOAN_LABELS,
  SOGLIA_UTILIZZO_AFFIDAMENTI,
  type CreditLineKind
} from '@shared/engine'
import type { Bank, CreditLine, Loan } from '@shared/types'
import { api } from '../../lib/api'
import { dataIt, euro, percent } from '../../lib/format'
import { Alert, Button, Card, EmptyState, Modal } from '../../components/ui'
import { CompositionePie } from '../../components/charts'
import { BankModal, LineModal, LoanModal } from './BankForms'

/**
 * Banche e Finanziamenti — AGENTS.md §10.7.
 *
 * Due mondi nella stessa schermata: le linee a revoca (quanto è accordato,
 * quanto è usato) e i finanziamenti a rimborso (quanto resta da restituire, e
 * a che ritmo). Le rate dei secondi entrano da sole nella previsione di cassa.
 */

type Scheda = CreditLineKind | 'finanziamenti'

type LoanRow = BankingView['loans'][number]

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
      {nota && <p className="mt-0.5 truncate text-[11px] text-ink-500">{nota}</p>}
    </div>
  )
}

/** Barra di utilizzo: verde, poi ambra oltre la soglia, rossa sopra il 100%. */
function Utilizzo({ valore }: { valore: number | null }): React.JSX.Element {
  if (valore === null) return <span className="text-ink-500">—</span>
  const colore =
    valore > 100 ? 'bg-negative' : valore >= SOGLIA_UTILIZZO_AFFIDAMENTI ? 'bg-warning' : 'bg-positive'
  const testo =
    valore > 100 ? 'text-negative' : valore >= SOGLIA_UTILIZZO_AFFIDAMENTI ? 'text-warning' : 'text-ink-300'
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full ${colore}`} style={{ width: `${Math.min(100, valore)}%` }} />
      </div>
      <span className={`w-12 text-right text-xs tabular-nums ${testo}`}>{percent(valore, 0)}</span>
    </div>
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

const TH = 'px-4 py-2.5 font-medium'
const TD = 'whitespace-nowrap px-4 py-2.5'

export function BanksView({
  vista,
  companyUuid,
  canEdit,
  onChanged
}: {
  vista: BankingView
  companyUuid: string
  canEdit: boolean
  onChanged: () => void
}): React.JSX.Element {
  const [scheda, setScheda] = useState<Scheda>('finanziamenti')
  const [modulo, setModulo] = useState<
    | { tipo: 'banca'; bank: Bank | null }
    | { tipo: 'linea'; line: CreditLine | null }
    | { tipo: 'finanziamento'; loan: Loan | null }
    | { tipo: 'piano'; loan: LoanRow }
    | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const banca = (uuid: string): string => vista.banks.find((b) => b.uuid === uuid)?.name ?? '—'
  const a = vista.affidamenti
  const salvato = (): void => {
    setModulo(null)
    onChanged()
  }

  const elimina = async (path: string, nome: string): Promise<void> => {
    if (!confirm(`Eliminare "${nome}"?`)) return
    try {
      await api.delete(`/api/companies/${companyUuid}/${path}`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    }
  }

  const schede: { id: Scheda; label: string; n: number }[] = [
    { id: 'finanziamenti', label: 'Finanziamenti attivi', n: vista.loans.length },
    ...(Object.keys(CREDIT_LINE_LABELS) as CreditLineKind[]).map((k) => ({
      id: k,
      label: CREDIT_LINE_LABELS[k],
      n: vista.lines.filter((l) => l.kind === k).length
    }))
  ]

  if (vista.banks.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nessun istituto registrato"
          description="Aggiungi le banche e le società di leasing dell'azienda, poi i fidi e i finanziamenti: le rate entreranno da sole nella previsione di cassa."
          action={
            canEdit && (
              <Button variant="primary" onClick={() => setModulo({ tipo: 'banca', bank: null })}>
                + Nuovo istituto
              </Button>
            )
          }
        />
        {modulo?.tipo === 'banca' && (
          <BankModal companyUuid={companyUuid} bank={null} onClose={() => setModulo(null)} onSaved={salvato} />
        )}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Letture in più, in stile cruscotto. */}
      {(() => {
        const originario = vista.loans.reduce((s, l) => s + l.principal_cents, 0)
        const rimborsato = originario - vista.debitoResiduo
        return (
          <StrisciaIndicatori
            indicatori={[
              {
                label: 'Utilizzo degli affidamenti',
                valore: a.utilizzoPercent === null ? '—' : percent(a.utilizzoPercent, 0),
                quota: a.utilizzoPercent === null ? null : a.utilizzoPercent / 100,
                stile: 'barra',
                soglia: 0.8,
                colore: (a.utilizzoPercent ?? 0) >= 80 ? 'bg-negative' : 'bg-positive',
                sotto: `${euro(a.utilizzato)} su ${euro(a.accordato)} · allerta all’80%`
              },
              {
                label: 'Finanziamenti già rimborsati',
                valore: originario ? percent((rimborsato / originario) * 100, 0) : '—',
                quota: originario ? rimborsato / originario : null,
                colore: 'bg-brand-400',
                sotto: `${euro(rimborsato)} su ${euro(originario)} erogati`
              },
              {
                label: 'Rata media mensile',
                valore: euro(vista.rataMensile),
                sotto: `${euro(vista.rate12Mesi)} nei prossimi 12 mesi`
              },
              {
                label: 'Istituti',
                valore: String(vista.banks.length),
                sotto: `${vista.lines.length} linee di credito · ${vista.loans.length} finanziamenti`
              }
            ]}
          />
        )
      })()}

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-cols-6 gap-3">
        <Kpi label="Affidamenti accordati" valore={euro(a.accordato)} />
        <Kpi
          label="Affidamenti utilizzati"
          valore={euro(a.utilizzato)}
          nota={
            a.utilizzoPercent === null ? undefined : `${percent(a.utilizzoPercent, 0)} dell'accordato`
          }
          tono={
            (a.utilizzoPercent ?? 0) >= SOGLIA_UTILIZZO_AFFIDAMENTI ? 'text-warning' : 'text-ink-100'
          }
        />
        <Kpi label="Affidamenti disponibili" valore={euro(a.disponibile)} tono="text-positive" />
        <Kpi
          label="Debito residuo finanziamenti"
          valore={euro(vista.debitoResiduo)}
          nota={`${euro(vista.rate12Mesi)} di rate nei prossimi 12 mesi`}
        />
        <Kpi
          label="Rata mensile complessiva"
          valore={euro(vista.rataMensile)}
          nota="Rate ricondotte al mese"
        />
        <Kpi label="Istituti di credito" valore={String(vista.banks.length)} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card
          title="Situazione bancaria"
          className="col-span-2"
          actions={
            canEdit && (
              <Button className="px-3 py-1 text-xs" onClick={() => setModulo({ tipo: 'banca', bank: null })}>
                + Istituto
              </Button>
            )
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs text-ink-400">
                <th className={`${TH} text-left`}>Istituto</th>
                <th className={`${TH} text-right`}>Accordato</th>
                <th className={`${TH} text-right`}>Utilizzato</th>
                <th className={`${TH} text-right`}>Disponibile</th>
                <th className={`${TH} text-right`}>Utilizzo linee</th>
                {canEdit && <th className={TH} />}
              </tr>
            </thead>
            <tbody>
              {vista.perBanca.map((b) => {
                const bank = vista.banks.find((x) => x.uuid === b.bank_uuid)!
                return (
                  <tr key={b.bank_uuid} className="border-b border-ink-800 last:border-0">
                    <td className="px-4 py-2.5 text-ink-100">
                      {b.name}
                      {bank.branch && <span className="block text-xs text-ink-500">{bank.branch}</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums text-ink-300`}>{euro(b.accordato)}</td>
                    <td className={`${TD} text-right tabular-nums text-ink-100`}>{euro(b.utilizzato)}</td>
                    <td className={`${TD} text-right tabular-nums text-positive`}>{euro(b.disponibile)}</td>
                    <td className={TD}>
                      <Utilizzo valore={b.utilizzoPercent} />
                    </td>
                    {canEdit && (
                      <td className={`${TD} text-right`}>
                        <Azione onClick={() => setModulo({ tipo: 'banca', bank })}>Modifica</Azione>
                        <Azione pericolo onClick={() => elimina(`banks/${bank.uuid}`, bank.name)}>
                          Elimina
                        </Azione>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="border-t border-ink-700 px-4 py-2.5 text-xs text-ink-500">
            Per i finanziamenti accordato e utilizzato coincidono col debito residuo, come nella
            Centrale Rischi. Disponibile e utilizzo si riferiscono alle sole linee a revoca.
          </p>
        </Card>

        <Card title="Utilizzo per tipologia">
          <div className="px-5 py-4">
            {vista.perTipologia.length > 0 ? (
              <CompositionePie
                fette={vista.perTipologia.map((t) => ({ nome: t.label, valore: t.utilizzato }))}
                etichetta="Totale utilizzato"
              />
            ) : (
              <p className="text-sm text-ink-400">Nessun utilizzo registrato.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-1 border-b border-ink-700">
        {schede.map((s) => (
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
            <span className="ml-1.5 text-xs text-ink-500">{s.n}</span>
          </button>
        ))}
        {canEdit && (
          <div className="mb-1.5 ml-auto flex gap-2">
            <Button className="px-3 py-1 text-xs" onClick={() => setModulo({ tipo: 'linea', line: null })}>
              + Linea di credito
            </Button>
            <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setModulo({ tipo: 'finanziamento', loan: null })}>
              + Finanziamento
            </Button>
          </div>
        )}
      </div>

      {scheda === 'finanziamenti' ? (
        <Card>
          {vista.loans.length === 0 ? (
            <EmptyState title="Nessun finanziamento" description="Mutui, finanziamenti e leasing: le rate entrano da sole nella previsione di cassa." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-xs text-ink-400">
                    <th className={`${TH} text-left`}>Finanziamento</th>
                    <th className={`${TH} text-left`}>Istituto</th>
                    <th className={`${TH} text-right`}>Importo originario</th>
                    <th className={`${TH} text-right`}>Debito residuo</th>
                    <th className={`${TH} text-right`}>Rata</th>
                    <th className={`${TH} text-right`}>Tasso</th>
                    <th className={`${TH} text-left`}>Prossima rata</th>
                    <th className={`${TH} text-left`}>Scadenza</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {vista.loans.map((l) => (
                    <tr key={l.uuid} className="border-b border-ink-800 last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="text-ink-100">{l.label}</p>
                        <p className="text-xs text-ink-500">
                          {LOAN_LABELS[l.kind]} · {l.status.paidInstallments}/{l.installments} rate pagate
                          {l.grace_installments > 0 && l.status.paidInstallments < l.grace_installments && ' · in preammortamento'}
                        </p>
                      </td>
                      <td className={`${TD} text-ink-300`}>{banca(l.bank_uuid)}</td>
                      <td className={`${TD} text-right tabular-nums text-ink-300`}>{euro(l.principal_cents)}</td>
                      <td className={`${TD} text-right font-medium tabular-nums text-ink-100`}>{euro(l.status.residual)}</td>
                      <td className={`${TD} text-right tabular-nums text-ink-100`}>
                        {l.status.next ? euro(l.status.next.total, true) : '—'}
                        <span className="block text-[11px] text-ink-500">{FREQUENCY_LABELS[l.frequency].toLowerCase()}</span>
                      </td>
                      <td className={`${TD} text-right tabular-nums text-ink-300`}>{percent(l.annual_rate_percent, 2)}</td>
                      <td className={`${TD} text-ink-300`}>{l.status.next ? dataIt(l.status.next.date) : 'Estinto'}</td>
                      <td className={`${TD} text-ink-300`}>
                        {dataIt(l.status.endDate)}
                        {l.balloon_cents > 0 && <span className="block text-[11px] text-ink-500">riscatto {euro(l.balloon_cents)}</span>}
                      </td>
                      <td className={`${TD} text-right`}>
                        <Azione onClick={() => setModulo({ tipo: 'piano', loan: l })}>Piano</Azione>
                        {canEdit && (
                          <>
                            <Azione onClick={() => setModulo({ tipo: 'finanziamento', loan: l })}>Modifica</Azione>
                            <Azione pericolo onClick={() => elimina(`loans/${l.uuid}`, l.label)}>
                              Elimina
                            </Azione>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-ink-700 px-4 py-2.5 text-xs text-ink-500">
            Le rate dei finanziamenti e dei leasing vengono considerate automaticamente nel Cash Flow
            previsionale. Le rate già scadute si considerano pagate.
          </p>
        </Card>
      ) : (
        <Card>
          {vista.lines.filter((l) => l.kind === scheda).length === 0 ? (
            <EmptyState title={`Nessuna linea: ${CREDIT_LINE_LABELS[scheda].toLowerCase()}`} description="Aggiungila con il pulsante + Linea di credito." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-xs text-ink-400">
                  <th className={`${TH} text-left`}>Istituto</th>
                  <th className={`${TH} text-left`}>Linea</th>
                  <th className={`${TH} text-right`}>Accordato</th>
                  <th className={`${TH} text-right`}>Utilizzato</th>
                  <th className={`${TH} text-right`}>Disponibile</th>
                  <th className={`${TH} text-right`}>Utilizzo</th>
                  <th className={`${TH} text-right`}>Tasso</th>
                  <th className={`${TH} text-left`}>Scadenza</th>
                  {canEdit && <th className={TH} />}
                </tr>
              </thead>
              <tbody>
                {vista.lines
                  .filter((l) => l.kind === scheda)
                  .map((l) => (
                    <tr key={l.uuid} className="border-b border-ink-800 last:border-0">
                      <td className={`${TD} text-ink-100`}>{banca(l.bank_uuid)}</td>
                      <td className="px-4 py-2.5 text-ink-300">
                        {l.label}
                        {l.notes && <span className="block text-xs text-ink-500">{l.notes}</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-ink-300`}>{euro(l.granted_cents)}</td>
                      <td className={`${TD} text-right tabular-nums text-ink-100`}>
                        {euro(l.used_cents)}
                        {l.used_as_of && <span className="block text-[11px] text-ink-500">al {dataIt(l.used_as_of)}</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-positive`}>{euro(Math.max(0, l.granted_cents - l.used_cents))}</td>
                      <td className={TD}>
                        <Utilizzo valore={l.granted_cents > 0 ? (l.used_cents / l.granted_cents) * 100 : null} />
                      </td>
                      <td className={`${TD} text-right tabular-nums text-ink-300`}>{percent(l.annual_rate_percent, 2)}</td>
                      <td className={`${TD} text-ink-300`}>{dataIt(l.expiry_date)}</td>
                      {canEdit && (
                        <td className={`${TD} text-right`}>
                          <Azione onClick={() => setModulo({ tipo: 'linea', line: l })}>Modifica</Azione>
                          <Azione pericolo onClick={() => elimina(`credit-lines/${l.uuid}`, l.label)}>
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

      {modulo?.tipo === 'banca' && (
        <BankModal companyUuid={companyUuid} bank={modulo.bank} onClose={() => setModulo(null)} onSaved={salvato} />
      )}
      {modulo?.tipo === 'linea' && (
        <LineModal companyUuid={companyUuid} banks={vista.banks} line={modulo.line} onClose={() => setModulo(null)} onSaved={salvato} />
      )}
      {modulo?.tipo === 'finanziamento' && (
        <LoanModal companyUuid={companyUuid} banks={vista.banks} loan={modulo.loan} onClose={() => setModulo(null)} onSaved={salvato} />
      )}
      {modulo?.tipo === 'piano' && <PianoModal loan={modulo.loan} today={vista.today} onClose={() => setModulo(null)} />}
    </div>
  )
}

function PianoModal({ loan, today, onClose }: { loan: LoanRow; today: string; onClose: () => void }): React.JSX.Element {
  const totaleInteressi = loan.schedule.reduce((s, r) => s + r.interest, 0)
  return (
    <Modal
      title={`Piano di ammortamento — ${loan.label}`}
      subtitle={`${euro(loan.principal_cents)} al ${percent(loan.annual_rate_percent, 2)} · ${loan.installments} rate ${FREQUENCY_LABELS[loan.frequency].toLowerCase().replace(/e$/, 'i')} · ammortamento ${loan.amortization} · interessi totali ${euro(totaleInteressi)}`}
      onClose={onClose}
    >
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink-850">
            <tr className="border-b border-ink-700 text-xs text-ink-400">
              <th className={`${TH} text-right`}>N.</th>
              <th className={`${TH} text-left`}>Data</th>
              <th className={`${TH} text-right`}>Quota capitale</th>
              <th className={`${TH} text-right`}>Interessi</th>
              <th className={`${TH} text-right`}>Rata</th>
              <th className={`${TH} text-right`}>Debito residuo</th>
            </tr>
          </thead>
          <tbody>
            {loan.schedule.map((r) => {
              const pagata = r.date <= today
              return (
                <tr key={r.number} className={`border-b border-ink-800 ${pagata ? 'text-ink-500' : 'text-ink-200'}`}>
                  <td className="px-4 py-1.5 text-right tabular-nums">{r.number}</td>
                  <td className="px-4 py-1.5 tabular-nums">
                    {dataIt(r.date)}
                    {r.grace && <span className="ml-2 text-[10px] text-warning">preammortamento</span>}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{euro(r.capital, true)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{euro(r.interest, true)}</td>
                  <td className="px-4 py-1.5 text-right font-medium tabular-nums">{euro(r.total, true)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{euro(r.residual, true)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-700 px-6 py-3 text-xs text-ink-500">
        In grigio le rate già scadute, considerate pagate.
        {loan.balloon_cents > 0 && ` Dopo l'ultima rata resta il riscatto di ${euro(loan.balloon_cents)}.`}
      </p>
    </Modal>
  )
}
