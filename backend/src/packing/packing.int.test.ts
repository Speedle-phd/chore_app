import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership, type Role } from '../models/membershipModel'
import { STARTER_TEMPLATES } from '../domain/packingStarters'
import { Household } from '../models/householdModel'
import { MAX_LIST_ITEMS, PackingList, PackingTemplate } from '../models/packingModels'
import { ShoppingItem } from '../models/shoppingModels'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

let app: ReturnType<typeof createApp>
let notices: ReturnType<typeof vi.spyOn>
beforeAll(() => {
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused' }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
   notices = vi.spyOn(realtime, 'householdChanged')
})
afterAll(() => notices.mockRestore())

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

type Template = { id: string; name: string; items: { text: string; section: string; perPerson: boolean; amount: number | null; perDay: boolean; maxAmount: number | null }[] }
type ListItem = { id: string; text: string; section: string; memberId: string | null; quantity: number | null; checked: boolean; checkedBy: string | null }
type List = { id: string; name: string; vacationId: string | null; travellerIds: string[]; days: number | null; progress: { done: number; total: number }; items: ListItem[]; archivedAt: string | null }

async function home() {
   const ownerUser = await signedInUser(app, 'Ada')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const ownerMid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))!.id as string
   const base = `/api/households/${hid}/packing`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const membership = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { ...as(person.cookie), mid: membership.id as string }
   }
   const template = async (name: string) => ((await owner.get(`${base}/templates`)).body as Template[]).find((t) => t.name === name)!
   return { hid, owner, ownerMid, base, join, template }
}

describe('templates', () => {
   it('a household gets every starter template once, even when asked twice at the same time', async () => {
      const { owner, base, hid } = await home()
      const [a, b] = await Promise.all([owner.get(`${base}/templates`), owner.get(`${base}/templates`)])
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
      expect(await PackingTemplate.countDocuments({ householdId: hid })).toBe(STARTER_TEMPLATES.length)
      expect(((await owner.get(`${base}/templates`)).body as Template[]).map((t) => t.name)).toEqual(STARTER_TEMPLATES.map((t) => t.name).sort())
      expect((await Household.findById(hid).lean())?.packingStarters).toEqual(expect.arrayContaining(STARTER_TEMPLATES.map((t) => t.key)))
   })

   it('households from before starter keys get only the new starters; deleted starters stay gone', async () => {
      const { owner, base, hid } = await home()
      // As seeded by the first version: three templates, no keys recorded; then "Skiing" was deleted.
      await Household.updateOne({ _id: hid }, { $set: { packingSeededAt: new Date(), packingStarters: [] } })
      const createdBy = (await Membership.findOne({ householdId: hid }))!._id
      await PackingTemplate.create([
         { householdId: hid, name: 'Weekend trip', items: [], createdBy },
         { householdId: hid, name: 'Summer holiday', items: [], createdBy },
      ])
      const names = ((await owner.get(`${base}/templates`)).body as Template[]).map((t) => t.name)
      expect(names).not.toContain('Skiing')
      expect(names.filter((n) => n === 'Weekend trip')).toHaveLength(1)
      expect(names).toEqual(expect.arrayContaining(['Camping', 'Business trip', 'City break', 'Hiking day', 'Baby & toddler', 'Visiting family']))
      expect(names).toHaveLength(STARTER_TEMPLATES.length - 1)

      const camping = ((await owner.get(`${base}/templates`)).body as Template[]).find((t) => t.name === 'Camping')!
      await owner.del(`${base}/templates/${camping.id}`)
      expect(((await owner.get(`${base}/templates`)).body as Template[]).map((t) => t.name)).not.toContain('Camping')
   })

   it('creates, edits and deletes templates; deleting is for the creator or admins', async () => {
      const { owner, base, join } = await home()
      const member = await join('member')
      const created = await member.post(`${base}/templates`, { name: 'Camping', items: [{ text: 'Tent', section: 'gear' }, { text: 'Sleeping bag', section: 'gear', perPerson: true }] })
      expect(created.status).toBe(201)
      expect(created.body.items).toEqual([
         { text: 'Tent', section: 'gear', perPerson: false, amount: null, perDay: false, maxAmount: null },
         { text: 'Sleeping bag', section: 'gear', perPerson: true, amount: null, perDay: false, maxAmount: null },
      ])
      const edited = await owner.patch(`${base}/templates/${created.body.id}`, { items: [{ text: 'Tent', section: 'gear', perPerson: false }] })
      expect(edited.body.items).toHaveLength(1)
      expect((await PackingTemplate.findById(created.body.id))?.items).toHaveLength(1)

      const ownersTemplate = (await owner.get(`${base}/templates`)).body.find((t: Template) => t.name === 'Skiing')
      expect((await member.del(`${base}/templates/${ownersTemplate.id}`)).status).toBe(403)
      expect((await member.del(`${base}/templates/${created.body.id}`)).status).toBe(204)
      expect(await PackingTemplate.exists({ _id: created.body.id })).toBeNull()
   })

   it('validates input', async () => {
      const { owner, base } = await home()
      expect((await owner.post(`${base}/templates`, { name: ' ', items: [] })).status).toBe(400)
      expect((await owner.post(`${base}/templates`, { name: 'X', items: [{ text: 'A', section: 'shoes' }] })).status).toBe(400)
      expect((await owner.patch(`${base}/templates/000000000000000000000000`, { name: 'X' })).status).toBe(404)
      expect((await owner.patch(`${base}/templates/nope`, { name: 'X' })).status).toBe(404)
   })
})

describe('lists', () => {
   it('builds a list from a template: per-person items for each traveller', async () => {
      const { owner, ownerMid, base, join, template } = await home()
      const ben = await join('member')
      const weekend = await template('Weekend trip')
      const res = await owner.post(`${base}/lists`, { name: 'Hamburg', templateId: weekend.id, travellerIds: [ownerMid, ben.mid] })
      expect(res.status).toBe(201)
      const list = res.body as List
      const perPerson = weekend.items.filter((i) => i.perPerson).length
      const shared = weekend.items.length - perPerson
      expect(list.items).toHaveLength(perPerson * 2 + shared)
      expect(list.items.filter((i) => i.text === 'Toothbrush').map((i) => i.memberId)).toEqual([ownerMid, ben.mid])
      expect(list.items.find((i) => i.text === 'Toothpaste')?.memberId).toBeNull()
      expect(list.progress).toEqual({ done: 0, total: list.items.length })
      expect((await owner.get(`${base}/lists`)).body).toEqual([expect.objectContaining({ id: list.id, name: 'Hamburg', progress: list.progress })])
      expect((await owner.get(`${base}/lists`)).body[0].items).toBeUndefined()
   })

   it('starts empty without a template and refuses people or vacations of other households', async () => {
      const { owner, base } = await home()
      const other = await home()
      expect((await owner.post(`${base}/lists`, { name: 'Empty' })).body.items).toEqual([])
      expect((await owner.post(`${base}/lists`, { name: 'X', travellerIds: [other.ownerMid] })).status).toBe(400)
      const vacation = await other.owner.post(`/api/households/${other.hid}/calendar-items`, {
         kind: 'vacation', title: 'Away', allDay: true, start: '2026-07-01', end: '2026-07-08', timezone: 'Europe/Berlin', memberIds: [other.ownerMid],
      })
      expect(vacation.status).toBe(201)
      expect((await owner.post(`${base}/lists`, { name: 'X', vacationId: vacation.body.id })).status).toBe(400)
      expect((await owner.post(`${base}/lists`, { name: 'X', templateId: '000000000000000000000000' })).status).toBe(404)
   })

   it('links a vacation; deleting the vacation keeps the list without the link', async () => {
      const { hid, owner, ownerMid, base } = await home()
      const event = await owner.post(`/api/households/${hid}/calendar-items`, {
         kind: 'event', title: 'Dentist', allDay: true, start: '2026-07-01', end: '2026-07-02', timezone: 'Europe/Berlin',
      })
      expect((await owner.post(`${base}/lists`, { name: 'X', vacationId: event.body.id })).status).toBe(400)
      const vacation = await owner.post(`/api/households/${hid}/calendar-items`, {
         kind: 'vacation', title: 'Italy', allDay: true, start: '2026-07-01', end: '2026-07-15', timezone: 'Europe/Berlin', memberIds: [ownerMid],
      })
      const list = (await owner.post(`${base}/lists`, { name: 'Italy', vacationId: vacation.body.id, travellerIds: [ownerMid] })).body as List
      expect(list.vacationId).toBe(vacation.body.id)
      notices.mockClear()
      expect((await owner.del(`/api/households/${hid}/calendar-items/${vacation.body.id}`)).status).toBe(204)
      expect((await owner.get(`${base}/lists/${list.id}`)).body.vacationId).toBeNull()
      expect(notices).toHaveBeenCalledWith(expect.anything(), 'packing')
   })

   it('renames, archives and restores; deleting is for the creator or admins', async () => {
      const { owner, base, join } = await home()
      const member = await join('member')
      const list = (await owner.post(`${base}/lists`, { name: 'Trip' })).body as List
      expect((await member.patch(`${base}/lists/${list.id}`, { name: 'Big trip' })).body.name).toBe('Big trip')
      const archived = await member.patch(`${base}/lists/${list.id}`, { archived: true })
      expect(archived.body.archivedAt).not.toBeNull()
      expect((await member.patch(`${base}/lists/${list.id}`, { archived: false })).body.archivedAt).toBeNull()
      expect((await member.del(`${base}/lists/${list.id}`)).status).toBe(403)
      expect((await owner.del(`${base}/lists/${list.id}`)).status).toBe(204)
      expect(await PackingList.exists({ _id: list.id })).toBeNull()
   })
})

describe('items', () => {
   it('adds, checks, edits and removes items, with a live notice each time', async () => {
      const { owner, ownerMid, base, join } = await home()
      const ben = await join('member')
      const list = (await owner.post(`${base}/lists`, { name: 'Trip', travellerIds: [ownerMid, ben.mid] })).body as List
      notices.mockClear()
      const added = (await ben.post(`${base}/lists/${list.id}/items`, { text: 'Camera', section: 'electronics', memberId: ben.mid })).body as List
      expect(added.items).toEqual([expect.objectContaining({ text: 'Camera', section: 'electronics', memberId: ben.mid, checked: false })])
      const item = added.items[0]!

      const checked = (await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { checked: true })).body as List
      expect(checked.items[0]).toMatchObject({ checked: true, checkedBy: ownerMid })
      expect(checked.progress).toEqual({ done: 1, total: 1 })
      expect((await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { checked: false })).body.items[0]).toMatchObject({ checked: false, checkedBy: null })

      const edited = (await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { text: 'Camera + charger', memberId: null })).body as List
      expect(edited.items[0]).toMatchObject({ text: 'Camera + charger', memberId: null })

      expect((await owner.del(`${base}/lists/${list.id}/items/${item.id}`)).body.items).toEqual([])
      expect(notices).toHaveBeenCalledTimes(5)
      expect(notices).toHaveBeenCalledWith(expect.anything(), 'packing')
   })

   it('answers 404 for unknown items and lists, 400 for people of other households or empty text', async () => {
      const { owner, base } = await home()
      const other = await home()
      const list = (await owner.post(`${base}/lists`, { name: 'Trip' })).body as List
      expect((await owner.patch(`${base}/lists/${list.id}/items/000000000000000000000000`, { checked: true })).status).toBe(404)
      expect((await owner.del(`${base}/lists/${list.id}/items/nope`)).status).toBe(404)
      expect((await owner.post(`${base}/lists/000000000000000000000000/items`, { text: 'A', section: 'other' })).status).toBe(404)
      expect((await owner.post(`${base}/lists/${list.id}/items`, { text: 'A', section: 'other', memberId: other.ownerMid })).status).toBe(400)
      expect((await owner.post(`${base}/lists/${list.id}/items`, { text: ' ', section: 'other' })).status).toBe(400)
   })

   it('refuses more than the maximum number of items', async () => {
      const { owner, base } = await home()
      const list = (await owner.post(`${base}/lists`, { name: 'Huge' })).body as List
      await PackingList.updateOne({ _id: list.id }, { $set: { items: Array.from({ length: MAX_LIST_ITEMS }, (_, i) => ({ text: `Thing ${i}`, section: 'other' })) } })
      const res = await owner.post(`${base}/lists/${list.id}/items`, { text: 'One more', section: 'other' })
      expect(res.status).toBe(400)
      expect((await PackingList.findById(list.id))?.items).toHaveLength(MAX_LIST_ITEMS)
   })
})

describe('travellers in hindsight', () => {
   it('a new traveller gets the personal items; a removed one takes theirs along', async () => {
      const { owner, ownerMid, base, join } = await home()
      const ben = await join('member')
      const cara = await join('member')
      const list = (await owner.post(`${base}/lists`, { name: 'Trip', travellerIds: [ownerMid] })).body as List
      await owner.post(`${base}/lists/${list.id}/items`, { text: 'Socks', section: 'clothes', memberId: ownerMid, quantity: 3 })
      await owner.post(`${base}/lists/${list.id}/items`, { text: 'Map', section: 'gear' })

      notices.mockClear()
      const withBen = (await ben.patch(`${base}/lists/${list.id}`, { travellerIds: [ownerMid, ben.mid] })).body as List
      expect(withBen.travellerIds).toEqual([ownerMid, ben.mid])
      expect(withBen.items.map((i) => [i.text, i.memberId, i.quantity])).toEqual([
         ['Socks', ownerMid, 3],
         ['Map', null, null],
         ['Socks', ben.mid, 3],
      ])
      expect(notices).toHaveBeenCalledWith(expect.anything(), 'packing')

      const withoutCopy = (await owner.patch(`${base}/lists/${list.id}`, { travellerIds: [ownerMid, ben.mid, cara.mid], copyItems: false })).body as List
      expect(withoutCopy.items.filter((i) => i.memberId === cara.mid)).toEqual([])

      const withoutAnn = (await owner.patch(`${base}/lists/${list.id}`, { travellerIds: [ben.mid, cara.mid] })).body as List
      expect(withoutAnn.items.map((i) => [i.text, i.memberId])).toEqual([
         ['Map', null],
         ['Socks', ben.mid],
      ])
      expect((await PackingList.findById(list.id))?.travellerIds.map(String)).toEqual([ben.mid, cara.mid])
   })

   it('refuses people of other households and duplicates', async () => {
      const { owner, ownerMid, base } = await home()
      const other = await home()
      const list = (await owner.post(`${base}/lists`, { name: 'Trip' })).body as List
      expect((await owner.patch(`${base}/lists/${list.id}`, { travellerIds: [other.ownerMid] })).status).toBe(400)
      expect((await owner.patch(`${base}/lists/${list.id}`, { travellerIds: [ownerMid, ownerMid] })).status).toBe(400)
   })
})

describe('amounts', () => {
   it('templates keep amounts; fixed ones are whole numbers, per day may be halves, a cap only per day', async () => {
      const { owner, base } = await home()
      const res = await owner.post(`${base}/templates`, {
         name: 'Beach',
         items: [
            { text: 'Socks', section: 'clothes', perPerson: true, amount: 1, perDay: true, maxAmount: 7 },
            { text: 'Shorts', section: 'clothes', amount: 0.5, perDay: true },
            { text: 'Swimwear', section: 'clothes', amount: 2, maxAmount: 5 },
            { text: 'Passport', section: 'documents' },
         ],
      })
      expect(res.status).toBe(201)
      expect((res.body as Template).items.map((i) => [i.text, i.amount, i.perDay, i.maxAmount])).toEqual([
         ['Socks', 1, true, 7],
         ['Shorts', 0.5, true, null],
         ['Swimwear', 2, false, null], // a cap without per day is dropped
         ['Passport', null, false, null],
      ])
      expect((await owner.post(`${base}/templates`, { name: 'X', items: [{ text: 'A', section: 'other', amount: 1.5 }] })).status).toBe(400)
      expect((await owner.post(`${base}/templates`, { name: 'X', items: [{ text: 'A', section: 'other', amount: 0.3, perDay: true }] })).status).toBe(400)
      expect((await owner.post(`${base}/templates`, { name: 'X', items: [{ text: 'A', section: 'other', amount: 0 }] })).status).toBe(400)
   })

   it('a list works out amounts from the trip length and keeps the days', async () => {
      const { owner, ownerMid, base } = await home()
      const template = (
         await owner.post(`${base}/templates`, {
            name: 'Beach',
            items: [
               { text: 'Socks', section: 'clothes', perPerson: true, amount: 1, perDay: true, maxAmount: 7 },
               { text: 'Swimwear', section: 'clothes', perPerson: true, amount: 2 },
               { text: 'Passport', section: 'documents', perPerson: true },
            ],
         })
      ).body as Template
      const amounts = (list: List) => list.items.map((i) => [i.text, i.quantity])
      const ten = (await owner.post(`${base}/lists`, { name: 'Ten days', templateId: template.id, travellerIds: [ownerMid], days: 10 })).body as List
      expect(ten.days).toBe(10)
      expect(amounts(ten)).toEqual([['Socks', 7], ['Swimwear', 2], ['Passport', null]])
      const three = (await owner.post(`${base}/lists`, { name: 'Three', templateId: template.id, travellerIds: [ownerMid], days: 3 })).body as List
      expect(amounts(three)).toEqual([['Socks', 3], ['Swimwear', 2], ['Passport', null]])
      const unknown = (await owner.post(`${base}/lists`, { name: 'Unknown', templateId: template.id, travellerIds: [ownerMid] })).body as List
      expect(unknown.days).toBeNull()
      expect(amounts(unknown)).toEqual([['Socks', null], ['Swimwear', 2], ['Passport', null]])
      expect((await owner.post(`${base}/lists`, { name: 'X', days: 0 })).status).toBe(400)
      expect((await owner.patch(`${base}/lists/${three.id}`, { days: 5 })).body.days).toBe(5)
   })

   it('items take an optional whole amount that can be changed or cleared', async () => {
      const { owner, base } = await home()
      const list = (await owner.post(`${base}/lists`, { name: 'Trip' })).body as List
      const added = (await owner.post(`${base}/lists/${list.id}/items`, { text: 'Socks', section: 'clothes', quantity: 3 })).body
      const item = added.items[0]
      expect(item.quantity).toBe(3)
      expect((await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { quantity: 5 })).body.items[0].quantity).toBe(5)
      expect((await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { quantity: null })).body.items[0].quantity).toBeNull()
      expect((await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { quantity: 0 })).status).toBe(400)
      expect((await owner.patch(`${base}/lists/${list.id}/items/${item.id}`, { quantity: 2.5 })).status).toBe(400)
      expect((await owner.post(`${base}/lists/${list.id}/items`, { text: 'Map', section: 'gear' })).body.items[1].quantity).toBeNull()
   })

   it('the shopping list gets the amounts added up; saving as a template keeps the largest', async () => {
      const { hid, owner, ownerMid, base, join } = await home()
      const ben = await join('member')
      const list = (await owner.post(`${base}/lists`, { name: 'Trip', travellerIds: [ownerMid, ben.mid] })).body as List
      await owner.post(`${base}/lists/${list.id}/items`, { text: 'Socks', section: 'clothes', memberId: ownerMid, quantity: 3 })
      await owner.post(`${base}/lists/${list.id}/items`, { text: 'Socks', section: 'clothes', memberId: ben.mid, quantity: 4 })
      const groceries = (await owner.get(`/api/households/${hid}/shopping/lists`)).body[0]
      await owner.post(`${base}/lists/${list.id}/to-shopping`, { shoppingListId: groceries.id })
      const socks = await ShoppingItem.findOne({ listId: groceries.id, name: 'Socks' }).lean()
      expect([socks?.quantity, socks?.unit]).toEqual([7, 'pcs'])
      const template = (await owner.post(`${base}/lists/${list.id}/save-as-template`, { name: 'Socks trip' })).body as Template
      expect(template.items).toEqual([{ text: 'Socks', section: 'clothes', perPerson: true, amount: 4, perDay: false, maxAmount: null }])
   })
})

describe('shopping and templates from a list', () => {
   it('puts unpacked items on a shopping list, counted per person', async () => {
      const { owner, ownerMid, base, join, hid } = await home()
      const ben = await join('member')
      const list = (await owner.post(`${base}/lists`, { name: 'Italy', travellerIds: [ownerMid, ben.mid] })).body as List
      for (const [text, memberId] of [['Toothbrush', ownerMid], ['Toothbrush', ben.mid], ['Sunscreen', null], ['Plasters', null]] as const) {
         await owner.post(`${base}/lists/${list.id}/items`, { text, section: 'toiletries', memberId })
      }
      const sunscreen = (await owner.get(`${base}/lists/${list.id}`)).body.items.find((i: ListItem) => i.text === 'Sunscreen')
      await owner.patch(`${base}/lists/${list.id}/items/${sunscreen.id}`, { checked: true })

      const groceries = (await owner.get(`/api/households/${hid}/shopping/lists`)).body[0]
      const res = await owner.post(`${base}/lists/${list.id}/to-shopping`, { shoppingListId: groceries.id })
      expect(res.body).toEqual({ added: 2 })
      const items = await ShoppingItem.find({ listId: groceries.id }).sort({ createdAt: 1 }).lean()
      expect(items.map((i) => [i.name, i.quantity, i.unit, i.note])).toEqual([
         ['Toothbrush', 2, 'pcs', 'Packing: Italy'],
         ['Plasters', null, null, 'Packing: Italy'],
      ])

      const other = await home()
      const foreign = (await other.owner.get(`/api/households/${other.hid}/shopping/lists`)).body[0]
      expect((await owner.post(`${base}/lists/${list.id}/to-shopping`, { shoppingListId: foreign.id })).status).toBe(404)
   })

   it('saves a list as a template', async () => {
      const { owner, ownerMid, base } = await home()
      const list = (await owner.post(`${base}/lists`, { name: 'Trip', travellerIds: [ownerMid] })).body as List
      await owner.post(`${base}/lists/${list.id}/items`, { text: 'Socks', section: 'clothes', memberId: ownerMid })
      await owner.post(`${base}/lists/${list.id}/items`, { text: 'Map', section: 'gear' })
      const res = await owner.post(`${base}/lists/${list.id}/save-as-template`, { name: 'My trip' })
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ name: 'My trip', items: [{ text: 'Socks', section: 'clothes', perPerson: true }, { text: 'Map', section: 'gear', perPerson: false }] })
   })
})

describe('access boundary', () => {
   it('answers 404 to non-members and deletes everything with the household', async () => {
      const { hid, owner, base } = await home()
      const list = (await owner.post(`${base}/lists`, { name: 'Trip' })).body as List
      const stranger = as((await signedInUser(app, 'Stranger')).cookie)
      for (const res of [
         await stranger.get(`${base}/templates`),
         await stranger.get(`${base}/lists`),
         await stranger.get(`${base}/lists/${list.id}`),
         await stranger.post(`${base}/lists/${list.id}/items`, { text: 'A', section: 'other' }),
      ]) {
         expect(res.status).toBe(404)
      }
      expect((await owner.del(`/api/households/${hid}`)).status).toBe(204)
      expect(await PackingList.countDocuments({ householdId: hid })).toBe(0)
      expect(await PackingTemplate.countDocuments({ householdId: hid })).toBe(0)
   })
})
