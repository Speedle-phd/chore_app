import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership, type Role } from '../models/membershipModel'
import { Recipe } from '../models/recipeModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

const recipeDir = mkdtempSync(path.join(tmpdir(), 'recipes-'))
let app: ReturnType<typeof createApp>
let notices: ReturnType<typeof vi.spyOn>
beforeAll(() => {
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused', RECIPE_UPLOAD_DIR: recipeDir }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
   notices = vi.spyOn(realtime, 'householdChanged')
})
afterAll(() => {
   notices.mockRestore()
   rmSync(recipeDir, { recursive: true, force: true })
})

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
   photo: (url: string, buffer: Buffer, name = 'photo.png', type = 'image/png') =>
      request(app).put(url).set(H).set('Cookie', cookie).attach('image', buffer, { filename: name, contentType: type }),
})

const png = () => sharp({ create: { width: 800, height: 600, channels: 3, background: '#e8b86d' } }).png().toBuffer()
const fileOf = (url: string) => path.join(recipeDir, path.basename(url))

async function home() {
   const ownerUser = await signedInUser(app, 'Ada')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const base = `/api/households/${hid}`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      await Membership.create({ householdId: hid, userId: person.user._id, role })
      return as(person.cookie)
   }
   return { hid, owner, base, recipes: `${base}/recipes`, join }
}

const lasagne = {
   title: 'Lasagne',
   description: 'Sunday classic',
   servings: 4,
   prepMinutes: 30,
   cookMinutes: 45,
   ingredients: ['500 g Hackfleisch', '1 Dose (400 g) gehackte Tomaten', '250 g Lasagneplatten', '2 EL Olivenöl', 'Salz und Pfeffer nach Belieben', ''],
   steps: ['Brown the meat.', '', 'Layer and bake.'],
   tags: ['Pasta', ' Comfort  Food', 'pasta'],
}

describe('recipes', () => {
   it('creates a recipe: parses ingredients, cleans steps and tags; live notice', async () => {
      const { owner, recipes, hid } = await home()
      notices.mockClear()
      const res = await owner.post(recipes, lasagne)
      expect(res.status).toBe(201)
      expect(notices.mock.calls[0]?.map(String)).toEqual([hid, 'recipes'])
      // "Pasta" is the catalog's "Nudeln"; "Comfort Food" is the household's own tag.
      expect(res.body).toMatchObject({ title: 'Lasagne', servings: 4, totalMinutes: 75, tags: ['Nudeln', 'Comfort Food'], steps: ['Brown the meat.', 'Layer and bake.'] })
      expect(res.body.ingredients.map((i: { quantity: number | null; unit: string | null; name: string; note: string }) => [i.quantity, i.unit, i.name, i.note])).toEqual([
         [500, 'g', 'Hackfleisch', ''],
         [1, 'can', 'gehackte Tomaten', '400 g'],
         [250, 'g', 'Lasagneplatten', ''],
         [2, 'tbsp', 'Olivenöl', ''],
         [null, null, 'Salz und Pfeffer', 'nach Belieben'],
      ])
      const tags = (await owner.get(`${recipes}/tags`)).body
      expect(tags.used).toEqual([
         { tag: 'Comfort Food', count: 1 },
         { tag: 'Nudeln', count: 1 },
      ])
      expect(tags.groups.find((g: { id: string }) => g.id === 'diet').tags).toContain('Vegetarisch')
   })

   it('searches by title, ingredient and tags; filters by rating; sorts', async () => {
      const { owner, recipes, join } = await home()
      const ben = await join('member')
      const a = (await owner.post(recipes, lasagne)).body
      const b = (await owner.post(recipes, { title: 'Pfannkuchen', ingredients: ['250 g Mehl', '3 Eier', '500 ml Milch'], tags: ['süß', 'schnell'] })).body
      await owner.post(recipes, { title: 'Tomatensuppe', ingredients: ['1 kg Tomaten'], tags: ['schnell'] })
      const titles = async (query: Record<string, string>) => ((await owner.get(recipes, query)).body as { title: string }[]).map((r) => r.title)

      expect(await titles({ q: 'tomat' })).toEqual(expect.arrayContaining(['Lasagne', 'Tomatensuppe']))
      expect(await titles({ q: 'tomat' })).toHaveLength(2)
      expect(await titles({ q: 'MEHL' })).toEqual(['Pfannkuchen'])
      expect(await titles({ tags: 'schnell' })).toHaveLength(2)
      expect(await titles({ tags: 'schnell,süß' })).toEqual(['Pfannkuchen'])
      expect(await titles({ q: '(' })).toEqual([])

      await owner.put(`${recipes}/${a.id}/rating`, { stars: 5 })
      const rated = (await ben.put(`${recipes}/${a.id}/rating`, { stars: 4 })).body
      expect(rated).toMatchObject({ ratingAvg: 4.5, ratingCount: 2, myRating: 4 })
      await owner.put(`${recipes}/${b.id}/rating`, { stars: 3 })
      expect(await titles({ minRating: '4' })).toEqual(['Lasagne'])
      expect(await titles({ sort: 'rating' })).toEqual(['Lasagne', 'Pfannkuchen', 'Tomatensuppe'])
      expect(await titles({ sort: 'title' })).toEqual(['Lasagne', 'Pfannkuchen', 'Tomatensuppe'])

      const unrated = (await ben.put(`${recipes}/${a.id}/rating`, { stars: null })).body
      expect(unrated).toMatchObject({ ratingAvg: 5, ratingCount: 1, myRating: null })
   })

   it('counts cooking', async () => {
      const { owner, recipes } = await home()
      const r = (await owner.post(recipes, lasagne)).body
      await owner.post(`${recipes}/${r.id}/cooked`)
      const twice = (await owner.post(`${recipes}/${r.id}/cooked`)).body
      expect(twice.cookedCount).toBe(2)
      expect(twice.lastCookedAt).not.toBeNull()
   })

   it('photos: upload, replace (old file deleted), remove; only images', async () => {
      const { owner, recipes } = await home()
      const r = (await owner.post(recipes, lasagne)).body
      const first = await owner.photo(`${recipes}/${r.id}/image`, await png())
      expect(first.status).toBe(200)
      expect(first.body.imageUrl).toMatch(/^\/uploads\/recipes\/[\w-]+\.webp$/)
      const meta = await sharp(fileOf(first.body.imageUrl)).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1200, 900])

      const second = (await owner.photo(`${recipes}/${r.id}/image`, await png())).body
      expect(existsSync(fileOf(first.body.imageUrl))).toBe(false)
      expect((await request(app).get(second.imageUrl)).status).toBe(200)

      expect((await owner.photo(`${recipes}/${r.id}/image`, Buffer.from('nope'), 'x.txt', 'text/plain')).status).toBe(400)
      expect((await owner.del(`${recipes}/${r.id}/image`)).body.imageUrl).toBeNull()
      expect(existsSync(fileOf(second.imageUrl))).toBe(false)
   })

   it('adds chosen ingredients, scaled, to a shopping list (merging with what is there)', async () => {
      const { owner, recipes, base } = await home()
      const r = (await owner.post(recipes, lasagne)).body
      const list = (await owner.get(`${base}/shopping/lists`)).body[0]
      await owner.post(`${base}/shopping/lists/${list.id}/items`, { name: 'Hackfleisch', quantity: 250, unit: 'g' })
      const res = await owner.post(`${recipes}/${r.id}/to-list`, { listId: list.id, servings: 6, ingredients: [0, 1, 3] })
      expect(res.status).toBe(201)
      const items = (await owner.get(`${base}/shopping/lists/${list.id}/items`)).body as { name: string; quantity: number; unit: string; fromRecipeIds: string[] }[]
      // 500 g × 6/4 = 750 g, plus the 250 g already there = 1 kg; 1 can × 1.5; 2 tbsp × 1.5.
      expect(items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
         ['Hackfleisch', 1, 'kg'],
         ['gehackte Tomaten', 1.5, 'can'],
         ['Olivenöl', 3, 'tbsp'],
      ])
      expect(items.every((i) => i.fromRecipeIds.includes(r.id))).toBe(true)
      expect((await owner.post(`${recipes}/${r.id}/to-list`, { listId: list.id, servings: 4, ingredients: [42] })).status).toBe(400)
   })

   it('parses lines for the form preview', async () => {
      const { owner, recipes } = await home()
      const res = await owner.post(`${recipes}/parse`, { lines: ['2 EL Zucker'] })
      expect(res.body).toEqual([{ text: '2 EL Zucker', quantity: 2, unit: 'tbsp', name: 'Zucker', note: '' }])
   })

   it('rights and validation: delete is for the creator or admins; 400 for bad input; 404 for strangers', async () => {
      const { owner, recipes, join } = await home()
      const member = await join('member')
      const r = (await owner.post(recipes, lasagne)).body
      expect((await owner.post(recipes, { title: '' })).status).toBe(400)
      expect((await owner.post(recipes, { title: 'X', sourceUrl: 'javascript:alert(1)' })).status).toBe(400)
      expect((await owner.put(`${recipes}/${r.id}/rating`, { stars: 6 })).status).toBe(400)
      expect((await member.put(`${recipes}/${r.id}`, { ...lasagne, title: 'Lasagne al forno' })).body.title).toBe('Lasagne al forno')
      expect((await member.del(`${recipes}/${r.id}`)).status).toBe(403)
      const stranger = as((await signedInUser(app, 'Eve')).cookie)
      expect((await stranger.get(`${recipes}/${r.id}`)).status).toBe(404)
      expect((await stranger.get(recipes)).status).toBe(404)
      expect((await owner.del(`${recipes}/${r.id}`)).status).toBe(204)
      expect((await owner.get(`${recipes}/${r.id}`)).status).toBe(404)
   })

   it('deleting the household removes its recipes and photos', async () => {
      const { owner, recipes, hid } = await home()
      const r = (await owner.post(recipes, lasagne)).body
      const url = (await owner.photo(`${recipes}/${r.id}/image`, await png())).body.imageUrl
      expect((await owner.del(`/api/households/${hid}`)).status).toBe(204)
      expect(await Recipe.countDocuments({ householdId: hid })).toBe(0)
      expect(existsSync(fileOf(url))).toBe(false)
   })
})
