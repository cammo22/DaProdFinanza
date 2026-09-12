import type { AccountSection } from '@shared/types'
import { getDatabase } from '../../db'

/**
 * Catalogo delle sezioni di riclassificazione — docs/MODELLO_FINANZIARIO.md §2.
 * È dato di riferimento in sola lettura: cambiarlo significa cambiare la
 * metodologia, e passa da una nuova migrazione, non da una schermata.
 */
export function listSections(): AccountSection[] {
  const db = getDatabase()

  const sections = db
    .prepare('SELECT * FROM account_sections ORDER BY sort_order')
    .all() as Omit<AccountSection, 'tags' | 'detail_tags'>[]

  const tags = db.prepare('SELECT section_code, tag FROM section_tags').all() as {
    section_code: string
    tag: string
  }[]

  const detailTags = db
    .prepare('SELECT section_code, tag FROM section_detail_tags ORDER BY sort_order')
    .all() as { section_code: string; tag: string }[]

  return sections.map((section) => ({
    ...section,
    tags: tags.filter((t) => t.section_code === section.code).map((t) => t.tag),
    detail_tags: detailTags.filter((t) => t.section_code === section.code).map((t) => t.tag)
  }))
}
