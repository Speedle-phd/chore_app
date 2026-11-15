import { describe, expect, it } from 'vitest'
import { plannedReminders, type Happening } from './reminders'

const oma: Happening = { key: 'oma_2026-12-03', kind: 'birthday', date: '2026-12-03', itemId: 'oma', memberId: null }
const ada: Happening = { key: 'ada_2026-12-10', kind: 'birthday', date: '2026-12-10', itemId: null, memberId: 'ada' }
const dentist: Happening = { key: 'dent_2026-12-04', kind: 'event', date: '2026-12-04', itemId: 'dent', memberId: null }
const all = [oma, ada, dentist]

describe('plannedReminders', () => {
   it('sends each lead time on its day, in order', () => {
      const result = plannedReminders([{ id: 's1', target: { type: 'item', itemId: 'oma' }, leadDays: [0, 7] }], all, '2026-11-20', '2026-12-31')
      expect(result.map((r) => [r.sendOn, r.leadDays, r.happening.key])).toEqual([
         ['2026-11-26', 7, 'oma_2026-12-03'],
         ['2026-12-03', 0, 'oma_2026-12-03'],
      ])
   })

   it('member birthdays match by member; "all birthdays" matches every birthday but not events', () => {
      const member = plannedReminders([{ id: 'm', target: { type: 'member', memberId: 'ada' }, leadDays: [1] }], all, '2026-12-01', '2026-12-31')
      expect(member.map((r) => r.sendOn)).toEqual(['2026-12-09'])
      const every = plannedReminders([{ id: 'a', target: { type: 'allBirthdays' }, leadDays: [0] }], all, '2026-12-01', '2026-12-31')
      expect(every.map((r) => r.happening.key)).toEqual(['oma_2026-12-03', 'ada_2026-12-10'])
   })

   it('sends once when two subscriptions cover the same birthday and lead time', () => {
      const result = plannedReminders(
         [
            { id: 'all', target: { type: 'allBirthdays' }, leadDays: [0] },
            { id: 'one', target: { type: 'item', itemId: 'oma' }, leadDays: [0, 1] },
         ],
         [oma],
         '2026-12-01',
         '2026-12-31',
      )
      expect(result.map((r) => [r.sendOn, r.subscriptionIds])).toEqual([
         ['2026-12-02', ['one']],
         ['2026-12-03', ['all', 'one']],
      ])
   })

   it('only reminders due inside [from, to)', () => {
      const result = plannedReminders([{ id: 's', target: { type: 'item', itemId: 'oma' }, leadDays: [0, 7] }], [oma], '2026-11-27', '2026-12-03')
      expect(result).toEqual([])
   })
})
