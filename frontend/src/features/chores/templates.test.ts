import { describe, expect, it } from 'vitest'
import { fromRrule, repeatOf, toRrule } from '@/features/calendar/recurrence'
import { CHORE_TEMPLATE_GROUPS, type ChoreTemplate } from './choreTemplates'
import { describeTemplate, searchTemplates, templateRepeat, templateStart } from './templates'

const all = CHORE_TEMPLATE_GROUPS.flatMap((g) => g.templates)
const byId = (id: string) => all.find((t) => t.id === id) as ChoreTemplate

describe('chore templates (data)', () => {
   it('have unique ids and fit the chore form’s limits', () => {
      expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
      for (const t of all) {
         expect(t.title.length, t.id).toBeLessThanOrEqual(120)
         expect((t.notes ?? '').length, t.id).toBeLessThanOrEqual(2000)
         expect(t.effort, t.id).toBeGreaterThanOrEqual(1)
         expect(t.effort, t.id).toBeLessThanOrEqual(5)
         if (t.month !== undefined) expect(t.month >= 1 && t.month <= 12, t.id).toBe(true)
         // "Repeat after it's done" is 1–365 days on the server.
         if ('afterDays' in t.repeat) expect(t.repeat.afterDays >= 1 && t.repeat.afterDays <= 365, t.id).toBe(true)
         else expect(t.repeat.every, t.id).toBeGreaterThanOrEqual(1)
      }
   })

   it('round-trip through the repeat editor (never shown as “Custom repeat”)', () => {
      for (const t of all) {
         const repeat = templateRepeat(t, '2026-11-18')
         const after = 'afterDays' in t.repeat ? t.repeat.afterDays : null
         expect(repeatOf(toRrule(repeat, 'Europe/Berlin'), after, 'Europe/Berlin'), t.id).toEqual(repeat)
      }
   })
})

describe('templateRepeat', () => {
   it('maps fixed repeats to RRULEs and “after it’s done” to AFTER', () => {
      expect(toRrule(templateRepeat(byId('extractor-filter')), 'UTC')).toBe('FREQ=MONTHLY;INTERVAL=3')
      expect(toRrule(templateRepeat(byId('vacuum')), 'UTC')).toBe('FREQ=WEEKLY')
      expect(templateRepeat(byId('water-plants'))).toMatchObject({ freq: 'AFTER', interval: 3 })
      expect(toRrule(templateRepeat(byId('water-plants')), 'UTC')).toBeNull()
      expect(fromRrule('FREQ=YEARLY', 'UTC')).toEqual(templateRepeat(byId('smoke-detectors')))
   })
   it('ticks the start’s weekday for weekly templates, like picking weekly by hand', () => {
      // 18 Nov 2026 is a Wednesday.
      expect(templateRepeat(byId('vacuum'), '2026-11-18').byDay).toEqual(['WE'])
      expect(toRrule(templateRepeat(byId('sheets'), '2026-11-18T09:00'), 'UTC')).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')
      expect(templateRepeat(byId('litter-box'), '2026-11-18').byDay).toEqual([])
   })
})

describe('templateStart', () => {
   const october = byId('winter-tyres') // month 10
   it('uses the fallback for templates without a month', () => {
      expect(templateStart(byId('vacuum'), '2026-11-16', '2026-11-17')).toBe('2026-11-17')
   })
   it('starts today when we are in that month', () => {
      expect(templateStart(october, '2026-10-20', '2026-10-21')).toBe('2026-10-20')
   })
   it('starts on the 1st of that month later this year', () => {
      expect(templateStart(october, '2026-03-05', '2026-03-05')).toBe('2026-10-01')
   })
   it('starts next year once the month has passed', () => {
      expect(templateStart(october, '2026-11-16', '2026-11-16')).toBe('2027-10-01')
      expect(templateStart(byId('repot'), '2026-12-31', '2026-12-31')).toBe('2027-03-01')
   })
})

describe('describeTemplate', () => {
   it('reads like the repeat editor, with the month when there is one', () => {
      expect(describeTemplate(byId('extractor-filter'))).toBe('Every 3 months')
      expect(describeTemplate(byId('descale-kettle'))).toBe('30 days after it’s done')
      expect(describeTemplate(byId('litter-box'))).toBe('Every day')
      expect(describeTemplate(byId('summer-tyres'))).toBe('Every year, in April')
   })
})

describe('searchTemplates', () => {
   it('returns everything for an empty query', () => {
      expect(searchTemplates('  ')).toHaveLength(CHORE_TEMPLATE_GROUPS.length)
   })
   it('matches every word, case-insensitive, in the title or group name', () => {
      const ids = (q: string) => searchTemplates(q).flatMap((g) => g.templates.map((t) => t.id))
      expect(ids('TYRES')).toEqual(['winter-tyres', 'summer-tyres'])
      expect(ids('winter tyres')).toEqual(['winter-tyres'])
      expect(ids('pets')).toContain('litter-box') // group name
      expect(ids('descale')).toEqual(['descale-kettle', 'descale-coffee'])
      expect(searchTemplates('zebra')).toEqual([])
   })
})
