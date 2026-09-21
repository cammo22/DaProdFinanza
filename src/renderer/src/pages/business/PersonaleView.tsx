import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CONTRATTI,
  CONTRATTO_LABELS,
  costoDipendente,
  inForza,
  normalizzaPersonale,
  riepilogoPersonale,
  type Contratto,
  type ImpostazioniPersonale
} from '@shared/engine'
import type { Company, Employee, EmployeeInput } from '@shared/types'
import { api } from '../../lib/api'
import { useAzione } from '../../lib/comandi'
import { euro, euroInput, parseEuro, percent } from '../../lib/format'
import { Griglia, Pannelli } from '../../components/Pannelli'
import { StrisciaIndicatori } from '../../components/widgets'
import { Alert, Button, CaricamentoPagina, Card, EmptyState, Field, Interruttore, Modal, Select, TextInput } from '../../components/ui'
import { iniziali } from '../../components/Guscio'
import { Icona } from '../../components/icone'
import { mostraAvviso } from '../../components/Avvisi'

/**
 * Personale — AGENTS.md §10.16 (versione 1.3.0).
 *
 * Le persone dell'azienda e quanto costano davvero: costo aziendale, costo di
 * un'ora di lavoro, per reparto, diretti e indiretti. Tutto si ricalcola mentre
 * si scrive, con lo stesso motore del server; il costo orario dei "diretti" è
 * la manodopera che usa la Marginalità.
 */

interface Payload {
  employees: Employee[]
  settings: ImpostazioniPersonale
  bilancio: { label: string; costiPersonale: number; ricavi: number } | null
}

const oggi = (): string => new Date().toISOString().slice(0, 10)

export function PersonaleView({ company, canEdit }: { company: Company; canEdit: boolean }): React.JSX.Element {
  const [dati, setDati] = useState<Payload | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scheda, setScheda] = useState<Employee | 'nuova' | null>(null)
  const [reparto, setReparto] = useState<string>('')
  const [tutti, setTutti] = useState(false)

  const carica = useCallback(async () => {
    try {
      setDati(await api.get<Payload>(`/api/companies/${company.uuid}/personale`))
      setErrore(null)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Personale non disponibile.')
    }
  }, [company.uuid])

  useEffect(() => {
    void carica()
  }, [carica])

  useAzione('nuova-persona', () => setScheda('nuova'), canEdit)

  const giorno = oggi()
  const riepilogo = useMemo(() => (dati ? riepilogoPersonale(dati.employees, dati.settings, giorno) : null), [dati, giorno])
  const reparti = useMemo(
    () => [...new Set((dati?.employees ?? []).map((e) => e.department?.trim() || 'Senza reparto'))].sort(),
    [dati]
  )

  if (errore) return <Alert>{errore}</Alert>
  if (!dati || !riepilogo) return <CaricamentoPagina />

  const visibili = dati.employees.filter(
    (e) => (tutti || inForza(e, giorno)) && (!reparto || (e.department?.trim() || 'Senza reparto') === reparto)
  )
  const incidenza = dati.bilancio && dati.bilancio.ricavi > 0 ? (riepilogo.totale / dati.bilancio.ricavi) * 100 : null
  const salvaImpostazioni = async (p: Partial<ImpostazioniPersonale>): Promise<void> => {
    try {
      const nuove = await api.put<ImpostazioniPersonale>(`/api/companies/${company.uuid}/personale/settings`, {
        ...dati.settings,
        ...p
      })
      setDati({ ...dati, settings: nuove })
      mostraAvviso('Impostazioni del personale salvate.')
    } catch (err) {
      mostraAvviso(err instanceof Error ? err.message : 'Salvataggio non riuscito.', 'errore')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Pannelli vista="personale">
        <StrisciaIndicatori
          indicatori={[
            {
              label: 'Persone in forza',
              valore: String(riepilogo.persone),
              sotto: `${riepilogo.fte.toFixed(1).replace('.', ',')} a tempo pieno equivalente`
            },
            {
              label: 'Costo aziendale annuo',
              valore: euro(riepilogo.totale),
              sotto: `${euro(Math.round(riepilogo.totale / 12))} al mese in media`
            },
            {
              label: 'Costo di un’ora di lavoro',
              valore: riepilogo.costoOrarioDiretti !== null ? `${euro(riepilogo.costoOrarioDiretti, true)}` : '—',
              sotto:
                riepilogo.costoOrarioMedio !== null
                  ? `chi lavora sulla produzione · media di tutti ${euro(riepilogo.costoOrarioMedio, true)}`
                  : 'aggiungi le persone per vederlo'
            },
            {
              label: 'Peso sui ricavi',
              valore: incidenza !== null ? percent(incidenza) : '—',
              sotto: dati.bilancio
                ? `a bilancio ${euro(dati.bilancio.costiPersonale)} (${dati.bilancio.label.toLowerCase()})`
                : 'serve un anno di bilancio per confrontare',
              quota: incidenza !== null ? Math.min(1, incidenza / 60) : null,
              stile: 'barra',
              colore: incidenza !== null && incidenza > 40 ? 'bg-warning' : 'bg-positive'
            }
          ]}
        />

        <Card
          title="Persone"
          actions={
            canEdit ? (
              <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setScheda('nuova')}>
                <Icona nome="piu" className="h-3.5 w-3.5" /> Nuova persona
              </Button>
            ) : undefined
          }
        >
          {dati.employees.length === 0 ? (
            <EmptyState
              title="Ancora nessuna persona"
              description={
                canEdit
                  ? 'Aggiungi chi lavora in azienda con la retribuzione annua lorda: costo aziendale e costo orario si calcolano da soli.'
                  : 'Il consulente non ha ancora inserito il personale.'
              }
              action={
                canEdit && (
                  <Button variant="primary" onClick={() => setScheda('nuova')}>
                    <Icona nome="piu" className="h-4 w-4" /> Aggiungi la prima persona
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800 px-4 py-2.5">
                <button type="button" onClick={() => setReparto('')} className={pastiglia(reparto === '')}>
                  Tutti i reparti
                </button>
                {reparti.map((r) => (
                  <button key={r} type="button" onClick={() => setReparto(r)} className={pastiglia(reparto === r)}>
                    {r}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-2 text-xs text-ink-400">
                  <input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} className="accent-brand-500" />
                  anche chi non c’è più
                </label>
              </div>
              <ul className="divide-y divide-ink-800">
                {visibili.map((e) => {
                  const c = costoDipendente(e, dati.settings)
                  const attivo = inForza(e, giorno)
                  return (
                    <li key={e.uuid}>
                      <button
                        type="button"
                        onClick={() => setScheda(e)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-800/40 ${attivo ? '' : 'opacity-50'}`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            e.direct ? 'bg-brand-500/15 text-brand-300' : 'bg-ink-700 text-ink-300'
                          }`}
                          title={e.direct ? 'Diretto: lavora sulla produzione' : 'Indiretto: struttura'}
                        >
                          {iniziali(e.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-100">{e.name}</span>
                          <span className="block truncate text-xs text-ink-400">
                            {[e.role, e.department, CONTRATTO_LABELS[e.contract].toLowerCase()].filter(Boolean).join(' · ')}
                            {e.hours_week !== dati.settings.orePieno ? ` · ${String(e.hours_week).replace('.', ',')} h/sett.` : ''}
                            {!attivo && e.end_date ? ' · uscito' : ''}
                          </span>
                        </span>
                        <span className="hidden w-28 shrink-0 text-right sm:block">
                          <span className="block text-xs text-ink-500">RAL</span>
                          <span className="block text-sm tabular-nums text-ink-300">{euro(c.ral)}</span>
                        </span>
                        <span className="w-28 shrink-0 text-right">
                          <span className="block text-xs text-ink-500">costo annuo</span>
                          <span className="block text-sm font-semibold tabular-nums text-ink-100">{euro(c.totale)}</span>
                        </span>
                        <span className="hidden w-20 shrink-0 text-right md:block">
                          <span className="block text-xs text-ink-500">all’ora</span>
                          <span className="block text-sm tabular-nums text-ink-200">{c.costoOrario !== null ? euro(c.costoOrario, true) : '—'}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
                {visibili.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-500">Nessuna persona con questi filtri.</li>}
              </ul>
            </>
          )}
        </Card>

        <Griglia colonne={2}>
          <Card title="Per reparto">
            <div className="flex flex-col gap-3 px-5 py-4">
              {riepilogo.perReparto.length === 0 && <p className="text-sm text-ink-500">Nessuna persona in forza.</p>}
              {riepilogo.perReparto.map((r) => (
                <div key={r.reparto}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-200">
                      {r.reparto}{' '}
                      <span className="text-xs text-ink-500">
                        · {r.persone} {r.persone === 1 ? 'persona' : 'persone'}
                      </span>
                    </span>
                    <span className="tabular-nums text-ink-100">{euro(r.totale)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${riepilogo.totale ? (r.totale / riepilogo.totale) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              {riepilogo.totale > 0 && (
                <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900/50 p-3">
                  <p className="text-xs text-ink-400">Diretti e indiretti</p>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-ink-800">
                    <div className="bg-brand-500" style={{ width: `${(riepilogo.diretti / riepilogo.totale) * 100}%` }} />
                    <div className="bg-ink-500" style={{ width: `${(riepilogo.indiretti / riepilogo.totale) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-brand-300">diretti {euro(riepilogo.diretti)}</span>
                    <span className="text-ink-300">indiretti {euro(riepilogo.indiretti)}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-500">
                    Diretti: chi lavora su ciò che si vende (cucina, sala, cantiere). Indiretti: la struttura
                    (amministrazione, direzione). Nella Marginalità i diretti sono manodopera, gli indiretti costi generali.
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Come si calcola">
            <ImpostazioniCalcolo impostazioni={dati.settings} canEdit={canEdit} onSalva={salvaImpostazioni} />
          </Card>
        </Griglia>
      </Pannelli>

      {scheda && (
        <SchedaPersona
          companyUuid={company.uuid}
          persona={scheda === 'nuova' ? null : scheda}
          impostazioni={dati.settings}
          reparti={reparti.filter((r) => r !== 'Senza reparto')}
          canEdit={canEdit}
          onClose={() => setScheda(null)}
          onSaved={(messaggio) => {
            setScheda(null)
            mostraAvviso(messaggio)
            void carica()
          }}
        />
      )}
    </div>
  )
}

function pastiglia(attiva: boolean): string {
  return `whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
    attiva ? 'border-brand-400/60 bg-brand-500/15 text-brand-200' : 'border-ink-700 text-ink-300 hover:text-ink-100'
  }`
}

// --- impostazioni del calcolo ----------------------------------------------------------

function ImpostazioniCalcolo({
  impostazioni,
  canEdit,
  onSalva
}: {
  impostazioni: ImpostazioniPersonale
  canEdit: boolean
  onSalva: (p: Partial<ImpostazioniPersonale>) => Promise<void>
}): React.JSX.Element {
  const [bozza, setBozza] = useState(() => campi(impostazioni))
  useEffect(() => setBozza(campi(impostazioni)), [impostazioni])
  const cambiato = JSON.stringify(bozza) !== JSON.stringify(campi(impostazioni))

  const riga = (k: keyof ReturnType<typeof campi>, label: string, unita: string, aiuto: string): React.JSX.Element => (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-ink-200">{label}</span>
        <span className="block text-[11px] text-ink-500">{aiuto}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <input
          value={bozza[k]}
          disabled={!canEdit}
          onChange={(e) => setBozza({ ...bozza, [k]: e.target.value })}
          inputMode="decimal"
          className="w-20 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm tabular-nums text-ink-100 outline-none focus:border-brand-500 disabled:opacity-60"
        />
        <span className="w-8 text-xs text-ink-500">{unita}</span>
      </span>
    </label>
  )

  return (
    <div className="flex flex-col px-5 py-3">
      {riga('contributiPct', 'Contributi INPS azienda', '%', 'della RAL; si può cambiare per persona')}
      {riga('inailPct', 'INAIL', '%', 'dipende dal rischio dell’attività')}
      {riga('oreAnnue', 'Ore lavorate in un anno', 'h', 'da un tempo pieno, tolte ferie e festività')}
      {riga('orePieno', 'Tempo pieno', 'h/sett.', 'il riferimento per il part-time')}
      <div className="my-2 border-t border-ink-800" />
      {riga('trattenutePct', 'Trattenute in busta', '%', 'contributi del dipendente e IRPEF, versati con l’F24')}
      {riga('giornoStipendio', 'Giorno degli stipendi', '', 'del mese dopo quello lavorato')}
      <Interruttore
        label="Stipendi e F24 nella tesoreria"
        descrizione="Netti, F24 del 16 e INAIL di febbraio entrano nella previsione di cassa. Spegni le previsioni manuali di stipendi e F24, se ci sono: si conterebbero due volte."
        acceso={impostazioni.inTesoreria}
        disabled={!canEdit}
        onChange={(v) => void onSalva({ inTesoreria: v })}
      />
      {canEdit && (
        <div className="flex justify-end pt-2">
          <Button variant="primary" className="px-3 py-1.5 text-xs" disabled={!cambiato} onClick={() => void onSalva(normalizzaPersonale(bozza, impostazioni))}>
            Salva
          </Button>
        </div>
      )}
    </div>
  )
}

function campi(i: ImpostazioniPersonale): Record<'contributiPct' | 'inailPct' | 'oreAnnue' | 'orePieno' | 'trattenutePct' | 'giornoStipendio', string> {
  const t = (n: number): string => String(n).replace('.', ',')
  return {
    contributiPct: t(i.contributiPct),
    inailPct: t(i.inailPct),
    oreAnnue: t(i.oreAnnue),
    orePieno: t(i.orePieno),
    trattenutePct: t(i.trattenutePct),
    giornoStipendio: t(i.giornoStipendio)
  }
}

// --- scheda di una persona ---------------------------------------------------------------

function SchedaPersona({
  companyUuid,
  persona,
  impostazioni,
  reparti,
  canEdit,
  onClose,
  onSaved
}: {
  companyUuid: string
  persona: Employee | null
  impostazioni: ImpostazioniPersonale
  reparti: string[]
  canEdit: boolean
  onClose: () => void
  onSaved: (messaggio: string) => void
}): React.JSX.Element {
  const [f, setF] = useState({
    name: persona?.name ?? '',
    role: persona?.role ?? '',
    department: persona?.department ?? '',
    contract: (persona?.contract ?? 'indeterminato') as Contratto,
    ccnl_level: persona?.ccnl_level ?? '',
    hours_week: String(persona?.hours_week ?? impostazioni.orePieno).replace('.', ','),
    ral: persona ? euroInput(persona.gross_annual_cents) : '',
    monthly_payments: String(persona?.monthly_payments ?? 13),
    contrib: persona?.employer_contrib_pct === null || persona?.employer_contrib_pct === undefined ? '' : String(persona.employer_contrib_pct).replace('.', ','),
    inail: persona?.inail_pct === null || persona?.inail_pct === undefined ? '' : String(persona.inail_pct).replace('.', ','),
    altri: persona ? euroInput(persona.other_costs_cents) : '',
    direct: persona ? persona.direct === 1 : true,
    start_date: persona?.start_date ?? '',
    end_date: persona?.end_date ?? '',
    notes: persona?.notes ?? ''
  })
  const [errore, setErrore] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]): void => setF((x) => ({ ...x, [k]: v }))
  const num = (t: string): number | null => {
    const n = Number(t.trim().replace(',', '.'))
    return t.trim() && Number.isFinite(n) ? n : null
  }

  const input: EmployeeInput = {
    name: f.name,
    role: f.role || null,
    department: f.department || null,
    contract: f.contract,
    ccnl_level: f.ccnl_level || null,
    hours_week: num(f.hours_week) ?? 0,
    gross_annual_cents: parseEuro(f.ral) ?? 0,
    monthly_payments: Number(f.monthly_payments),
    employer_contrib_pct: num(f.contrib),
    inail_pct: num(f.inail),
    other_costs_cents: f.altri.trim() ? (parseEuro(f.altri) ?? 0) : 0,
    direct: f.direct ? 1 : 0,
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    notes: f.notes || null
  }
  const c = costoDipendente(
    {
      uuid: persona?.uuid ?? 'nuova',
      name: f.name,
      department: f.department || null,
      contract: f.contract,
      hours_week: input.hours_week ?? 0,
      gross_annual_cents: input.gross_annual_cents ?? 0,
      monthly_payments: input.monthly_payments ?? 13,
      employer_contrib_pct: input.employer_contrib_pct ?? null,
      inail_pct: input.inail_pct ?? null,
      other_costs_cents: input.other_costs_cents ?? 0,
      direct: input.direct ?? 1,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null
    },
    impostazioni
  )

  const salva = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!canEdit) return
    setBusy(true)
    setErrore(null)
    try {
      if (persona) await api.put(`/api/companies/${companyUuid}/employees/${persona.uuid}`, input)
      else await api.post(`/api/companies/${companyUuid}/employees`, input)
      onSaved(persona ? `${f.name} aggiornato.` : `${f.name} aggiunto al personale.`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
      setBusy(false)
    }
  }

  const elimina = async (): Promise<void> => {
    if (!persona || !confirm(`Togliere ${persona.name} dal personale? Se è uscito dall’azienda, meglio scrivere la data di fine: resta nello storico.`)) return
    setBusy(true)
    try {
      await api.delete(`/api/companies/${companyUuid}/employees/${persona.uuid}`)
      onSaved(`${persona.name} tolto dal personale.`)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
      setBusy(false)
    }
  }

  const voce = (label: string, v: number, forte = false): React.JSX.Element => (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${forte ? 'border-t border-ink-700 pt-2 font-semibold text-ink-100' : 'text-ink-300'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">{euro(v)}</span>
    </div>
  )

  return (
    <Modal title={persona ? persona.name : 'Nuova persona'} subtitle="Il costo si ricalcola mentre scrivi." onClose={onClose}>
      <form onSubmit={salva}>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-[1fr_15rem] md:px-6">
          <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3">
            {errore && (
              <div className="col-span-2">
                <Alert>{errore}</Alert>
              </div>
            )}
            <div className="col-span-2">
              <Field label="Nome e cognome" required>
                <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus={!persona} />
              </Field>
            </div>
            <Field label="Mansione">
              <TextInput value={f.role} onChange={(e) => set('role', e.target.value)} placeholder="es. Pizzaiolo" />
            </Field>
            <Field label="Reparto">
              <TextInput value={f.department} onChange={(e) => set('department', e.target.value)} list="reparti-personale" placeholder="es. Cucina" />
              <datalist id="reparti-personale">
                {reparti.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="Contratto">
              <Select value={f.contract} onChange={(e) => set('contract', e.target.value as Contratto)}>
                {CONTRATTI.map((k) => (
                  <option key={k} value={k}>
                    {CONTRATTO_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ore a settimana" hint={`tempo pieno ${impostazioni.orePieno}`}>
              <TextInput value={f.hours_week} onChange={(e) => set('hours_week', e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Retribuzione annua lorda (RAL)" required hint="Tredicesima e quattordicesima comprese">
              <TextInput value={f.ral} onChange={(e) => set('ral', e.target.value)} inputMode="decimal" placeholder="es. 26.000" />
            </Field>
            <Field label="Mensilità">
              <Select value={f.monthly_payments} onChange={(e) => set('monthly_payments', e.target.value)}>
                <option value="12">12</option>
                <option value="13">13 (con la tredicesima)</option>
                <option value="14">14 (anche la quattordicesima)</option>
              </Select>
            </Field>
            <Field label="Contributi azienda %" hint={`vuoto = ${String(impostazioni.contributiPct).replace('.', ',')}% dell'azienda`}>
              <TextInput value={f.contrib} onChange={(e) => set('contrib', e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="INAIL %" hint={`vuoto = ${String(impostazioni.inailPct).replace('.', ',')}%`}>
              <TextInput value={f.inail} onChange={(e) => set('inail', e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Altri costi all’anno" hint="Buoni pasto, welfare, formazione, divise">
              <TextInput value={f.altri} onChange={(e) => set('altri', e.target.value)} inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Livello CCNL">
              <TextInput value={f.ccnl_level} onChange={(e) => set('ccnl_level', e.target.value)} />
            </Field>
            <Field label="Assunto il">
              <TextInput type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </Field>
            <Field label="Fine del rapporto" hint="Solo se è uscito o ha un termine">
              <TextInput type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </Field>
            <label className="col-span-2 flex items-start gap-2.5 rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-sm">
              <input type="checkbox" checked={f.direct} onChange={(e) => set('direct', e.target.checked)} className="mt-0.5 accent-brand-500" />
              <span>
                <span className="text-ink-100">Lavora sulla produzione (costo diretto)</span>
                <span className="block text-xs text-ink-400">Cucina, sala, cantiere, reparto: le sue ore entrano nel costo di ciò che si vende.</span>
              </span>
            </label>
          </fieldset>

          <aside className="h-fit rounded-xl border border-ink-700 bg-ink-900/60 p-4 md:sticky md:top-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Costo per l’azienda</p>
            <div className="mt-2">
              {voce('Retribuzione lorda', c.ral)}
              {voce('Contributi INPS', c.contributi)}
              {voce('INAIL', c.inail)}
              {voce('TFR (RAL ÷ 13,5)', c.tfr)}
              {voce('Altri costi', c.altri)}
              {voce('Costo aziendale annuo', c.totale, true)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-ink-850 px-3 py-2">
                <p className="text-[10px] text-ink-500">al mese</p>
                <p className="text-sm font-semibold tabular-nums text-ink-100">{euro(c.mensile)}</p>
              </div>
              <div className="rounded-lg bg-ink-850 px-3 py-2">
                <p className="text-[10px] text-ink-500">all’ora</p>
                <p className="text-sm font-semibold tabular-nums text-brand-300">{c.costoOrario !== null ? euro(c.costoOrario, true) : '—'}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              {c.oreAnno.toLocaleString('it-IT')} ore l’anno ({(c.fte * 100).toFixed(0)}% di un tempo pieno).
            </p>
          </aside>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-700 px-5 py-4 md:px-6">
          {persona && canEdit && (
            <Button type="button" variant="danger" className="mr-auto" disabled={busy} onClick={() => void elimina()}>
              Togli
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {canEdit ? 'Annulla' : 'Chiudi'}
          </Button>
          {canEdit && (
            <Button type="submit" variant="primary" disabled={busy || !f.name.trim()}>
              {persona ? 'Salva' : 'Aggiungi'}
            </Button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
