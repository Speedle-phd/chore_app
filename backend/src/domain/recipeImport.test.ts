import { describe, expect, it } from 'vitest'
import { isBlockedAddress } from '../media/safeFetch'
import { durationMinutes, extractRecipe, plainText, yieldServings } from './recipeImport'

const page = (head: string) => `<!doctype html><html><head>${head}</head><body><h1>x</h1></body></html>`
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe('extractRecipe', () => {
   it('reads a typical German recipe page (@graph, HowToSection, entities, durations)', () => {
      const html = page(
         ld({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Kochseite' }) +
            ld({
               '@context': 'https://schema.org',
               '@graph': [
                  { '@type': 'BreadcrumbList' },
                  {
                     '@type': ['Recipe', 'NewsArticle'],
                     name: 'Käsespätzle &amp; R&ouml;stzwiebeln',
                     description: '<p>Allgäuer Klassiker</p>',
                     recipeYield: ['4', '4 Portionen'],
                     prepTime: 'PT20M',
                     cookTime: 'PT1H10M',
                     recipeIngredient: ['500 g Mehl', '5 Eier', '200&nbsp;g Bergkäse, gerieben', '<b>2</b> Zwiebeln'],
                     recipeInstructions: [
                        { '@type': 'HowToSection', name: 'Teig', itemListElement: [{ '@type': 'HowToStep', text: 'Mehl und Eier verrühren.' }] },
                        { '@type': 'HowToStep', text: 'Spätzle schaben.' },
                        'Mit Käse schichten.',
                     ],
                     keywords: 'Spätzle, Käse, vegetarisch',
                     recipeCategory: 'Hauptgericht',
                     image: [{ '@type': 'ImageObject', url: '/img/spaetzle.jpg' }],
                  },
               ],
            }),
      )
      expect(extractRecipe(html, 'https://koch.example/rezepte/kaesespaetzle')).toEqual({
         title: 'Käsespätzle & Röstzwiebeln',
         description: 'Allgäuer Klassiker',
         servings: 4,
         prepMinutes: 20,
         cookMinutes: 70,
         ingredients: ['500 g Mehl', '5 Eier', '200 g Bergkäse, gerieben', '2 Zwiebeln'],
         steps: ['Mehl und Eier verrühren.', 'Spätzle schaben.', 'Mit Käse schichten.'],
         tags: ['Käse', 'Vegetarisch', 'Hauptgericht'],
         imageUrl: 'https://koch.example/img/spaetzle.jpg',
         sourceUrl: 'https://koch.example/rezepte/kaesespaetzle',
         complete: true,
      })
   })

   it('reads instructions as one text block and only a total time', () => {
      const html = page(ld({ '@type': 'Recipe', name: 'Soup', recipeInstructions: 'Chop.\nBoil.\n\nServe.', totalTime: 'PT45M', recipeYield: 2 }))
      expect(extractRecipe(html, 'https://x.example/soup')).toMatchObject({ steps: ['Chop.', 'Boil.', 'Serve.'], prepMinutes: null, cookMinutes: 45, servings: 2 })
   })

   it('skips broken JSON-LD and falls back to OpenGraph without recipe data', () => {
      const html = page(
         '<script type="application/ld+json">{ broken</script>' +
            '<meta property="og:title" content="Omas Apfelkuchen"><meta property="og:image" content="https://cdn.example/a.jpg"><title>ignored</title>',
      )
      expect(extractRecipe(html, 'https://x.example/k')).toMatchObject({ title: 'Omas Apfelkuchen', imageUrl: 'https://cdn.example/a.jpg', ingredients: [], complete: false })
   })

   it('nothing usable → null; non-http images are dropped', () => {
      expect(extractRecipe('<html><body>hi</body></html>', 'https://x.example')).toBeNull()
      expect(extractRecipe(page(ld({ '@type': 'Recipe', name: 'X', image: 'javascript:alert(1)' })), 'https://x.example')?.imageUrl).toBeNull()
   })
})

describe('helpers', () => {
   it.each([
      ['PT1H30M', 90],
      ['PT90M', 90],
      ['P0DT45M', 45],
      ['PT0S', null],
      ['P', null],
      ['45 minutes', null],
      [45, null],
   ])('durationMinutes(%j) → %s', (value, minutes) => {
      expect(durationMinutes(value)).toBe(minutes)
   })
   it.each([
      [4, 4],
      ['6 Portionen', 6],
      [['', '2 servings'], 2],
      ['ein Blech', null],
      ['500', null],
   ])('yieldServings(%j) → %s', (value, servings) => {
      expect(yieldServings(value)).toBe(servings)
   })
   it('plainText decodes entities and drops tags', () => {
      expect(plainText('<p>Fish &amp; chips&#x21; &frac12; cup</p>')).toBe('Fish & chips! ½ cup')
   })
})

describe('isBlockedAddress (SSRF)', () => {
   it.each([
      ['127.0.0.1', true],
      ['10.1.2.3', true],
      ['172.20.0.5', true],
      ['192.168.1.1', true],
      ['169.254.169.254', true],
      ['100.64.0.1', true],
      ['0.0.0.0', true],
      ['::1', true],
      ['fd12::1', true],
      ['fe80::1', true],
      ['::ffff:127.0.0.1', true],
      ['::ffff:10.0.0.1', true],
      ['not-an-ip', true],
      ['93.184.215.14', false],
      ['2606:2800:21f:cb07:6820:80da:af6b:8b2c', false],
      ['::ffff:93.184.215.14', false],
   ])('%s → blocked %s', (address, expected) => {
      expect(isBlockedAddress(address)).toBe(expected)
   })
})
