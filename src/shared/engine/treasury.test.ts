import { describe, expect, it } from 'vitest'
import {
  addMonths,
  cashToday,
  dueDate,
  expandFlows,
  forecast,
  receivablesAging,
  type OpeningCash,
  type TreasuryItemInput
} from './treasury'
import { movingAverage, workingCapitalNotes, type WorkingCapitalSnapshot } from './working-capital'

/**
 * Previsione di cassa: numeri tondi, date scelte a mano, attese verificabili a
 * mente. "Oggi" è fisso, così i test non dipendono dal giorno in cui girano.
 */

const OGGI = '2026-09-16'

const APERTURA: OpeningCash = {
  cents: 10_000_00,
  date: '2026-08-31',
  origin: 'bilancio',
  label: 'bilancio di Agosto 2026'
}

function riga(extra: Partial<TreasuryItemInput>): TreasuryItemInput {
  return {
    uuid: Math.random().toString(36).slice(2),
    direction: 'in',
    source: 'scadenziario',
    category: 'Clienti',
    description: 'prova',
    due_date: OGGI,
    amount_cents: 0,
    paid_cents: 0,
    paid_date: null,
    recurrence: 'none',
    recurrence_until: null,
    ...extra
  }
}

describe('date e condizioni di pagamento', () => {
  it('DF somma i giorni, FM li porta a fine mese, RD resta alla data', () => {
    expect(dueDate('2026-01-15', 'DF', 30)).toBe('2026-02-14')
    expect(dueDate('2026-01-15', 'FM', 30)).toBe('2026-02-28')
    expect(dueDate('2026-01-15', 'RD', 0)).toBe('2026-01-15')
    expect(dueDate('2026-12-20', 'FM', 60)).toBe('2027-02-28')
  })

  it('una ricorrenza al 31 cade sull\'ultimo giorno dei mesi corti', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
  })
})

describe('movimenti attesi', () => {
  it('una scadenza passata e aperta entra oggi, marcata scaduta, per il solo residuo', () => {
    const flows = expandFlows(
      [riga({ due_date: '2026-07-01', amount_cents: 1_000_00, paid_cents: 400_00 })],
      OGGI,
      '2026-12-31'
    )
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ date: OGGI, cents: 600_00, overdue: true, overdueDays: 77 })
  })

  it('una previsione manuale passata non si trascina a oggi', () => {
    const flows = expandFlows(
      [riga({ source: 'manuale', due_date: '2026-09-01', amount_cents: 500_00 })],
      OGGI,
      '2026-12-31'
    )
    expect(flows).toEqual([])
  })

  it('una scadenza saldata non genera movimenti', () => {
    const flows = expandFlows(
      [riga({ due_date: '2026-10-01', amount_cents: 500_00, paid_cents: 500_00 })],
      OGGI,
      '2026-12-31'
    )
    expect(flows).toEqual([])
  })

  it('una ricorrenza mensile si espande solo fra oggi e il limite', () => {
    const flows = expandFlows(
      [
        riga({
          source: 'manuale',
          direction: 'out',
          category: 'Affitti',
          due_date: '2026-01-05',
          amount_cents: 2_000_00,
          recurrence: 'monthly',
          recurrence_until: '2026-11-30'
        })
      ],
      OGGI,
      '2026-12-31'
    )
    expect(flows.map((f) => f.date)).toEqual(['2026-10-05', '2026-11-05'])
  })
})

describe('liquidità e previsione', () => {
  const righe: TreasuryItemInput[] = [
    // Incassato dopo la data del saldo di partenza: entra nella liquidità di oggi.
    riga({ due_date: '2026-09-05', amount_cents: 3_000_00, paid_cents: 3_000_00, paid_date: '2026-09-05' }),
    // Pagato prima della data del saldo: è già dentro il bilancio, non si ricomputa.
    riga({ direction: 'out', due_date: '2026-08-20', amount_cents: 999_00, paid_cents: 999_00, paid_date: '2026-08-20' }),
    // Credito scaduto: entra oggi.
    riga({ due_date: '2026-06-30', amount_cents: 2_000_00 }),
    // Fattura fornitore fra 10 giorni.
    riga({ direction: 'out', category: 'Fornitori', due_date: '2026-09-26', amount_cents: 8_000_00 }),
    // Stipendi ricorrenti il 27.
    riga({
      source: 'manuale',
      direction: 'out',
      category: 'Personale',
      due_date: '2026-01-27',
      amount_cents: 5_000_00,
      recurrence: 'monthly'
    }),
    // Incasso fra 45 giorni.
    riga({ due_date: '2026-10-31', amount_cents: 20_000_00 })
  ]

  it('la liquidità di oggi somma solo i movimenti registrati dopo il saldo di partenza', () => {
    expect(cashToday(APERTURA, righe, OGGI)).toBe(13_000_00)
  })

  it('gli orizzonti sono cumulati e tornano a mano', () => {
    const f = forecast({ opening: APERTURA, items: righe, today: OGGI })
    const [g7, g30, g60] = f.horizons

    // 7 giorni: solo il credito scaduto.
    expect(g7).toMatchObject({ totaleEntrate: 2_000_00, totaleUscite: 0, liquiditaFinale: 15_000_00 })
    // 30 giorni: + fornitore 26/9 + stipendi 27/9.
    expect(g30).toMatchObject({ totaleEntrate: 2_000_00, totaleUscite: 13_000_00, liquiditaFinale: 2_000_00 })
    expect(g30!.uscite).toEqual({ Fornitori: 8_000_00, Personale: 5_000_00 })
    // 60 giorni: + stipendi 27/10 + incasso 31/10.
    expect(g60).toMatchObject({ totaleEntrate: 22_000_00, totaleUscite: 18_000_00, liquiditaFinale: 17_000_00 })

    expect(f.scaduti).toEqual({ entrate: 2_000_00, uscite: 0, righe: 1 })
  })

  it('segnala il primo giorno sotto la soglia minima', () => {
    const f = forecast({ opening: APERTURA, items: righe, today: OGGI, minLiquidityCents: 5_000_00 })
    // 26/9 il saldo scende a 7.000, 27/9 a 2.000: sotto i 5.000.
    expect(f.tensione).toEqual({ date: '2026-09-27', days: 11, liquidita: 2_000_00, soglia: 5_000_00 })
  })

  it('senza soglia, la tensione è il primo giorno sotto zero', () => {
    const f = forecast({ opening: APERTURA, items: righe, today: OGGI })
    // 27/10: secondo stipendio prima dell'incasso del 31/10.
    expect(f.tensione).toEqual({ date: '2026-10-27', days: 41, liquidita: -3_000_00, soglia: 0 })
  })

  it('l\'anzianità dei crediti conta solo le scadenze dello scadenziario', () => {
    expect(receivablesAging(righe, OGGI)).toEqual({ openCents: 22_000_00, overdueCents: 2_000_00 })
  })
})

describe('capitale circolante', () => {
  const base: WorkingCapitalSnapshot = {
    creditiCommerciali: 100_000_00,
    magazzino: 50_000_00,
    altriCrediti: 10_000_00,
    debitiFornitori: 80_000_00,
    altriDebitiCorrenti: 20_000_00,
    capitaleCircolanteNetto: 60_000_00,
    dso: 60,
    dio: 30,
    dpo: 45,
    ccc: 45
  }

  it('la media mobile resta indefinita finché non ha abbastanza storia', () => {
    expect(movingAverage([3, 6, 9, 12], 3)).toEqual([null, null, 6, 9])
    expect(movingAverage([3, null, 9, 12], 3)).toEqual([null, null, null, null])
  })

  it('le note scattano solo oltre le soglie, con il verso giusto', () => {
    const note = workingCapitalNotes({
      current: { ...base, dso: 68, dio: 27, ccc: 50, creditiCommerciali: 115_000_00 },
      previousYear: base
    })
    expect(note.map((n) => [n.subject, n.tone])).toEqual([
      ['dso', 'negative'],
      ['ccc', 'negative'],
      ['creditiCommerciali', 'neutral']
    ])
    expect(note[0]!.text).toBe('I clienti pagano mediamente 8 giorni più tardi rispetto allo scorso anno.')
  })

  it('senza anno precedente non inventa confronti', () => {
    expect(workingCapitalNotes({ current: base, previousYear: null })).toEqual([])
  })

  it('avvisa quando i crediti scaduti da oltre 60 giorni pesano', () => {
    const note = workingCapitalNotes({
      current: base,
      previousYear: null,
      receivablesOpenCents: 10_000_00,
      receivablesOverdue60Cents: 2_500_00
    })
    expect(note).toEqual([
      {
        subject: 'scaduti',
        tone: 'negative',
        text: 'Il 25% dei crediti aperti nello scadenziario è scaduto da oltre 60 giorni.'
      }
    ])
  })
})

describe('note del circolante: grammatica', () => {
  it('il verbo si accorda con la voce', () => {
    const base: WorkingCapitalSnapshot = {
      creditiCommerciali: 100_00,
      magazzino: 100_00,
      altriCrediti: 0,
      debitiFornitori: 0,
      altriDebitiCorrenti: 0,
      capitaleCircolanteNetto: 200_00,
      dso: null,
      dio: null,
      dpo: null,
      ccc: null
    }
    const testi = workingCapitalNotes({
      current: { ...base, creditiCommerciali: 150_00, magazzino: 50_00 },
      previousYear: base
    }).map((n) => n.text)
    expect(testi).toEqual([
      "Crediti commerciali in aumento del 50% sullo stesso periodo dell'anno scorso: assorbono più liquidità.",
      "Magazzino in calo del 50% sullo stesso periodo dell'anno scorso: libera liquidità."
    ])
  })
})
