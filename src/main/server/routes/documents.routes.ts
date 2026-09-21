import express, { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { permessoAzienda } from '../middleware/portal'
import {
  deleteDocument,
  documentContent,
  documentPath,
  intestazione,
  listDocuments,
  updateDocument,
  uploadDocument
} from '../services/documents.service'
import { attore, param } from './attore'

/**
 * Il cassetto documenti di un'azienda — AGENTS.md §10.13.
 *
 * Il file viaggia così com'è (`application/octet-stream`), non in JSON: nome,
 * categoria e il resto stanno nelle intestazioni `x-*`, codificate perché un
 * nome può avere accenti e spazi.
 */
export const documentsRouter: Router = Router({ mergeParams: true })

documentsRouter.use(requireAuth)

const lettura = permessoAzienda('documenti', 'Il cassetto documenti non è attivo.')
const invio = permessoAzienda('inviareDocumenti', 'Il consulente non ha abilitato l’invio di documenti.')

documentsRouter.get('/documents', lettura, (req, res) => {
  const requestUuid = typeof req.query.request === 'string' ? req.query.request : undefined
  res.json(listDocuments(param(req, 'uuid'), { role: req.auth!.role, requestUuid }))
})

documentsRouter.post(
  '/documents',
  invio,
  express.raw({ type: 'application/octet-stream', limit: '60mb' }),
  async (req, res) => {
    const doc = await uploadDocument(
      param(req, 'uuid'),
      req.body as Uint8Array,
      {
        name: intestazione(req.header('x-file-name')),
        mime: intestazione(req.header('x-file-type')),
        category: intestazione(req.header('x-category')),
        shared: req.header('x-shared') !== '0',
        note: intestazione(req.header('x-note')),
        requestUuid: intestazione(req.header('x-request'))
      },
      attore(req)
    )
    res.status(201).json(doc)
  }
)

documentsRouter.get('/documents/:id/content', lettura, async (req, res) => {
  const { doc, bytes } = await documentContent(param(req, 'uuid'), param(req, 'id'), attore(req))
  res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`)
  res.type(doc.mime || 'application/octet-stream').send(bytes)
})

documentsRouter.get('/documents/:id/path', lettura, async (req, res) => {
  res.json(await documentPath(param(req, 'uuid'), param(req, 'id'), attore(req)))
})

documentsRouter.put('/documents/:id', lettura, (req, res) => {
  res.json(updateDocument(param(req, 'uuid'), param(req, 'id'), req.body ?? {}, attore(req)))
})

documentsRouter.delete('/documents/:id', lettura, (req, res) => {
  res.json(deleteDocument(param(req, 'uuid'), param(req, 'id'), attore(req)))
})
