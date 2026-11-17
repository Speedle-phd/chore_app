import { describe, expect, it } from 'vitest'
import { amountFor, itemsForNewTraveller, itemsFromTemplate, MAX_AMOUNT, PACKING_SECTIONS, progress, shoppingLines, templateFromList, tripDays, type TemplateItem } from './packing'
import { STARTER_TEMPLATES } from './packingStarters'

const t = (text: string, over: Partial<TemplateItem> = {}): TemplateItem => ({
   text,
   section: 'toiletries',
   perPerson: false,
   amount: null,
   perDay: false,
   maxAmount: null,
   ...over,
})

describe('amountFor', () => {
   it.each([
      ['no amount', t('ID card'), 4, null],
      ['fixed amount ignores the days', t('Swimwear', { amount: 2 }), 14, 2],
      ['per day × days', t('Socks', { amount: 1, perDay: true }), 4, 4],
      ['per day, capped', t('Socks', { amount: 1, perDay: true, maxAmount: 7 }), 14, 7],
      ['half per day rounds up', t('Shorts', { amount: 0.5, perDay: true }), 5, 3],
      ['per day without a trip length: none', t('Socks', { amount: 1, perDay: true }), null, null],
      ['never above the maximum amount', t('Wipes', { amount: 5, perDay: true }), 100, MAX_AMOUNT],
   ] as const)('%s', (_name, item, days, expected) => {
      expect(amountFor(item, days)).toBe(expected)
   })
})

describe('tripDays (all-day dates, end exclusive)', () => {
   it('counts the days', () => {
      expect(tripDays('2026-12-10', '2026-12-14')).toBe(4)
      expect(tripDays('2026-03-28', '2026-03-30')).toBe(2) // across the DST change
      expect(tripDays('2026-12-10', '2026-12-10')).toBeNull()
   })
})

describe('itemsFromTemplate', () => {
   const template = [t('Toothbrush', { perPerson: true }), t('Sunscreen'), t('Socks', { perPerson: true, section: 'clothes', amount: 1, perDay: true })]

   it('copies per-person items once per traveller, shared items once, with amounts for the trip', () => {
      expect(itemsFromTemplate(template, ['ann', 'ben'], 3)).toEqual([
         { text: 'Toothbrush', section: 'toiletries', memberId: 'ann', quantity: null },
         { text: 'Toothbrush', section: 'toiletries', memberId: 'ben', quantity: null },
         { text: 'Sunscreen', section: 'toiletries', memberId: null, quantity: null },
         { text: 'Socks', section: 'clothes', memberId: 'ann', quantity: 3 },
         { text: 'Socks', section: 'clothes', memberId: 'ben', quantity: 3 },
      ])
   })

   it('without travellers, per-person items become shared', () => {
      expect(itemsFromTemplate(template, [], null).map((i) => [i.text, i.memberId, i.quantity])).toEqual([
         ['Toothbrush', null, null],
         ['Sunscreen', null, null],
         ['Socks', null, null],
      ])
   })
})

describe('progress', () => {
   it('counts packed items overall and per person', () => {
      const p = progress([
         { memberId: 'ann', checked: true },
         { memberId: 'ann', checked: false },
         { memberId: null, checked: true },
      ])
      expect(p.overall).toEqual({ done: 2, total: 3 })
      expect(p.byMember.get('ann')).toEqual({ done: 1, total: 2 })
      expect(p.byMember.get(null)).toEqual({ done: 1, total: 1 })
   })

   it('is zero for an empty list', () => {
      expect(progress([]).overall).toEqual({ done: 0, total: 0 })
   })
})

describe('templateFromList', () => {
   it('keeps each text once per section, per person if anyone had it, the largest amount as fixed', () => {
      expect(
         templateFromList([
            { text: 'Toothbrush', section: 'toiletries', memberId: 'ann', quantity: null },
            { text: 'toothbrush ', section: 'toiletries', memberId: 'ben', quantity: null },
            { text: 'Socks', section: 'clothes', memberId: 'ann', quantity: 3 },
            { text: 'Socks', section: 'clothes', memberId: 'ben', quantity: 5 },
            { text: 'Towel', section: 'gear', memberId: null, quantity: null },
         ]),
      ).toEqual([
         t('Toothbrush', { perPerson: true }),
         t('Socks', { section: 'clothes', perPerson: true, amount: 5 }),
         t('Towel', { section: 'gear' }),
      ])
   })

   it('round-trips a template without per-day amounts', () => {
      const template = [t('Passport', { section: 'documents', perPerson: true }), t('Swimwear', { section: 'clothes', perPerson: true, amount: 2 }), t('Sunscreen')]
      expect(templateFromList(itemsFromTemplate(template, ['ann', 'ben'], 7))).toEqual(template)
   })
})

describe('itemsForNewTraveller', () => {
   it('gives each personal text once with the largest amount; shared items stay out', () => {
      expect(
         itemsForNewTraveller(
            [
               { text: 'Socks', section: 'clothes', memberId: 'ann', quantity: 3 },
               { text: 'Socks', section: 'clothes', memberId: 'ben', quantity: 4 },
               { text: 'Toothbrush', section: 'toiletries', memberId: 'ann', quantity: null },
               { text: 'Sunscreen', section: 'toiletries', memberId: null, quantity: null },
            ],
            'cara',
         ),
      ).toEqual([
         { text: 'Socks', section: 'clothes', memberId: 'cara', quantity: 4 },
         { text: 'Toothbrush', section: 'toiletries', memberId: 'cara', quantity: null },
      ])
   })

   it('is empty when nobody has personal items', () => {
      expect(itemsForNewTraveller([{ text: 'Map', section: 'gear', memberId: null, quantity: null }], 'cara')).toEqual([])
   })
})

describe('shoppingLines', () => {
   it('adds up amounts of unpacked items; no amount counts as one', () => {
      expect(
         shoppingLines([
            { text: 'Toothbrush', checked: false, quantity: null },
            { text: 'toothbrush', checked: false, quantity: null },
            { text: 'Socks', checked: false, quantity: 4 },
            { text: 'Socks', checked: false, quantity: 4 },
            { text: 'Sunscreen', checked: true, quantity: null },
         ]),
      ).toEqual([
         { name: 'Toothbrush', count: 2 },
         { name: 'Socks', count: 8 },
      ])
   })
})

describe('starter templates', () => {
   it('use known sections, valid amounts and no duplicate texts per section', () => {
      for (const template of STARTER_TEMPLATES) {
         for (const item of template.items) {
            expect(PACKING_SECTIONS).toContain(item.section)
            if (item.amount !== null) expect(item.amount).toBeGreaterThan(0)
            if (!item.perDay) expect(item.maxAmount).toBeNull()
         }
         expect(templateFromList(itemsFromTemplate(template.items, [], null))).toHaveLength(template.items.length)
      }
   })
})
