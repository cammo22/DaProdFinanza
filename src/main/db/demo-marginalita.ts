import { saveMarginItem, saveMaterial } from '../server/services/marginalita.service'

/**
 * Ricette e ingredienti della Pizzeria DaProd (demo): il food cost delle
 * pizze, delle bibite e del tiramisù, con le vendite di un mese tipo per il
 * menu engineering. Prezzi d'acquisto verosimili, IVA esclusa; i prezzi in
 * carta sono con l'IVA al 10%.
 */

const INGREDIENTI: { nome: string; unita: string; euro: number; scarto?: number; categoria: string }[] = [
  { nome: 'Farina 00', unita: 'kg', euro: 1.1, categoria: 'Impasto' },
  { nome: 'Lievito di birra', unita: 'kg', euro: 4, categoria: 'Impasto' },
  { nome: 'Sale', unita: 'kg', euro: 0.6, categoria: 'Impasto' },
  { nome: 'Olio extravergine', unita: 'l', euro: 9, categoria: 'Condimenti' },
  { nome: 'Pomodoro pelato', unita: 'kg', euro: 2.2, categoria: 'Condimenti' },
  { nome: 'Aglio', unita: 'kg', euro: 6, scarto: 15, categoria: 'Condimenti' },
  { nome: 'Origano', unita: 'kg', euro: 18, categoria: 'Condimenti' },
  { nome: 'Basilico fresco', unita: 'kg', euro: 25, scarto: 20, categoria: 'Condimenti' },
  { nome: 'Mozzarella fior di latte', unita: 'kg', euro: 7.5, scarto: 5, categoria: 'Latticini' },
  { nome: 'Mozzarella di bufala', unita: 'kg', euro: 14, scarto: 8, categoria: 'Latticini' },
  { nome: 'Mascarpone', unita: 'kg', euro: 9, categoria: 'Latticini' },
  { nome: 'Salame piccante', unita: 'kg', euro: 16, categoria: 'Salumi' },
  { nome: 'Prosciutto cotto', unita: 'kg', euro: 14, categoria: 'Salumi' },
  { nome: 'Funghi champignon', unita: 'kg', euro: 5, scarto: 10, categoria: 'Verdure' },
  { nome: 'Carciofini sott’olio', unita: 'kg', euro: 9, categoria: 'Verdure' },
  { nome: 'Olive nere', unita: 'kg', euro: 8, categoria: 'Verdure' },
  { nome: 'Savoiardi', unita: 'kg', euro: 7, categoria: 'Dolci' },
  { nome: 'Caffè', unita: 'kg', euro: 18, categoria: 'Dolci' },
  { nome: 'Uova', unita: 'pz', euro: 0.25, categoria: 'Dolci' },
  { nome: 'Zucchero', unita: 'kg', euro: 1.2, categoria: 'Dolci' },
  { nome: 'Cacao amaro', unita: 'kg', euro: 12, categoria: 'Dolci' },
  { nome: 'Birra alla spina', unita: 'l', euro: 3.8, categoria: 'Bevande' },
  { nome: 'Coca-Cola lattina', unita: 'pz', euro: 0.45, categoria: 'Bevande' }
]

type Riga = [nome: string, quantita: number]

const IMPASTO: Riga[] = [
  ['Farina 00', 0.18],
  ['Lievito di birra', 0.002],
  ['Sale', 0.004],
  ['Olio extravergine', 0.005]
]
const BASE_ROSSA: Riga[] = [...IMPASTO, ['Pomodoro pelato', 0.08], ['Olio extravergine', 0.008]]
const MARGHERITA: Riga[] = [...BASE_ROSSA, ['Mozzarella fior di latte', 0.12], ['Basilico fresco', 0.003]]

const RICETTE: {
  nome: string
  categoria: string
  carta: number
  vendite: number
  righe: Riga[]
  ore: number
  resa?: number
}[] = [
  { nome: 'Margherita', categoria: 'Pizze', carta: 7, vendite: 1600, righe: MARGHERITA, ore: 0.07 },
  { nome: 'Marinara', categoria: 'Pizze', carta: 6, vendite: 250, righe: [...IMPASTO, ['Pomodoro pelato', 0.1], ['Aglio', 0.005], ['Origano', 0.002], ['Olio extravergine', 0.01]], ore: 0.06 },
  { nome: 'Diavola', categoria: 'Pizze', carta: 8.5, vendite: 800, righe: [...MARGHERITA, ['Salame piccante', 0.05]], ore: 0.07 },
  { nome: 'Prosciutto e funghi', categoria: 'Pizze', carta: 9, vendite: 600, righe: [...MARGHERITA, ['Prosciutto cotto', 0.06], ['Funghi champignon', 0.06]], ore: 0.08 },
  { nome: 'Bufala', categoria: 'Pizze', carta: 10, vendite: 450, righe: [...BASE_ROSSA, ['Mozzarella di bufala', 0.125], ['Basilico fresco', 0.003]], ore: 0.07 },
  { nome: 'Capricciosa', categoria: 'Pizze', carta: 9.5, vendite: 350, righe: [...MARGHERITA, ['Prosciutto cotto', 0.04], ['Funghi champignon', 0.04], ['Carciofini sott’olio', 0.03], ['Olive nere', 0.02]], ore: 0.09 },
  { nome: 'Tiramisù', categoria: 'Dolci', carta: 5, vendite: 300, resa: 8, righe: [['Mascarpone', 0.5], ['Savoiardi', 0.3], ['Caffè', 0.03], ['Uova', 4], ['Zucchero', 0.1], ['Cacao amaro', 0.02]], ore: 0.5 },
  { nome: 'Birra media alla spina', categoria: 'Bevande', carta: 5, vendite: 1400, righe: [['Birra alla spina', 0.4]], ore: 0.01 },
  { nome: 'Coca-Cola in lattina', categoria: 'Bevande', carta: 3, vendite: 1000, righe: [['Coca-Cola lattina', 1]], ore: 0 }
]

export function seedDemoMarginalita(companyUuid: string): void {
  const id = new Map<string, string>()
  for (const i of INGREDIENTI) {
    const m = saveMaterial(companyUuid, {
      name: i.nome,
      unit: i.unita,
      unit_cost_cents: Math.round(i.euro * 100),
      waste_pct: i.scarto ?? 0,
      category: i.categoria,
      supplier: null
    })
    id.set(i.nome, m.uuid)
  }
  for (const r of RICETTE) {
    saveMarginItem(companyUuid, {
      kind: 'ricetta',
      name: r.nome,
      category: r.categoria,
      // Prezzo in carta con l'IVA al 10%: si salva senza.
      price_cents: Math.round((r.carta * 100) / 1.1),
      vat_pct: 10,
      yield_qty: r.resa ?? 1,
      monthly_volume: r.vendite,
      overhead_pct: null,
      status: 'attiva',
      lines: [
        ...r.righe.map(([nome, quantita]) => ({
          phase: 'preventivo',
          kind: 'materiale',
          material_uuid: id.get(nome),
          qty: quantita
        })),
        ...(r.ore > 0 ? [{ phase: 'preventivo', kind: 'manodopera', description: 'Preparazione', qty: r.ore, unit: 'h' }] : [])
      ]
    })
  }
}
