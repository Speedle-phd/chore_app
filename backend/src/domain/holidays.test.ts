import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import { HOLIDAYS, STATE_CODES, STATES } from './holidayCatalog.de'
import { bussUndBettag, easterSunday, holidaysBetween, holidaysInYear } from './holidays'

const dates = (state: Parameters<typeof holidaysInYear>[0], year: number) =>
   holidaysInYear(state, year).map((h) => `${h.date} ${h.id}${h.partial ? ' (partial)' : ''}`)

describe('Easter Sunday (published Easter tables, e.g. PTB Osterdatum)', () => {
   it.each([
      [2000, '2000-04-23'],
      [2008, '2008-03-23'],
      [2011, '2011-04-24'],
      [2019, '2019-04-21'],
      [2024, '2024-03-31'],
      [2025, '2025-04-20'],
      [2026, '2026-04-05'],
      [2027, '2027-03-28'],
      [2038, '2038-04-25'],
   ])('%i → %s', (year, expected) => {
      expect(easterSunday(year).toString()).toBe(expected)
   })
})

describe('Buß- und Bettag (Wednesday before 23 November)', () => {
   it.each([
      [2022, '2022-11-16'],
      [2023, '2023-11-22'],
      [2024, '2024-11-20'],
      [2025, '2025-11-19'],
      [2026, '2026-11-18'],
   ])('%i → %s', (year, expected) => {
      expect(bussUndBettag(year).toString()).toBe(expected)
   })
})

describe('Holidays per state (de.wikipedia.org/wiki/Feiertag_(Deutschland), state Feiertagsgesetze)', () => {
   it('Bayern 2026: 13 days incl. Mariä Himmelfahrt only in parts', () => {
      expect(dates('BY', 2026)).toEqual([
         '2026-01-01 neujahr',
         '2026-01-06 heilige-drei-koenige',
         '2026-04-03 karfreitag',
         '2026-04-06 ostermontag',
         '2026-05-01 tag-der-arbeit',
         '2026-05-14 christi-himmelfahrt',
         '2026-05-25 pfingstmontag',
         '2026-06-04 fronleichnam',
         '2026-08-15 mariae-himmelfahrt (partial)',
         '2026-10-03 tag-der-deutschen-einheit',
         '2026-11-01 allerheiligen',
         '2026-12-25 weihnachten-1',
         '2026-12-26 weihnachten-2',
      ])
   })

   it('Sachsen 2025: Reformationstag, Buß- und Bettag, Fronleichnam only in parts', () => {
      expect(dates('SN', 2025)).toEqual([
         '2025-01-01 neujahr',
         '2025-04-18 karfreitag',
         '2025-04-21 ostermontag',
         '2025-05-01 tag-der-arbeit',
         '2025-05-29 christi-himmelfahrt',
         '2025-06-09 pfingstmontag',
         '2025-06-19 fronleichnam (partial)',
         '2025-10-03 tag-der-deutschen-einheit',
         '2025-10-31 reformationstag',
         '2025-11-19 buss-und-bettag',
         '2025-12-25 weihnachten-1',
         '2025-12-26 weihnachten-2',
      ])
   })

   it('Berlin 2025: Frauentag and the one-off 8 May', () => {
      expect(dates('BE', 2025)).toEqual([
         '2025-01-01 neujahr',
         '2025-03-08 frauentag',
         '2025-04-18 karfreitag',
         '2025-04-21 ostermontag',
         '2025-05-01 tag-der-arbeit',
         '2025-05-08 tag-der-befreiung',
         '2025-05-29 christi-himmelfahrt',
         '2025-06-09 pfingstmontag',
         '2025-10-03 tag-der-deutschen-einheit',
         '2025-12-25 weihnachten-1',
         '2025-12-26 weihnachten-2',
      ])
   })

   it('Brandenburg 2026: Ostersonntag and Pfingstsonntag (FTG § 2 Abs. 1)', () => {
      const ids = holidaysInYear('BB', 2026).map((h) => h.id)
      expect(ids).toContain('ostersonntag')
      expect(ids).toContain('pfingstsonntag')
      expect(holidaysInYear('BB', 2026).find((h) => h.id === 'pfingstsonntag')?.date).toBe('2026-05-24')
      expect(holidaysInYear('BB', 2026)).toHaveLength(12)
   })

   it('Saarland 2026: Mariä Himmelfahrt everywhere', () => {
      expect(holidaysInYear('SL', 2026).find((h) => h.id === 'mariae-himmelfahrt')).toMatchObject({ date: '2026-08-15', partial: false })
   })

   it('Thüringen: Weltkindertag since 2019, Fronleichnam only in parts', () => {
      expect(holidaysInYear('TH', 2018).map((h) => h.id)).not.toContain('weltkindertag')
      expect(holidaysInYear('TH', 2019).find((h) => h.id === 'weltkindertag')?.date).toBe('2019-09-20')
      expect(holidaysInYear('TH', 2026).find((h) => h.id === 'fronleichnam')?.partial).toBe(true)
   })

   it('Mecklenburg-Vorpommern: Frauentag since 2023', () => {
      expect(holidaysInYear('MV', 2022).map((h) => h.id)).not.toContain('frauentag')
      expect(holidaysInYear('MV', 2023).map((h) => h.id)).toContain('frauentag')
   })

   it('Reformationstag: nationwide once in 2017; HB/HH/NI/SH since 2018; never in Bayern otherwise', () => {
      for (const state of STATE_CODES) expect(holidaysInYear(state, 2017).map((h) => h.id)).toContain('reformationstag')
      expect(holidaysInYear('NI', 2018).map((h) => h.id)).toContain('reformationstag')
      expect(holidaysInYear('BY', 2018).map((h) => h.id)).not.toContain('reformationstag')
      // Listed once even where two rows apply.
      expect(holidaysInYear('SN', 2017).filter((h) => h.id === 'reformationstag')).toHaveLength(1)
   })

   it('Berlin one-offs only in their years (8 May 2020/2025, 17 June 2028)', () => {
      expect(holidaysInYear('BE', 2020).map((h) => h.date)).toContain('2020-05-08')
      expect(holidaysInYear('BE', 2026).map((h) => h.id)).not.toContain('tag-der-befreiung')
      expect(holidaysInYear('BE', 2028).find((h) => h.id === 'volksaufstand-1953')?.date).toBe('2028-06-17')
      expect(holidaysInYear('BB', 2028).map((h) => h.id)).not.toContain('volksaufstand-1953')
   })

   it('every state has the nine nationwide holidays', () => {
      const nationwide = ['neujahr', 'karfreitag', 'ostermontag', 'tag-der-arbeit', 'christi-himmelfahrt', 'pfingstmontag', 'tag-der-deutschen-einheit', 'weihnachten-1', 'weihnachten-2']
      for (const state of STATE_CODES) expect(holidaysInYear(state, 2026).map((h) => h.id)).toEqual(expect.arrayContaining(nationwide))
   })

   it('years before 1995 are not supported', () => {
      expect(holidaysInYear('SN', 1994)).toEqual([])
   })
})

describe('holidaysBetween', () => {
   it('covers a range across a year boundary, end exclusive', () => {
      expect(holidaysBetween('BW', '2025-12-26', '2026-01-06').map((h) => h.date)).toEqual(['2025-12-26', '2026-01-01'])
   })
})

describe('Catalog integrity', () => {
   it('only uses known states, valid rules and a source on every row', () => {
      for (const row of HOLIDAYS) {
         if (row.states !== 'all') for (const s of row.states) expect(STATES).toHaveProperty(s)
         for (const s of row.partialIn ?? []) expect(STATES).toHaveProperty(s)
         expect(row.source.length).toBeGreaterThan(0)
         const rule = row.rule
         if (rule.type === 'fixed') {
            expect(() => Temporal.PlainDate.from({ year: 2024, month: rule.month, day: rule.day }, { overflow: 'reject' })).not.toThrow()
         }
      }
   })
})
