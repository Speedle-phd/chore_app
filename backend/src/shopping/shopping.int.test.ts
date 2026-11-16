import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership, type Role } from '../models/membershipModel'
import { ItemMemory, ShoppingCategory, ShoppingItem, ShoppingList } from '../models/shoppingModels'
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
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

type Item = { id: string; name: string; quantity: number | null; unit: string | null; categoryId: string | null; checked: boolean }
type Category = { id: string; key: string | null; name: string }

async function home() {
   const ownerUser = await signedInUser(app, 'Ada')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const base = `/api/households/${hid}/shopping`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      await Membership.create({ householdId: hid, userId: person.user._id, role })
      return as(person.cookie)
   }
   const firstList = async () => (await owner.get(`${base}/lists`)).body[0] as { id: string; name: string }
   const categories = async () => (await owner.get(`${base}/categories`)).body as Category[]
   return { hid, owner, base, join, firstList, categories }
}

describe('lists and categories', () => {
   it('a household starts with “Groceries” and the default categories, once even when asked twice at the same time', async () => {
      const { owner, base, hid } = await home()
      const [a, b] = await Promise.all([owner.get(`${base}/lists`), owner.get(`${base}/categories`)])
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
      expect((await owner.get(`${base}/lists`)).body.map((l: { name: string; openCount: number }) => [l.name, l.openCount])).toEqual([['Groceries', 0]])
      expect(await ShoppingCategory.countDocuments({ householdId: hid })).toBe(10)
      expect(((await owner.get(`${base}/categories`)).body as Category[]).map((c) => c.name).slice(0, 3)).toEqual(['Fruit & vegetables', 'Bakery', 'Fridge'])
   })

   it('creates, renames and deletes lists; deleting is for the creator or admins', async () => {
      const { owner, base, join, hid } = await home()
      const member = await join('member')
      const party = (await member.post(`${base}/lists`, { name: 'Party' })).body
      expect(party).toMatchObject({ name: 'Party', position: 1, openCount: 0 })
      const groceries = (await owner.get(`${base}/lists`)).body[0]
      expect((await member.patch(`${base}/lists/${party.id}`, { name: 'Birthday party' })).body.name).toBe('Birthday party')
      await owner.post(`${base}/lists/${groceries.id}/items`, { name: 'Brot' })
      expect((await member.del(`${base}/lists/${groceries.id}`)).status).toBe(403)
      expect((await member.del(`${base}/lists/${party.id}`)).status).toBe(204)
      expect((await owner.del(`${base}/lists/${groceries.id}`)).status).toBe(204)
      expect(await ShoppingItem.countDocuments({ householdId: hid })).toBe(0)
   })

   it('customizes categories: add, rename, reorder (all of them), delete → items uncategorized', async () => {
      const { owner, base, firstList, categories } = await home()
      const list = await firstList()
      const pets = (await owner.post(`${base}/categories`, { name: 'Pets', icon: 'dog' })).body as Category
      expect(pets).toMatchObject({ name: 'Pets', key: null })
      expect((await owner.patch(`${base}/categories/${pets.id}`, { name: 'Pet shop' })).body.name).toBe('Pet shop')
      const all = await categories()
      const reversed = all.map((c) => c.id).reverse()
      expect(((await owner.put(`${base}/categories/order`, { ids: reversed })).body as Category[]).map((c) => c.id)).toEqual(reversed)
      expect((await owner.put(`${base}/categories/order`, { ids: reversed.slice(1) })).status).toBe(400)

      const food = (await owner.post(`${base}/lists/${list.id}/items`, { name: 'Katzenfutter', categoryId: pets.id })).body as Item
      expect(food.categoryId).toBe(pets.id)
      expect((await owner.del(`${base}/categories/${pets.id}`)).status).toBe(204)
      const after = (await owner.get(`${base}/lists/${list.id}/items`)).body as Item[]
      expect(after.find((i) => i.id === food.id)?.categoryId).toBeNull()
   })
})

describe('items', () => {
   it('Milch: catalog category, merge with compatible units, basket and back', async () => {
      const { owner, base, hid, firstList, categories } = await home()
      const list = await firstList()
      const fridge = (await categories()).find((c) => c.key === 'fridge')
      const items = `${base}/lists/${list.id}/items`

      notices.mockClear()
      const first = (await owner.post(items, { name: 'Milch', quantity: 1, unit: 'l' })).body as Item
      expect(first).toMatchObject({ name: 'Milch', quantity: 1, unit: 'l', categoryId: fridge?.id, checked: false })
      expect(notices.mock.calls[0]?.map(String)).toEqual([hid, 'shopping'])

      const merged = (await owner.post(items, { name: '  milch ', quantity: 500, unit: 'ml' })).body as Item
      expect(merged).toMatchObject({ id: first.id, quantity: 1.5, unit: 'l' })
      const bottle = (await owner.post(items, { name: 'Milch', quantity: 2, unit: 'bottle' })).body as Item
      expect(bottle.id).not.toBe(first.id)

      expect((await owner.patch(`${items}/${first.id}`, { checked: true })).body).toMatchObject({ checked: true })
      await owner.del(`${items}/${bottle.id}`)
      const back = (await owner.post(items, { name: 'Milch', quantity: 2, unit: 'l' })).body as Item
      expect(back).toMatchObject({ id: first.id, quantity: 2, unit: 'l', checked: false })
      expect((await owner.get(`${base}/lists`)).body[0].openCount).toBe(1)
   })

   it('remembers a corrected category and suggests history before the catalog', async () => {
      const { owner, base, firstList, categories } = await home()
      const list = await firstList()
      const drinks = (await categories()).find((c) => c.key === 'drinks')
      const items = `${base}/lists/${list.id}/items`
      const milk = (await owner.post(items, { name: 'Milch', quantity: 1, unit: 'l' })).body as Item
      await owner.patch(`${items}/${milk.id}`, { categoryId: drinks?.id })
      await owner.del(`${items}/${milk.id}`)
      expect(((await owner.post(items, { name: 'Milch' })).body as Item).categoryId).toBe(drinks?.id)

      const suggestions = (await owner.get(`${base}/suggestions`, { q: 'mil' })).body as { name: string; source: string; categoryId: string | null }[]
      expect(suggestions[0]).toMatchObject({ name: 'Milch', source: 'history', categoryId: drinks?.id })
      expect(suggestions.find((s) => s.name === 'Buttermilch')).toMatchObject({ source: 'catalog' })
   })

   it('clears the basket and returns the items; adding them back as checked restores it', async () => {
      const { owner, base, firstList } = await home()
      const list = await firstList()
      const items = `${base}/lists/${list.id}/items`
      const brot = (await owner.post(items, { name: 'Brot' })).body as Item
      await owner.post(items, { name: 'Butter' })
      await owner.patch(`${items}/${brot.id}`, { checked: true })
      const removed = (await owner.post(`${items}/clear-checked`)).body as Item[]
      expect(removed.map((i) => i.name)).toEqual(['Brot'])
      expect(((await owner.get(items)).body as Item[]).map((i) => i.name)).toEqual(['Butter'])
      const restored = await owner.post(`${items}/batch`, { items: removed.map((i) => ({ name: i.name, checked: true, categoryId: i.categoryId })) })
      expect(restored.status).toBe(201)
      expect(((await owner.get(items)).body as Item[]).map((i) => [i.name, i.checked])).toEqual([
         ['Butter', false],
         ['Brot', true],
      ])
   })

   it('rejects bad input (400) and other households (404)', async () => {
      const { owner, base, firstList } = await home()
      const list = await firstList()
      const items = `${base}/lists/${list.id}/items`
      expect((await owner.post(items, { name: '' })).status).toBe(400)
      expect((await owner.post(items, { name: 'Milch', quantity: 0 })).status).toBe(400)
      expect((await owner.post(items, { name: 'Milch', unit: 'gallon' })).status).toBe(400)
      expect((await owner.post(items, { name: 'Milch', categoryId: '000000000000000000000000' })).status).toBe(400)
      expect((await owner.patch(`${items}/000000000000000000000000`, { checked: true })).status).toBe(404)

      const stranger = as((await signedInUser(app, 'Eve')).cookie)
      expect((await stranger.get(`${base}/lists`)).status).toBe(404)
      expect((await stranger.post(items, { name: 'Milch' })).status).toBe(404)
   })

   it('deleting the household removes lists, items, categories and memory', async () => {
      const { owner, base, hid, firstList } = await home()
      const list = await firstList()
      await owner.post(`${base}/lists/${list.id}/items`, { name: 'Brot' })
      expect((await owner.del(`/api/households/${hid}`)).status).toBe(204)
      for (const Model of [ShoppingList, ShoppingItem, ShoppingCategory, ItemMemory] as const) {
         expect(await (Model as typeof ShoppingItem).countDocuments({ householdId: hid })).toBe(0)
      }
   })
})
