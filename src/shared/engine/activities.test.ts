import { describe, expect, it } from 'vitest'
import {
  dataLocale,
  durata,
  lunedi,
  minutiFra,
  minutiVoce,
  riepilogoAttivita,
  scaduta,
  valoreCents,
  type TaskLike,
  type TimeEntryLike
} from './activities'

// Giovedì 18 settembre 2026, ore 15:00 locali.
const ORA = new Date(2026, 8, 18, 15, 0, 0)

const voce = (over: Partial<TimeEntryLike>): TimeEntryLike => ({
  task_uuid: null,
  work_date: '2026-09-18',
  started_at: null,
  ended_at: null,
  minutes: 60,
  billable: 1,
  ...over
})

const task = (over: Partial<TaskLike>): TaskLike => ({
  uuid: 't1',
  status: 'todo',
  due_date: null,
  estimate_minutes: null,
  ...over
})

describe('date e durate', () => {
  it('il lunedì della settimana, anche di domenica', () => {
    expect(dataLocale(lunedi(ORA))).toBe('2026-09-14')
    expect(dataLocale(lunedi(new Date(2026, 8, 20)))).toBe('2026-09-14')
    expect(dataLocale(lunedi(new Date(2026, 8, 21)))).toBe('2026-09-21')
  })

  it('durata leggibile', () => {
    expect(durata(0)).toBe('0 min')
    expect(durata(45)).toBe('45 min')
    expect(durata(125)).toBe('2 h 05')
  })

  it('minuti fra due istanti, mai negativi', () => {
    expect(minutiFra('2026-09-18T10:00:00.000Z', '2026-09-18T11:29:40.000Z')).toBe(90)
    expect(minutiFra('2026-09-18T11:00:00.000Z', '2026-09-18T10:00:00.000Z')).toBe(0)
  })

  it('valore alla tariffa oraria, in centesimi', () => {
    // 1 h 30 a 80 €/h = 120 €
    expect(valoreCents(90, 8000)).toBe(12000)
    // 20 minuti a 70 €/h = 23,33 €
    expect(valoreCents(20, 7000)).toBe(2333)
  })
})

describe('minutiVoce', () => {
  it('una voce chiusa conta i suoi minuti', () => {
    expect(
      minutiVoce(
        voce({ started_at: '2026-09-18T08:00:00Z', ended_at: '2026-09-18T09:00:00Z', minutes: 60 }),
        ORA
      )
    ).toBe(60)
  })

  it('un timer acceso conta fino a adesso', () => {
    const inizio = new Date(ORA.getTime() - 25 * 60000).toISOString()
    expect(minutiVoce(voce({ started_at: inizio, minutes: null }), ORA)).toBe(25)
  })

  it('una voce a mano ha solo i minuti', () => {
    expect(minutiVoce(voce({ minutes: 40 }), ORA)).toBe(40)
  })
})

describe('riepilogoAttivita', () => {
  it('settimana, mese, fatturabile e valore', () => {
    const r = riepilogoAttivita(
      [],
      [
        voce({ work_date: '2026-09-18', minutes: 60 }),
        voce({ work_date: '2026-09-15', minutes: 30, billable: 0 }),
        // settimana prima, stesso mese
        voce({ work_date: '2026-09-08', minutes: 120 }),
        // mese prima
        voce({ work_date: '2026-08-28', minutes: 90 })
      ],
      6000,
      ORA
    )
    expect(r.settimanaMinuti).toBe(90)
    expect(r.meseMinuti).toBe(210)
    expect(r.meseFatturabiliMinuti).toBe(180)
    expect(r.meseValoreCents).toBe(18000)
  })

  it('senza tariffa il valore non si inventa', () => {
    expect(riepilogoAttivita([], [voce({})], null, ORA).meseValoreCents).toBeNull()
  })

  it('le settimane vanno dalla più vecchia alla corrente', () => {
    const r = riepilogoAttivita(
      [],
      [voce({ work_date: '2026-09-18', minutes: 60 }), voce({ work_date: '2026-08-25', minutes: 30 })],
      null,
      ORA,
      4
    )
    expect(r.settimane.map((s) => s.inizio)).toEqual([
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14'
    ])
    expect(r.settimane[0].minuti).toBe(30)
    expect(r.settimane[3].minuti).toBe(60)
  })

  it('minuti per attività, e attività aperte e scadute', () => {
    const r = riepilogoAttivita(
      [
        task({ uuid: 'a', due_date: '2026-09-10' }),
        task({ uuid: 'b', status: 'done', due_date: '2026-09-01' }),
        task({ uuid: 'c', status: 'in_progress', due_date: '2026-09-30' })
      ],
      [voce({ task_uuid: 'a', minutes: 30 }), voce({ task_uuid: 'a', minutes: 15 })],
      null,
      ORA
    )
    expect(r.perAttivita['a']).toBe(45)
    expect(r.aperte).toBe(2)
    expect(r.scadute).toBe(1)
  })

  it('una scadenza di oggi non è ancora scaduta', () => {
    expect(scaduta(task({ due_date: '2026-09-18' }), '2026-09-18')).toBe(false)
    expect(scaduta(task({ due_date: '2026-09-17' }), '2026-09-18')).toBe(true)
  })
})
