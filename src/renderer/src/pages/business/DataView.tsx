import { useCallback, useEffect, useState } from 'react'
import type { AccountRow, AccountSection, Company, FiscalPeriod } from '@shared/types'
import { api } from '../../lib/api'
import { Alert, Button, Card, EmptyState } from '../../components/ui'
import { AccountsEditor } from './AccountsEditor'
import { BalancesEditor } from './BalancesEditor'
import { ImportPanel } from './ImportPanel'

/**
 * Dati contabili: dove entrano i numeri dell'azienda.
 *
 * La strada normale è scriverli qui: saldi per periodo e piano dei conti. Il
 * file Excel resta un'alternativa per chi ce l'ha già pronto, non un passaggio
 * obbligato.
 */

type Scheda = 'saldi' | 'conti' | 'excel'

const SCHEDE: { id: Scheda; label: string }[] = [
  { id: 'saldi', label: 'Saldi' },
  { id: 'conti', label: 'Piano dei conti' },
  { id: 'excel', label: 'Importa da Excel' }
]

export function DataView({
  company,
  periods,
  canEdit,
  onChanged
}: {
  company: Company
  periods: FiscalPeriod[]
  canEdit: boolean
  /** Dopo ogni salvataggio: le analisi vanno ricaricate. */
  onChanged: () => void
}): React.JSX.Element {
  const [scheda, setScheda] = useState<Scheda>('saldi')
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [sections, setSections] = useState<AccountSection[]>([])
  const [error, setError] = useState<string | null>(null)

  const caricaConti = useCallback(async () => {
    try {
      setAccounts(await api.get<AccountRow[]>(`/api/companies/${company.uuid}/accounts`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Piano dei conti non disponibile.')
    }
  }, [company.uuid])

  useEffect(() => {
    caricaConti()
    api
      .get<AccountSection[]>('/api/reference/sections')
      .then(setSections)
      .catch(() => setSections([]))
  }, [caricaConti])

  const dopoModifica = (): void => {
    caricaConti()
    onChanged()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-700">
        {SCHEDE.filter((s) => s.id !== 'excel' || canEdit).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScheda(s.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${
              scheda === s.id
                ? 'border-brand-500 font-medium text-brand-300'
                : 'border-transparent text-ink-400 hover:text-ink-100'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}

      {accounts === null ? (
        <p className="text-sm text-ink-400">Caricamento…</p>
      ) : scheda === 'saldi' ? (
        accounts.length === 0 ? (
          <Card>
            <EmptyState
              title="Prima serve il piano dei conti"
              description="I saldi si scrivono conto per conto. Crea il piano dei conti (anche quello di partenza, già pronto) e poi torna qui."
              action={
                canEdit && (
                  <Button variant="primary" onClick={() => setScheda('conti')}>
                    Vai al piano dei conti
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <BalancesEditor
            company={company}
            accounts={accounts}
            sections={sections}
            periods={periods}
            canEdit={canEdit}
            onSaved={dopoModifica}
          />
        )
      ) : scheda === 'conti' ? (
        <AccountsEditor
          company={company}
          accounts={accounts}
          sections={sections}
          canEdit={canEdit}
          onChanged={dopoModifica}
          onImport={() => setScheda('excel')}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Alert tone="info">
            Facoltativo: se hai già il piano dei conti in un file Excel lo puoi caricare da qui. Il
            modello scaricabile ha le colonne giuste; dopo l’import tutto si modifica nel programma.
          </Alert>
          <ImportPanel company={company} onImported={dopoModifica} />
        </div>
      )}
    </div>
  )
}
