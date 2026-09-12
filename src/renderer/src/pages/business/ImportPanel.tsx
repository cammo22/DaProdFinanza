import { useState } from 'react'
import type { Company } from '@shared/types'
import { api, ApiRequestError } from '../../lib/api'
import { euro } from '../../lib/format'
import { Alert, Button, Card, Field, Select, TextInput } from '../../components/ui'

/**
 * Import del piano dei conti — AGENTS.md §10.9 e §11.1.
 *
 * Il passaggio obbligato è l'anteprima: il consulente vede quante righe sono
 * state riconosciute e quante no *prima* che qualcosa venga scritto. Il
 * pulsante che importa davvero compare solo dopo.
 */

interface Preview {
  file: { name: string; sha256: string; sheet: string }
  valueColumn: string | null
  availableValueColumns: string[]
  sections: { label: string; section_code: string | null; rows: number; withValue: number }[]
  accounts: { code: string; name: string; section_label: string; amount_cents: number | null }[]
  unmapped: { row: number; reason: string; code: string | null; name: string | null }[]
  templateRows: number
  duplicates: { code: string; rows: number[] }[]
  warnings: string[]
  alreadyImported: { filename: string; imported_at: string } | null
}

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

export function ImportPanel({
  company,
  onImported
}: {
  company: Company
  onImported: () => void
}): React.JSX.Element {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [valueColumn, setValueColumn] = useState<string>('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState('') // vuoto = periodo annuale
  const [scenario, setScenario] = useState<'actual' | 'budget' | 'forecast'>('actual')
  const [error, setError] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const caricaAnteprima = async (path: string, colonna?: string): Promise<void> => {
    setError(null)
    setEsito(null)
    setBusy(true)
    try {
      const result = await api.post<Preview>(
        `/api/companies/${company.uuid}/import/chart-of-accounts/preview`,
        { filePath: path, valueColumn: colonna }
      )
      setPreview(result)
      setValueColumn(result.valueColumn ?? '')
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Lettura del file non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  const scegliFile = async (): Promise<void> => {
    const path = await window.daprod.pickExcelFile()
    if (!path) return
    setFilePath(path)
    await caricaAnteprima(path)
  }

  const importa = async (overwrite = false): Promise<void> => {
    if (!filePath) return
    setError(null)
    setBusy(true)
    try {
      const result = await api.post<{
        accounts_created: number
        accounts_updated: number
        balances_written: number
      }>(`/api/companies/${company.uuid}/import/chart-of-accounts`, {
        filePath,
        valueColumn,
        year: Number(year),
        month: month ? Number(month) : null,
        scenario,
        overwrite
      })
      setEsito(
        `${result.balances_written} saldi importati — ${result.accounts_created} conti creati, ` +
          `${result.accounts_updated} aggiornati.`
      )
      setPreview(null)
      setFilePath(null)
      onImported()
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && !overwrite) {
        if (confirm(`${err.message}\n\nSovrascrivere?`)) return importa(true)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Import non riuscito.')
      }
    } finally {
      setBusy(false)
    }
  }

  const conValore = preview?.accounts.filter((a) => a.amount_cents !== null).length ?? 0
  const importabile = preview !== null && conValore > 0 && preview.duplicates.length === 0

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {esito && <Alert tone="success">{esito}</Alert>}

      <Card title="Import del piano dei conti">
        <div className="flex items-center gap-4 px-5 py-4">
          <Button variant="primary" onClick={scegliFile} disabled={busy}>
            Scegli il file Excel…
          </Button>
          <span className="text-sm text-ink-400">
            {filePath ? filePath.split(/[\\/]/).pop() : 'Nessun file selezionato.'}
          </span>
        </div>

        {!preview && !busy && (
          <p className="border-t border-ink-700 px-5 py-4 text-sm text-ink-400">
            Il file viene solo letto: nulla viene scritto finché non confermi.
          </p>
        )}
      </Card>

      {preview && (
        <>
          <Card title="Riepilogo — prima di scrivere">
            <div className="grid grid-cols-4 gap-px bg-ink-700">
              {[
                { label: 'Conti riconosciuti', value: preview.accounts.length, ok: true },
                { label: 'Con un valore', value: conValore, ok: conValore > 0 },
                { label: 'Da mappare a mano', value: preview.unmapped.length, ok: preview.unmapped.length === 0 },
                { label: 'Codici duplicati', value: preview.duplicates.length, ok: preview.duplicates.length === 0 }
              ].map((box) => (
                <div key={box.label} className="bg-ink-850 px-5 py-4">
                  <p className={`text-2xl font-semibold ${box.ok ? 'text-ink-100' : 'text-negative'}`}>
                    {box.value}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">{box.label}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-ink-700 px-5 py-4 text-sm text-ink-300">
              <p>
                Foglio <span className="font-mono text-ink-100">{preview.file.sheet}</span> ·{' '}
                {preview.sections.length} sezioni riconosciute
                {preview.templateRows > 0 && ` · ${preview.templateRows} righe di solo modello`}
              </p>
              {preview.alreadyImported && (
                <p className="mt-2 text-warning">
                  Questo identico file è già stato importato il{' '}
                  {new Date(preview.alreadyImported.imported_at).toLocaleString('it-IT')}.
                </p>
              )}
              {preview.warnings.map((w) => (
                <p key={w} className="mt-2 text-warning">
                  {w}
                </p>
              ))}
            </div>

            {preview.unmapped.length > 0 && (
              <div className="border-t border-ink-700 px-5 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-negative">
                  Righe da sistemare nel file
                </h3>
                <ul className="flex flex-col gap-1 text-xs text-ink-300">
                  {preview.unmapped.slice(0, 12).map((u) => (
                    <li key={u.row}>
                      <span className="font-mono text-ink-400">riga {u.row}</span> · {u.code ?? '—'}{' '}
                      {u.name ?? ''} — {u.reason}
                    </li>
                  ))}
                  {preview.unmapped.length > 12 && (
                    <li className="text-ink-400">…e altre {preview.unmapped.length - 12}.</li>
                  )}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Dove finiscono i dati">
            <div className="grid grid-cols-4 gap-4 px-5 py-4">
              <Field label="Colonna valore">
                <Select
                  value={valueColumn}
                  onChange={(e) => {
                    setValueColumn(e.target.value)
                    if (filePath) void caricaAnteprima(filePath, e.target.value)
                  }}
                >
                  {preview.availableValueColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Anno" required>
                <TextInput
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Mese" hint="Vuoto = periodo annuale.">
                <Select value={month} onChange={(e) => setMonth(e.target.value)}>
                  <option value="">— anno intero —</option>
                  {MESI.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Scenario">
                <Select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value as typeof scenario)}
                >
                  <option value="actual">Consuntivo</option>
                  <option value="budget">Budget</option>
                  <option value="forecast">Forecast</option>
                </Select>
              </Field>
            </div>

            <footer className="flex items-center justify-between border-t border-ink-700 px-5 py-4">
              <p className="text-xs text-ink-400">
                {importabile
                  ? `Verranno scritti ${conValore} saldi.`
                  : preview.duplicates.length > 0
                    ? 'Risolvi prima i codici duplicati nel file.'
                    : 'Nessuna riga ha un valore: questo file contiene solo la struttura.'}
              </p>
              <Button
                variant="primary"
                disabled={!importabile || busy || !year}
                onClick={() => importa()}
              >
                {busy ? 'Import in corso…' : 'Importa'}
              </Button>
            </footer>
          </Card>

          {preview.accounts.length > 0 && (
            <Card title={`Conti riconosciuti (${preview.accounts.length})`}>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.accounts.map((a, i) => (
                      <tr key={`${a.code}-${i}`} className="border-b border-ink-800 last:border-0">
                        <td className="px-5 py-2 font-mono text-xs text-ink-400">{a.code}</td>
                        <td className="px-5 py-2 text-ink-100">{a.name}</td>
                        <td className="px-5 py-2 text-xs text-ink-400">{a.section_label}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-ink-100">
                          {euro(a.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
