import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AccountRow,
  AccountSection,
  Company,
  FiscalPeriod,
  PeriodBalances,
  SaveBalancesResult,
  Scenario
} from '@shared/types'
import { api } from '../../lib/api'
import { euro, euroInput, parseEuro } from '../../lib/format'
import { Alert, Button, Card, Select, TextInput } from '../../components/ui'

/**
 * Saldi inseriti a mano: si sceglie il periodo e si scrivono gli importi conto
 * per conto, come su un foglio, ma dentro il programma. Si salva solo quello
 * che è cambiato.
 */

export const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

const SCENARI: { id: Scenario; label: string }[] = [
  { id: 'actual', label: 'Consuntivo' },
  { id: 'budget', label: 'Budget' },
  { id: 'forecast', label: 'Forecast' }
]

/** Il periodo prima: il mese precedente, o l'anno precedente per un bilancio annuale. */
function precedente(year: number, month: number | null): { year: number; month: number | null } {
  if (month === null) return { year: year - 1, month: null }
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/** Il periodo dopo: il mese successivo, o l'anno successivo. */
function successivo(year: number, month: number | null): { year: number; month: number | null } {
  if (month === null) return { year: year + 1, month: null }
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

/**
 * Primo periodo da proporre: l'ultimo con dati a consuntivo, così si vede
 * subito cosa c'è. Senza dati, il mese scorso.
 */
function periodoIniziale(periods: FiscalPeriod[]): { year: number; month: number | null } {
  const ultimo = periods.find((p) => p.scenarios?.includes('actual')) ?? periods[0]
  if (ultimo) return { year: ultimo.year, month: ultimo.month }
  const oggi = new Date()
  return oggi.getMonth() === 0
    ? { year: oggi.getFullYear() - 1, month: 12 }
    : { year: oggi.getFullYear(), month: oggi.getMonth() }
}

export function BalancesEditor({
  company,
  accounts,
  sections,
  periods,
  canEdit,
  onSaved
}: {
  company: Company
  accounts: AccountRow[]
  sections: AccountSection[]
  periods: FiscalPeriod[]
  canEdit: boolean
  onSaved: () => void
}): React.JSX.Element {
  const iniziale = useMemo(() => periodoIniziale(periods), [periods.length === 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const [year, setYear] = useState(iniziale.year)
  const [month, setMonth] = useState<number | null>(iniziale.month)
  const [scenario, setScenario] = useState<Scenario>('actual')
  const [dati, setDati] = useState<PeriodBalances | null>(null)
  const [testi, setTesti] = useState<Record<string, string>>({})
  const [cerca, setCerca] = useState('')
  const [soloConImporto, setSoloConImporto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const base = `/api/companies/${company.uuid}`

  const carica = useCallback(async () => {
    setError(null)
    try {
      const query = `year=${year}&month=${month ?? ''}&scenario=${scenario}`
      const result = await api.get<PeriodBalances>(`${base}/balances?${query}`)
      setDati(result)
      setTesti(Object.fromEntries(Object.entries(result.amounts).map(([k, v]) => [k, euroInput(v)])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caricamento dei saldi non riuscito.')
    }
  }, [base, year, month, scenario])

  useEffect(() => {
    carica()
  }, [carica])

  // Modifiche rispetto a quanto salvato: null = saldo da togliere.
  const modifiche = useMemo(() => {
    const out: Record<string, number | null> = {}
    const invalidi = new Set<string>()
    if (!dati) return { out, invalidi }
    const tutti = new Set([...Object.keys(testi), ...Object.keys(dati.amounts)])
    for (const uuid of tutti) {
      const testo = (testi[uuid] ?? '').trim()
      const valore = testo === '' ? null : parseEuro(testo)
      if (testo !== '' && valore === null) {
        invalidi.add(uuid)
        continue
      }
      const prima = dati.amounts[uuid] ?? null
      if (valore !== prima) out[uuid] = valore
    }
    return { out, invalidi }
  }, [testi, dati])

  const nModifiche = Object.keys(modifiche.out).length
  const chiuso = dati?.period?.closed === 1
  const modificabile = canEdit && !chiuso

  const conferma = (): boolean =>
    nModifiche === 0 || window.confirm(`Ci sono ${nModifiche} modifiche non salvate. Le perdi?`)

  const cambia = (fn: () => void): void => {
    if (!conferma()) return
    setEsito(null)
    fn()
  }

  const valoreDi = (uuid: string): number | null => {
    const testo = (testi[uuid] ?? '').trim()
    return testo === '' ? null : parseEuro(testo)
  }

  // Totali mentre si scrive: danno subito il senso di cosa si sta inserendo.
  const totali = useMemo(() => {
    const t = { ricavi: 0, costi: 0, attivo: 0, passivo: 0, perSezione: {} as Record<string, number> }
    for (const account of accounts) {
      const v = valoreDi(account.uuid)
      if (v === null) continue
      const segno = account.account_type === "ATTIVITA' NEGATIVO" ? -1 : 1
      t.perSezione[account.section_code] = (t.perSezione[account.section_code] ?? 0) + segno * v
      if (account.account_type === 'RICAVO') t.ricavi += v
      else if (account.account_type === 'COSTO') t.costi += v
      else if (account.account_type === 'PASSIVITA\'') t.passivo += v
      else t.attivo += segno * v
    }
    return t
  }, [testi, accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const copiaPrecedente = async (): Promise<void> => {
    const p = precedente(year, month)
    setError(null)
    try {
      const prev = await api.get<PeriodBalances>(
        `${base}/balances?year=${p.year}&month=${p.month ?? ''}&scenario=${scenario}`
      )
      const n = Object.keys(prev.amounts).length
      if (n === 0) {
        setError(`${p.month ? `${MESI[p.month - 1]} ${p.year}` : p.year} non ha saldi da copiare.`)
        return
      }
      // Si riempiono solo i campi vuoti: quello che è già scritto non si tocca.
      setTesti((correnti) => {
        const nuovi = { ...correnti }
        for (const [uuid, cents] of Object.entries(prev.amounts)) {
          if (!(nuovi[uuid] ?? '').trim()) nuovi[uuid] = euroInput(cents)
        }
        return nuovi
      })
      setEsito(`Copiati i saldi del periodo precedente nei campi vuoti. Controllali e salva.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copia non riuscita.')
    }
  }

  const salva = async (): Promise<void> => {
    if (modifiche.invalidi.size > 0) {
      setError('Alcuni importi non sono numeri: correggi i campi in rosso.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.put<SaveBalancesResult>(`${base}/balances`, {
        year,
        month,
        scenario,
        amounts: modifiche.out
      })
      const parti = [
        result.written > 0 ? `${result.written} saldi scritti` : null,
        result.removed > 0 ? `${result.removed} tolti` : null
      ].filter(Boolean)
      setEsito(`${result.period.label}: ${parti.join(', ') || 'nessuna modifica'}. Le analisi sono aggiornate.`)
      await carica()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  const chiudiPeriodo = async (chiudi: boolean): Promise<void> => {
    if (!dati?.period) return
    if (chiudi && nModifiche > 0) {
      setError('Salva o annulla le modifiche prima di chiudere il periodo.')
      return
    }
    try {
      await api.post(`${base}/periods/${dati.period.uuid}/close`, { closed: chiudi })
      await carica()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  const eliminaPeriodo = async (): Promise<void> => {
    if (!dati?.period) return
    if (!window.confirm(`Eliminare ${dati.period.label} con tutti i suoi saldi (di ogni scenario)?`)) return
    try {
      await api.delete(`${base}/periods/${dati.period.uuid}`)
      setEsito(`${dati.period.label} eliminato.`)
      await carica()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    }
  }

  // Invio passa al campo successivo, come in un foglio di calcolo.
  const avanti = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const campi = [...document.querySelectorAll<HTMLInputElement>('input[data-saldo]')]
    const i = campi.indexOf(event.currentTarget)
    campi[i + 1]?.focus()
    campi[i + 1]?.select()
  }

  const anni = useMemo(() => {
    const oggi = new Date().getFullYear()
    const set = new Set<number>(periods.map((p) => p.year))
    for (let y = oggi - 6; y <= oggi + 2; y++) set.add(y)
    return [...set].sort((a, b) => b - a)
  }, [periods])

  const filtro = cerca.trim().toLowerCase()
  const visibili = accounts.filter((a) => {
    const valore = (testi[a.uuid] ?? '').trim()
    if (!a.active && !valore) return false
    if (soloConImporto && !valore) return false
    if (!filtro) return true
    return a.code.toLowerCase().includes(filtro) || a.name.toLowerCase().includes(filtro)
  })

  const gruppi = sections
    .map((section) => ({ section, righe: visibili.filter((a) => a.section_code === section.code) }))
    .filter((g) => g.righe.length > 0)

  const risultato = totali.ricavi - totali.costi
  const differenza = totali.attivo - totali.passivo

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">Anno</span>
            <Select
              value={year}
              onChange={(e) => cambia(() => setYear(Number(e.target.value)))}
              className="w-28 py-1.5 text-sm"
            >
              {anni.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">Periodo</span>
            <Select
              value={month ?? ''}
              onChange={(e) => cambia(() => setMonth(e.target.value ? Number(e.target.value) : null))}
              className="w-44 py-1.5 text-sm"
            >
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
              <option value="">Anno intero (bilancio)</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-400">Scenario</span>
            <Select
              value={scenario}
              onChange={(e) => cambia(() => setScenario(e.target.value as Scenario))}
              className="w-36 py-1.5 text-sm"
            >
              {SCENARI.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {dati?.period && canEdit && (
              <>
                <Button className="px-3 py-1.5 text-xs" onClick={() => chiudiPeriodo(!chiuso)}>
                  {chiuso ? 'Riapri periodo' : 'Chiudi periodo'}
                </Button>
                {!chiuso && (
                  <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={eliminaPeriodo}>
                    Elimina periodo
                  </Button>
                )}
              </>
            )}
            <Button
              className="px-3 py-1.5 text-xs"
              title="Passa al periodo successivo, per inserire un mese nuovo"
              onClick={() =>
                cambia(() => {
                  const n = successivo(year, month)
                  setYear(n.year)
                  setMonth(n.month)
                })
              }
            >
              {month === null ? 'Anno successivo →' : 'Mese successivo →'}
            </Button>
            {modificabile && (
              <Button className="px-3 py-1.5 text-xs" onClick={copiaPrecedente}>
                Copia dal periodo precedente
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-ink-700 bg-ink-700 md:grid-cols-5">
          {[
            { label: 'Ricavi', value: totali.ricavi },
            { label: 'Costi', value: totali.costi },
            { label: 'Risultato', value: risultato, tono: risultato >= 0 ? 'text-positive' : 'text-negative' },
            { label: 'Attivo netto', value: totali.attivo },
            { label: 'Passivo e netto', value: totali.passivo }
          ].map((k) => (
            <div key={k.label} className="bg-ink-850 px-5 py-3">
              <p className="text-[11px] uppercase tracking-wider text-ink-400">{k.label}</p>
              <p className={`mt-1 font-mono text-base font-semibold ${k.tono ?? 'text-ink-100'}`}>
                {euro(k.value)}
              </p>
            </div>
          ))}
        </div>
        {totali.attivo !== 0 && totali.passivo !== 0 && differenza !== 0 && (
          <p className="border-t border-ink-700 px-5 py-2 text-xs text-ink-400">
            Attivo e passivo differiscono di <span className="font-mono text-ink-200">{euro(differenza, true)}</span>
            {risultato !== 0 && ' — se il patrimonio netto non comprende ancora il risultato del periodo, è normale.'}
          </p>
        )}
      </Card>

      {chiuso && (
        <Alert tone="info">
          {dati?.period?.label} è chiuso: i saldi sono in sola lettura. Riaprilo per modificarli.
        </Alert>
      )}
      {!canEdit && <Alert tone="info">I saldi li inserisce il consulente: qui sono in sola lettura.</Alert>}
      {error && <Alert>{error}</Alert>}
      {esito && <Alert tone="success">{esito}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca per codice o nome del conto…"
          className="max-w-sm py-1.5"
        />
        <label className="flex items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            checked={soloConImporto}
            onChange={(e) => setSoloConImporto(e.target.checked)}
          />
          Solo conti con un importo
        </label>
        <span className="ml-auto text-xs text-ink-400">
          {dati?.period ? `Periodo salvato: ${dati.period.label}` : 'Periodo nuovo: si crea al primo salvataggio'}
        </span>
      </div>

      {gruppi.map(({ section, righe }) => (
        <Card
          key={section.code}
          title={
            <span>
              {section.label}
              <span className="ml-2 font-normal normal-case tracking-normal text-ink-500">
                {section.statement === 'CE' ? 'Conto economico' : 'Stato patrimoniale'}
              </span>
            </span>
          }
          actions={
            <span className="font-mono text-sm font-semibold text-ink-100">
              {euro(totali.perSezione[section.code] ?? 0)}
            </span>
          }
        >
          <ul className="divide-y divide-ink-800">
            {righe.map((account) => {
              const invalido = modifiche.invalidi.has(account.uuid)
              const cambiato = account.uuid in modifiche.out
              return (
                <li key={account.uuid} className="flex items-center gap-4 px-5 py-1.5">
                  <span className="w-24 shrink-0 font-mono text-xs text-ink-400">{account.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-200" title={account.name}>
                    {account.name}
                    {account.account_type === "ATTIVITA' NEGATIVO" && (
                      <span className="ml-2 text-[11px] text-ink-500">(si sottrae)</span>
                    )}
                    {!account.active && <span className="ml-2 text-[11px] text-warning">disattivato</span>}
                  </span>
                  <input
                    data-saldo
                    inputMode="decimal"
                    disabled={!modificabile}
                    value={testi[account.uuid] ?? ''}
                    onChange={(e) => setTesti((t) => ({ ...t, [account.uuid]: e.target.value }))}
                    onKeyDown={avanti}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="—"
                    aria-label={`Saldo ${account.code} ${account.name}`}
                    className={`w-40 rounded-md border bg-ink-900 px-2.5 py-1 text-right font-mono text-sm text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-brand-500 disabled:opacity-60 ${
                      invalido
                        ? 'border-negative'
                        : cambiato
                          ? 'border-brand-500/60 bg-brand-500/5'
                          : 'border-ink-700'
                    }`}
                  />
                </li>
              )
            })}
          </ul>
        </Card>
      ))}

      {gruppi.length === 0 && (
        <p className="text-sm text-ink-400">Nessun conto corrisponde alla ricerca.</p>
      )}

      {modificabile && (
        <div className="sticky -bottom-6 -mx-8 -mb-6 flex items-center gap-3 border-t border-ink-700 bg-ink-900/95 px-8 py-3 backdrop-blur">
          <span className="text-sm text-ink-300">
            {nModifiche === 0
              ? 'Nessuna modifica da salvare.'
              : `${nModifiche} ${nModifiche === 1 ? 'modifica' : 'modifiche'} da salvare`}
            {modifiche.invalidi.size > 0 && (
              <span className="ml-2 text-negative">· {modifiche.invalidi.size} importi non validi</span>
            )}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              disabled={nModifiche === 0 && modifiche.invalidi.size === 0}
              onClick={() => {
                if (!dati) return
                setTesti(Object.fromEntries(Object.entries(dati.amounts).map(([k, v]) => [k, euroInput(v)])))
                setEsito(null)
              }}
            >
              Annulla modifiche
            </Button>
            <Button
              variant="primary"
              disabled={busy || nModifiche === 0 || modifiche.invalidi.size > 0}
              onClick={salva}
            >
              {busy ? 'Salvataggio…' : 'Salva i saldi'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
