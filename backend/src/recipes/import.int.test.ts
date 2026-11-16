import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

/** A pretend recipe website on localhost. */
let site: http.Server
let origin = ''
let png: Buffer
const recipePage = () => `<!doctype html><html><head><title>Spätzle</title>
<script type="application/ld+json">${JSON.stringify({
   '@context': 'https://schema.org',
   '@type': 'Recipe',
   name: 'Käsespätzle',
   recipeYield: '4 Portionen',
   prepTime: 'PT20M',
   cookTime: 'PT25M',
   recipeIngredient: ['500 g Mehl', '5 Eier', '200 g Bergkäse'],
   recipeInstructions: [{ '@type': 'HowToStep', text: 'Teig rühren.' }, { '@type': 'HowToStep', text: 'Schaben.' }],
   keywords: 'Spätzle, vegetarisch',
   image: '/img.png',
})}</script></head><body></body></html>`

const recipeDir = mkdtempSync(path.join(tmpdir(), 'recipes-import-'))
const env = loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused', RECIPE_UPLOAD_DIR: recipeDir })
const deps = { sendMail: async () => undefined, isBreached: async () => false, rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 } }
// The test app may reach loopback only (the test site); everything else follows the real rules.
const app = createApp(env, { ...deps, allowFetchAddress: (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1' })
// The real rules: loopback is refused.
const strictApp = createApp(env, deps)

beforeAll(async () => {
   png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#88aa55' } }).png().toBuffer()
   site = http.createServer((req, res) => {
      if (req.url === '/recipe') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(recipePage())
      if (req.url === '/gzipped') {
         return void res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(zlib.gzipSync(recipePage()))
      }
      if (req.url === '/moved') return void res.writeHead(301, { location: '/recipe' }).end()
      if (req.url === '/to-private') return void res.writeHead(302, { location: 'http://10.0.0.1/recipe' }).end()
      if (req.url === '/img.png') return void res.writeHead(200, { 'content-type': 'image/png' }).end(png)
      if (req.url === '/text') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('just text')
      if (req.url === '/nothing') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body>no recipe</body></html>')
      // ~4 MB of HTML once unpacked, from a small gzip: must be cut off.
      if (req.url === '/bomb') {
         return void res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(zlib.gzipSync(Buffer.alloc(4 * 1024 * 1024, 'a')))
      }
      res.writeHead(404).end()
   })
   await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => {
   await new Promise((resolve) => site.close(resolve))
   rmSync(recipeDir, { recursive: true, force: true })
})

const H = { 'X-Requested-With': 'fetch' }
async function home(target = app) {
   const user = await signedInUser(target, 'Ada')
   const post = (url: string, body: object) => request(target).post(url).set(H).set('Cookie', user.cookie).send(body)
   const put = (url: string, body: object) => request(target).put(url).set(H).set('Cookie', user.cookie).send(body)
   const hid: string = (await post('/api/households', { name: 'Home' })).body.id
   return { post, put, recipes: `/api/households/${hid}/recipes` }
}

describe('recipe import', () => {
   it('reads a recipe page into a draft (nothing saved), also gzipped and after a redirect', async () => {
      const { post, recipes } = await home()
      const res = await post(`${recipes}/import`, { url: `${origin}/recipe` })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
         title: 'Käsespätzle',
         servings: 4,
         prepMinutes: 20,
         cookMinutes: 25,
         ingredients: ['500 g Mehl', '5 Eier', '200 g Bergkäse'],
         steps: ['Teig rühren.', 'Schaben.'],
         // Only predefined tags: "Spätzle" isn't one.
         tags: ['Vegetarisch'],
         imageUrl: `${origin}/img.png`,
         sourceUrl: `${origin}/recipe`,
         complete: true,
      })
      expect((await post(`${recipes}/import`, { url: `${origin}/gzipped` })).body.title).toBe('Käsespätzle')
      const moved = (await post(`${recipes}/import`, { url: `${origin}/moved` })).body
      expect([moved.title, moved.sourceUrl]).toEqual(['Käsespätzle', `${origin}/recipe`])
   })

   it('saves the photo from the page after the recipe is saved', async () => {
      const { post, put, recipes } = await home()
      const draft = (await post(`${recipes}/import`, { url: `${origin}/recipe` })).body
      const saved = (await post(recipes, { title: draft.title, ingredients: draft.ingredients, sourceUrl: draft.sourceUrl })).body
      const withPhoto = await put(`${recipes}/${saved.id}/image-from-url`, { url: draft.imageUrl })
      expect(withPhoto.status).toBe(200)
      expect(withPhoto.body.imageUrl).toMatch(/^\/uploads\/recipes\/[\w-]+\.webp$/)
      expect((await put(`${recipes}/${saved.id}/image-from-url`, { url: `${origin}/recipe` })).body.message).toBe('That link isn’t a photo.')
   })

   it.each([
      ['/text', 'That link isn’t a web page.'],
      ['/nothing', 'No recipe found on that page. You can still enter it by hand.'],
      ['/to-private', 'That address isn’t reachable from here.'],
      ['/bomb', 'That page is too large.'],
      ['/missing', 'The website answered with an error (404).'],
   ])('%s → 400 “%s”', async (pathName, message) => {
      const { post, recipes } = await home()
      const res = await post(`${recipes}/import`, { url: `${origin}${pathName}` })
      expect([res.status, res.body.message]).toEqual([400, message])
   })

   it('with the real rules, local and private addresses are refused', async () => {
      const { post, recipes } = await home(strictApp)
      for (const url of [`${origin}/recipe`, 'http://localhost/recipe', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x', 'http://10.0.0.1/']) {
         const res = await post(`${recipes}/import`, { url })
         expect([url, res.status, res.body.message]).toEqual([url, 400, expect.stringMatching(/isn’t reachable from here|standard web ports/)])
      }
      expect((await post(`${recipes}/import`, { url: 'file:///etc/passwd' })).status).toBe(400)
      expect((await post(`${recipes}/import`, { url: 'ftp://example.com/x' })).status).toBe(400)
   })
})
