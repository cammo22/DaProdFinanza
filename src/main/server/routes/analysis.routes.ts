import { Router, type Request } from 'express'
import type { Scheme } from '@shared/engine'
import type { Scenario } from '@shared/types'
import { analyse, listPeriods, series } from '../services/analysis.service'
import {
  applyChartOfAccounts,
  previewChartOfAccounts,
  type PreviewChoices,
  writeChartOfAccountsTemplate
} from '../services/import.service'
import { requireAuth, requireRole } from '../middleware/auth'
import { vistaAzienda } from '../middleware/portal'
import { HttpError } from '../http-error'

/**
 * Periodi, analisi e import di una singola azienda.
 *
 * L'operatore Azienda può leggere i propri numeri (§4) ma non importare il
 * piano dei conti: quello resta al Consulente.
 */
export const analysisRouter: Router = Router({ mergeParams: true })

analysisRouter.use(requireAuth)

function param(req: Request, name: string): string {
  const value = req.params[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** Un'azienda è leggibile dal Consulente, o dal proprio operatore soltanto. */
function assertCanRead(req: Request): string {
  const companyUuid = param(req, 'uuid')
  if (req.auth!.role === 'company' && req.auth!.company_uuid !== companyUuid) {
    throw new HttpError(403, 'Operazione non consentita per questo ruolo.')
  }
  return companyUuid
}

/**
 * Periodi e analisi servono a tutte le viste sui bilanci: per l'operatore
 * Azienda basta che il consulente gliene abbia accesa una (§10.12).
 */
const bilanci = vistaAzienda(
  'panoramica',
  'conto-economico',
  'stato-patrimoniale',
  'capitale-circolante',
  'simulazioni'
)

analysisRouter.get('/periods', bilanci, (req, res) => {
  res.json(listPeriods(assertCanRead(req)))
})

analysisRouter.get('/series', bilanci, (req, res) => {
  res.json(series(assertCanRead(req), { scenario: (req.query.scenario as Scenario) ?? undefined }))
})

analysisRouter.get('/periods/:periodUuid/analysis', bilanci, (req, res) => {
  const companyUuid = assertCanRead(req)
  res.json(
    analyse(companyUuid, param(req, 'periodUuid'), {
      scenario: (req.query.scenario as Scenario) ?? undefined,
      scheme: (req.query.scheme as Scheme) ?? undefined
    })
  )
})

/** Foglio, colonna valore e sezioni abbinate a mano, come arrivano dal modulo. */
function previewChoices(body: unknown): PreviewChoices {
  const b = (body ?? {}) as Record<string, unknown>
  const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
  const sectionMap: Record<string, string> = {}
  if (b.sectionMap && typeof b.sectionMap === 'object') {
    for (const [label, code] of Object.entries(b.sectionMap as Record<string, unknown>)) {
      if (typeof code === 'string' && code) sectionMap[label] = code
    }
  }
  return { valueColumn: text(b.valueColumn), sheet: text(b.sheet), sectionMap }
}

/** Anteprima: legge il file e non scrive nulla (§11.1). */
analysisRouter.post('/import/chart-of-accounts/preview', requireRole('consultant'), async (req, res) => {
  const { filePath } = req.body ?? {}
  if (!filePath) throw new HttpError(400, 'Manca il percorso del file da importare.')
  res.json(await previewChartOfAccounts(param(req, 'uuid'), filePath, previewChoices(req.body)))
})

/** Scrittura: solo dopo che il consulente ha visto l'anteprima. */
analysisRouter.post('/import/chart-of-accounts', requireRole('consultant'), async (req, res) => {
  const { filePath, year, month, scenario, overwrite } = req.body ?? {}
  if (!filePath) throw new HttpError(400, 'Manca il percorso del file da importare.')
  if (!Number.isInteger(year)) throw new HttpError(400, "Indicare l'anno del periodo da importare.")

  res.status(201).json(
    await applyChartOfAccounts(param(req, 'uuid'), filePath, {
      ...previewChoices(req.body),
      year,
      month: month ?? null,
      scenario,
      overwrite: overwrite === true
    })
  )
})

/** Modello Excel da compilare, salvato dove il consulente ha scelto. */
analysisRouter.post('/import/chart-of-accounts/template', requireRole('consultant'), async (req, res) => {
  const { filePath } = req.body ?? {}
  if (!filePath) throw new HttpError(400, 'Manca il percorso dove salvare il modello.')
  res.status(201).json(await writeChartOfAccountsTemplate(param(req, 'uuid'), filePath))
})
