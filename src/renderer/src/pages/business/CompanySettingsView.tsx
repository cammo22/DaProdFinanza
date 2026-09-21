import { useCallback, useEffect, useState } from 'react'
import { BUSINESS_TYPES, LEGAL_FORMS } from '@shared/enums'
import {
  MODULO_DI_VISTA,
  MODULO_INFO,
  VISTA_LABELS,
  VISTE_CONDIVISIBILI,
  type PortalSettings,
  type VistaCondivisibile
} from '@shared/settings'
import type { Company, UserListItem } from '@shared/types'
import { api } from '../../lib/api'
import { useImpostazioni } from '../../lib/impostazioni'
import { Alert, Button, Card, Field, Interruttore, Select, TextInput } from '../../components/ui'
import { NewCompanyUserModal } from '../../components/NewCompanyUserModal'
import { ModificaUtente, NuovaPassword } from '../SettingsPage'

/**
 * Impostazioni di un'azienda — AGENTS.md §10.12 (versione 1.3.0), solo Consulente.
 *
 * I consulenti sono gli amministratori; l'azienda è un utente che vede solo
 * quello che le serve. Qui si decide cosa: quali schermate, e se può mandare
 * file, chiedere chiamate, scrivere. Il server applica le stesse regole.
 */

const DESCRIZIONI: Record<VistaCondivisibile, string> = {
  panoramica: 'Il cruscotto: avvisi, indicatori e grafici principali.',
  'conto-economico': 'Il conto economico riclassificato con i confronti.',
  'stato-patrimoniale': 'Attivo, passivo e indici patrimoniali.',
  'capitale-circolante': 'Crediti, magazzino, fornitori e giorni del ciclo.',
  tesoreria: 'La cassa di oggi e la previsione, con lo scadenziario.',
  banche: 'Fidi, linee di credito e finanziamenti.',
  simulazioni: 'Il "cosa succede se": può provare le leve senza cambiare i dati.',
  personale: 'Dipendenti e costo del personale.',
  fiscale: 'Quante tasse e contributi aspettarsi, e quanto mettere da parte.',
  marginalita: 'Food cost, commesse e margini.'
}

type Dialogo =
  | { tipo: 'nuovo-accesso' }
  | { tipo: 'modifica'; utente: UserListItem }
  | { tipo: 'password'; utente: UserListItem }
  | null

export function CompanySettingsView({
  company,
  onCompanyChanged
}: {
  company: Company
  onCompanyChanged: (company: Company) => void
}): React.JSX.Element {
  const { app } = useImpostazioni()
  const [form, setForm] = useState({
    name: company.name,
    vat_number: company.vat_number ?? '',
    tax_code: company.tax_code ?? '',
    legal_form: company.legal_form ?? '',
    business_type: company.business_type ?? '',
    start_date: company.start_date ?? '',
    notes: company.notes ?? ''
  })
  const [portale, setPortale] = useState<PortalSettings | null>(null)
  const [accessi, setAccessi] = useState<UserListItem[]>([])
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [esito, setEsito] = useState<{ tono: 'success' | 'error'; testo: string } | null>(null)

  const mostra = (tono: 'success' | 'error', testo: string): void => {
    setEsito({ tono, testo })
    if (tono === 'success') setTimeout(() => setEsito(null), 2500)
  }

  const caricaAccessi = useCallback(async () => {
    setAccessi(await api.get<UserListItem[]>(`/api/auth/users?company=${company.uuid}`))
  }, [company.uuid])

  useEffect(() => {
    api
      .get<{ settings: PortalSettings }>(`/api/companies/${company.uuid}/portal`)
      .then((r) => setPortale(r.settings))
      .catch((err) => mostra('error', err instanceof Error ? err.message : 'Impostazioni non disponibili.'))
    void caricaAccessi()
  }, [company.uuid, caricaAccessi])

  const salvaPortale = async (parziale: Partial<PortalSettings>): Promise<void> => {
    try {
      const r = await api.put<{ settings: PortalSettings }>(`/api/companies/${company.uuid}/portal`, parziale)
      setPortale(r.settings)
      mostra('success', 'Salvato.')
    } catch (err) {
      mostra('error', err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    }
  }

  const salvaDati = async (): Promise<void> => {
    try {
      onCompanyChanged(await api.put<Company>(`/api/companies/${company.uuid}`, form))
      mostra('success', 'Dati dell’azienda salvati.')
    } catch (err) {
      mostra('error', err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    }
  }

  const attiva = async (u: UserListItem): Promise<void> => {
    try {
      await api.put(`/api/auth/users/${u.uuid}`, { active: !u.active })
      await caricaAccessi()
    } catch (err) {
      mostra('error', err instanceof Error ? err.message : 'Operazione non riuscita.')
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {esito && <Alert tone={esito.tono}>{esito.testo}</Alert>}

      <Card title="Dati dell'azienda">
        <form
          className="grid gap-4 px-5 py-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void salvaDati()
          }}
        >
          <div className="md:col-span-2">
            <Field label="Ragione sociale" required>
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
          </div>
          <Field label="Partita IVA" hint="11 cifre.">
            <TextInput value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} inputMode="numeric" />
          </Field>
          <Field label="Codice fiscale">
            <TextInput value={form.tax_code} onChange={(e) => setForm({ ...form, tax_code: e.target.value })} />
          </Field>
          <Field label="Forma giuridica" hint="Decide il calcolo di imposte e contributi.">
            <Select value={form.legal_form} onChange={(e) => setForm({ ...form, legal_form: e.target.value })}>
              <option value="">— non specificata —</option>
              {LEGAL_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo di attività" hint="Decide cosa mostra la Marginalità e le % di costo diretto.">
            <Select value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })}>
              <option value="">— non specificato —</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inizio collaborazione">
            <TextInput type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label="Note">
            <TextInput value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <p className="text-xs text-ink-400 md:col-span-2">Codice {company.code} — non cambia: è il nome della cartella su disco.</p>
          <div className="md:col-span-2">
            <Button type="submit" variant="primary">
              Salva i dati
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Cosa vede l'azienda">
        <p className="px-5 pt-3 text-xs text-ink-400">
          L&apos;azienda entra con il suo accesso e trova sempre il riepilogo, i documenti e le richieste. Le schermate
          sotto le vede solo se sono accese. Vale subito, anche per chi è già dentro.
        </p>
        {portale ? (
          <div className="divide-y divide-ink-800 px-5">
            {VISTE_CONDIVISIBILI.map((v) => {
              const modulo = MODULO_DI_VISTA[v]
              const spento = modulo ? !app.moduli[modulo] : false
              return (
                <Interruttore
                  key={v}
                  label={VISTA_LABELS[v]}
                  descrizione={
                    spento
                      ? `Il modulo ${MODULO_INFO[modulo!].label} è spento nelle Impostazioni del programma.`
                      : DESCRIZIONI[v]
                  }
                  acceso={portale.viste[v] && !spento}
                  disabled={spento}
                  onChange={(acceso) => void salvaPortale({ viste: { ...portale.viste, [v]: acceso } })}
                />
              )
            })}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-ink-400">Caricamento…</p>
        )}
      </Card>

      <Card title="Cosa può fare l'azienda">
        {portale && (
          <div className="divide-y divide-ink-800 px-5">
            <Interruttore
              label="Mandare documenti"
              descrizione={
                app.moduli.documenti
                  ? 'Carica file nel cassetto: fatture, estratti conto, buste paga…'
                  : 'Il modulo Documenti è spento nelle Impostazioni del programma.'
              }
              acceso={portale.inviareDocumenti && app.moduli.documenti}
              disabled={!app.moduli.documenti}
              onChange={(v) => void salvaPortale({ inviareDocumenti: v })}
            />
            <Interruttore
              label="Chiedere una chiamata"
              descrizione={
                app.moduli.richieste
                  ? 'Lo studio riceve la richiesta con il motivo e il numero, e sceglie come rispondere.'
                  : 'Il modulo Richieste è spento nelle Impostazioni del programma.'
              }
              acceso={portale.richiedereChiamate && app.moduli.richieste}
              disabled={!app.moduli.richieste}
              onChange={(v) => void salvaPortale({ richiedereChiamate: v })}
            />
            <Interruttore
              label="Scrivere domande e messaggi"
              descrizione="Apre una richiesta scritta e risponde nei messaggi."
              acceso={portale.scrivereMessaggi && app.moduli.richieste}
              disabled={!app.moduli.richieste}
              onChange={(v) => void salvaPortale({ scrivereMessaggi: v })}
            />
          </div>
        )}
      </Card>

      <Card
        title="Accessi dell'azienda"
        actions={
          <Button variant="primary" className="px-3 py-1 text-xs" onClick={() => setDialogo({ tipo: 'nuovo-accesso' })}>
            + Nuovo accesso
          </Button>
        }
      >
        {accessi.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-400">
            Nessun accesso: senza, l&apos;azienda non può entrare a vedere i suoi numeri né mandare documenti.
          </p>
        ) : (
          <div className="divide-y divide-ink-800">
            {accessi.map((u) => (
              <div key={u.uuid} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-100">
                    {u.full_name}
                    {!u.active && (
                      <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">disattivato</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-400">
                    {u.username}
                    {u.phone ? ` · ${u.phone}` : ' · nessun telefono'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="px-2.5 py-1 text-xs" onClick={() => setDialogo({ tipo: 'modifica', utente: u })}>
                    Modifica
                  </Button>
                  <Button className="px-2.5 py-1 text-xs" onClick={() => setDialogo({ tipo: 'password', utente: u })}>
                    Nuova password
                  </Button>
                  <Button className="px-2.5 py-1 text-xs" onClick={() => void attiva(u)}>
                    {u.active ? 'Disattiva' : 'Riattiva'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {dialogo?.tipo === 'nuovo-accesso' && (
        <NewCompanyUserModal
          company={company}
          onClose={() => setDialogo(null)}
          onCreated={(username) => {
            setDialogo(null)
            void caricaAccessi()
            mostra('success', `Accesso "${username}" creato.`)
          }}
        />
      )}
      {dialogo?.tipo === 'modifica' && (
        <ModificaUtente
          utente={dialogo.utente}
          onClose={() => setDialogo(null)}
          onSalvato={() => {
            setDialogo(null)
            void caricaAccessi()
          }}
        />
      )}
      {dialogo?.tipo === 'password' && <NuovaPassword utente={dialogo.utente} onClose={() => setDialogo(null)} />}
    </div>
  )
}
