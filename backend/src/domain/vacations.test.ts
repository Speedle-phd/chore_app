import { describe, expect, it } from 'vitest'
import { awayOn, vacationConflict } from './vacations'

describe('awayOn', () => {
   const vacations = [
      { memberIds: ['ada'], start: '2026-11-20', end: '2026-11-23' },
      { memberIds: ['ben', 'kid'], start: '2026-11-22', end: '2026-11-24' },
   ]
   it.each([
      ['2026-11-19', []],
      ['2026-11-20', ['ada']],
      ['2026-11-22', ['ada', 'ben', 'kid']],
      ['2026-11-23', ['ben', 'kid']],
      ['2026-11-24', []],
   ])('%s → %j', (date, expected) => {
      expect([...awayOn(vacations, date)].sort()).toEqual(expected)
   })
})

describe('vacationConflict', () => {
   const household = ['ada', 'ben', 'kid', 'dan']
   const noLoad = new Map<string, number>()
   const away = (...ids: string[]) => new Set(ids)

   it('no conflict when nobody assigned is away, or nobody is assigned', () => {
      expect(vacationConflict({ mode: 'anyone', assignees: ['ada'], pool: ['ada'] }, away('ben'), household, noLoad)).toBeNull()
      expect(vacationConflict({ mode: 'anyone', assignees: [], pool: [] }, away('ada'), household, noLoad)).toBeNull()
   })

   it('"any one of them": fine while someone assigned is here', () => {
      expect(vacationConflict({ mode: 'anyone', assignees: ['ada', 'ben'], pool: ['ada', 'ben'] }, away('ada'), household, noLoad)).toBeNull()
   })

   it('rotation: the next free person of the chore takes it, fewest assignments first', () => {
      const load = new Map([['ben', 3], ['kid', 1]])
      expect(
         vacationConflict({ mode: 'anyone', assignees: ['ada'], pool: ['ada', 'ben', 'kid'] }, away('ada'), household, load),
      ).toEqual({ away: ['ada'], suggestion: ['kid'] })
   })

   it('ties keep the chore’s order', () => {
      expect(
         vacationConflict({ mode: 'anyone', assignees: ['ada'], pool: ['ada', 'ben', 'kid'] }, away('ada'), household, noLoad),
      ).toEqual({ away: ['ada'], suggestion: ['ben'] })
   })

   it('falls back to anyone in the household when the whole chore team is away', () => {
      const load = new Map([['kid', 2], ['dan', 0]])
      expect(
         vacationConflict({ mode: 'anyone', assignees: ['ada', 'ben'], pool: ['ada', 'ben'] }, away('ada', 'ben'), household, load),
      ).toEqual({ away: ['ada', 'ben'], suggestion: ['dan'] })
   })

   it('"each of them": the away person’s part is dropped', () => {
      expect(
         vacationConflict({ mode: 'everyone', assignees: ['ada', 'kid'], pool: ['ada', 'kid'] }, away('kid'), household, noLoad),
      ).toEqual({ away: ['kid'], suggestion: ['ada'] })
   })

   it('no suggestion when everyone is away', () => {
      expect(
         vacationConflict({ mode: 'anyone', assignees: ['ada'], pool: ['ada'] }, away(...household), household, noLoad),
      ).toEqual({ away: ['ada'], suggestion: null })
   })
})
