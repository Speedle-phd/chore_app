import request from 'supertest'
import { beforeAll, describe, expect, it, vi, afterAll } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

// "Now" is Wednesday 25 March 2026, 12:00 in Berlin. Only Date is faked.
const NOW = new Date('2026-03-25T11:00:00Z')
const TZ = 'Europe/Berlin'

let app: ReturnType<typeof createApp>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: NOW })
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused', RECIPE_UPLOAD_DIR: 'unused' }),
      { sendMail: async () => undefined, isBreached: async () => false, rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 } },
   )
})
afterAll(() => vi.useRealTimers())

const H = { 'X-Requested-With': 'fetch' }
async function home() {
   const user = await signedInUser(app, 'Ada')
   const c = user.cookie
   const api = {
      get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', c),
      post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', c).send(body),
      put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', c).send(body),
      del: (url: string) => request(app).delete(url).set(H).set('Cookie', c),
   }
   const hid: string = (await api.post('/api/households', { name: 'Home' })).body.id
   const base = `/api/households/${hid}`
   const recipe = async (title: string, servings: number, ingredients: string[]) => (await api.post(`${base}/recipes`, { title, servings, ingredients })).body.id as string
   const meal = (title: string, date: string, meal: { recipeId: string | null; servings: number } | null) =>
      api.post(`${base}/calendar-items`, { kind: 'meal', title, allDay: false, start: `${date}T18:30`, end: `${date}T19:30`, timezone: TZ, meal })
   return { api, base, recipe, meal }
}

describe('meal plan', () => {
   it('adds up what the week’s meals need, scaled to each meal’s servings', async () => {
      const { api, base, recipe, meal } = await home()
      const lasagne = await recipe('Lasagne', 4, ['500 g Hackfleisch', '250 g Lasagneplatten'])
      const bolo = await recipe('Bolognese', 2, ['250 g Hackfleisch', '1 Zwiebel'])
      expect((await meal('Lasagne', '2026-03-23', { recipeId: lasagne, servings: 6 })).status).toBe(201)
      await meal('Bolognese', '2026-03-25', { recipeId: bolo, servings: 2 })
      await meal('Pizza out', '2026-03-27', { recipeId: null, servings: 3 })
      await meal('Lasagne', '2026-04-01', { recipeId: lasagne, servings: 4 })

      const res = await api.get(`${base}/recipes/meal-ingredients`, { from: '2026-03-23', to: '2026-03-30', tz: TZ })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({
         meals: 3,
         withoutRecipe: 1,
         items: [
            // 500 g × 6/4 = 750 g, plus 250 g = 1 kg
            { name: 'Hackfleisch', quantity: 1, unit: 'kg', recipeIds: [lasagne, bolo], recipes: ['Lasagne', 'Bolognese'] },
            { name: 'Lasagneplatten', quantity: 375, unit: 'g', recipeIds: [lasagne], recipes: ['Lasagne'] },
            { name: 'Zwiebel', quantity: 1, unit: null, recipeIds: [bolo], recipes: ['Bolognese'] },
         ],
      })

      const listed = (await api.get(`${base}/calendar`, { from: '2026-03-23T00:00:00+01:00', to: '2026-03-30T00:00:00+02:00', tz: TZ, kinds: 'meal' })).body
      expect(listed.map((i: { title: string; meal: unknown }) => [i.title, i.meal])).toEqual([
         ['Lasagne', { recipeId: lasagne, servings: 6 }],
         ['Bolognese', { recipeId: bolo, servings: 2 }],
         ['Pizza out', { recipeId: null, servings: 3 }],
      ])
   })

   it('a replace without `meal` keeps the recipe link; validation', async () => {
      const { api, base, recipe, meal } = await home()
      const lasagne = await recipe('Lasagne', 4, ['500 g Hackfleisch'])
      const item = (await meal('Lasagne', '2026-03-23', { recipeId: lasagne, servings: 6 })).body
      const replaced = await api.put(`${base}/calendar-items/${item.id}`, {
         kind: 'meal',
         title: 'Lasagne (Oma)',
         allDay: false,
         start: '2026-03-23T19:00',
         end: '2026-03-23T20:00',
         timezone: TZ,
      })
      expect(replaced.body).toMatchObject({ title: 'Lasagne (Oma)', meal: { recipeId: lasagne, servings: 6 } })

      expect((await api.post(`${base}/calendar-items`, { kind: 'event', title: 'x', allDay: true, start: '2026-03-23', end: '2026-03-24', timezone: TZ, meal: { recipeId: lasagne, servings: 2 } })).status).toBe(400)
      expect((await meal('Ghost', '2026-03-23', { recipeId: '000000000000000000000000', servings: 2 })).status).toBe(400)
      expect((await api.get(`${base}/recipes/meal-ingredients`, { from: '2026-03-23', to: '2026-06-30', tz: TZ })).status).toBe(400)
   })

   it('deleting a recipe keeps planned meals as free text', async () => {
      const { api, base, recipe, meal } = await home()
      const lasagne = await recipe('Lasagne', 4, ['500 g Hackfleisch'])
      const item = (await meal('Lasagne', '2026-03-23', { recipeId: lasagne, servings: 6 })).body
      expect((await api.del(`${base}/recipes/${lasagne}`)).status).toBe(204)
      expect((await api.get(`${base}/calendar-items/${item.id}`)).body).toMatchObject({ title: 'Lasagne', meal: { recipeId: null, servings: 6 } })
   })

   it('is a 404 for strangers', async () => {
      const { base } = await home()
      const stranger = await signedInUser(app, 'Eve')
      const res = await request(app).get(`${base}/recipes/meal-ingredients`).query({ from: '2026-03-23', to: '2026-03-30', tz: TZ }).set('Cookie', stranger.cookie)
      expect(res.status).toBe(404)
   })
})
