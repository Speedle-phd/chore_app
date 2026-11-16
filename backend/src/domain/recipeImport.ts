import { catalogTagsOnly } from './recipeTags'

/**
 * Reads a recipe from a web page's schema.org data (JSON-LD `Recipe`), which most
 * recipe sites publish. Pure: HTML text and the page URL in, a draft out.
 * Fallback without recipe data: the page title and image (OpenGraph), rest manual.
 */

export type RecipeImportDraft = {
   title: string
   description: string
   servings: number | null
   prepMinutes: number | null
   cookMinutes: number | null
   ingredients: string[]
   steps: string[]
   tags: string[]
   imageUrl: string | null
   sourceUrl: string
   /** False: no recipe data found, only the title/photo were taken. */
   complete: boolean
}

const LIMITS = { title: 120, description: 2000, line: 200, step: 4000, lines: 100, tags: 20, tag: 30 }

// <script> content is raw text up to the first "</script" (HTML spec), so this is exact.
const LD_JSON = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi
const META = /<meta\b[^>]*>/gi

/** Named entities seen on recipe pages (case matters: &Auml; is Ä); numeric ones are decoded generally. */
const ENTITIES: Record<string, string> = {
   amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', times: '×',
   auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', agrave: 'à',
   ccedil: 'ç', ntilde: 'ñ', euro: '€', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
   ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»', middot: '·',
}

/** Entities decoded, tags removed, whitespace collapsed. */
export function plainText(value: unknown): string {
   if (typeof value !== 'string') return ''
   return value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
         if (code[0] === '#') {
            const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
         }
         return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? m
      })
      .replace(/[ \t\f\v ]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim()
}

/** ISO 8601 duration ("PT1H30M", "P0DT45M", "PT90M") → minutes; null if unreadable. */
export function durationMinutes(value: unknown): number | null {
   if (typeof value !== 'string') return null
   const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value.trim())
   if (!m || value.trim().toUpperCase() === 'P' || value.trim().toUpperCase() === 'PT') return null
   const [, d, h, min, s] = m
   const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(s ?? 0) / 60
   return Number.isFinite(total) && total > 0 ? Math.min(Math.round(total), 2880) : null
}

/** recipeYield: 4, "4", "4 Portionen", ["4", "4 servings"] → 4. */
export function yieldServings(value: unknown): number | null {
   const first = Array.isArray(value) ? value.find((v) => /\d/.test(String(v))) : value
   const n = /\d+/.exec(String(first ?? ''))?.[0]
   const servings = n ? Number(n) : NaN
   return servings >= 1 && servings <= 100 ? servings : null
}

const isRecipe = (node: unknown): node is Record<string, unknown> => {
   if (!node || typeof node !== 'object') return false
   const type = (node as Record<string, unknown>)['@type']
   return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))
}

/** First Recipe node anywhere in the JSON-LD (arrays, @graph, nested). */
function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
   if (depth > 6 || !node || typeof node !== 'object') return null
   if (isRecipe(node)) return node
   const children = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>)
   for (const child of children) {
      const found = findRecipe(child, depth + 1)
      if (found) return found
   }
   return null
}

/** recipeInstructions: text, list of texts, HowToStep, HowToSection (nested) → steps. */
function steps(value: unknown, depth = 0): string[] {
   if (depth > 4 || value === null || value === undefined) return []
   if (typeof value === 'string') return plainText(value).split(/\n+/).map((s) => s.trim()).filter(Boolean)
   if (Array.isArray(value)) return value.flatMap((v) => steps(v, depth + 1))
   if (typeof value === 'object') {
      const o = value as Record<string, unknown>
      if (o.itemListElement) return steps(o.itemListElement, depth + 1)
      const text = plainText(o.text) || plainText(o.name)
      return text ? [text] : []
   }
   return []
}

function imageUrl(value: unknown, base: string): string | null {
   const first = Array.isArray(value) ? value[0] : value
   const raw = typeof first === 'string' ? first : first && typeof first === 'object' ? (first as Record<string, unknown>).url : null
   if (typeof raw !== 'string' || !raw.trim()) return null
   try {
      const url = new URL(raw.trim(), base)
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
   } catch {
      return null
   }
}

const words = (value: unknown): string[] =>
   (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []).map((v) => plainText(String(v)))

function metaContent(html: string, property: string): string | null {
   for (const tag of html.match(META) ?? []) {
      const prop = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
      if (prop?.toLowerCase() !== property) continue
      const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]
      if (content) return plainText(content)
   }
   return null
}

export function extractRecipe(html: string, pageUrl: string): RecipeImportDraft | null {
   let recipe: Record<string, unknown> | null = null
   for (const match of html.matchAll(LD_JSON)) {
      try {
         // Some sites leave raw control characters in strings; JSON doesn't allow them.
         recipe = findRecipe(JSON.parse((match[1] ?? '').replace(/[\u0000-\u0019]+/g, ' ')))
      } catch {
         continue
      }
      if (recipe) break
   }

   if (!recipe) {
      const title = metaContent(html, 'og:title') ?? plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1])
      if (!title) return null
      return {
         title: title.slice(0, LIMITS.title),
         description: (metaContent(html, 'og:description') ?? '').slice(0, LIMITS.description),
         servings: null,
         prepMinutes: null,
         cookMinutes: null,
         ingredients: [],
         steps: [],
         tags: [],
         imageUrl: imageUrl(metaContent(html, 'og:image'), pageUrl),
         sourceUrl: pageUrl,
         complete: false,
      }
   }

   const prep = durationMinutes(recipe.prepTime)
   const cook = durationMinutes(recipe.cookTime)
   const total = durationMinutes(recipe.totalTime)
   const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map((i) => plainText(i).replace(/\n/g, ' '))
      .filter(Boolean)
      .map((i) => i.slice(0, LIMITS.line))
      .slice(0, LIMITS.lines)
   // Only tags from the household's predefined list; a site's other keywords are dropped.
   const tags = catalogTagsOnly([...words(recipe.keywords), ...words(recipe.recipeCategory), ...words(recipe.recipeCuisine)])
      .filter((t) => t.length <= LIMITS.tag)
      .slice(0, LIMITS.tags)

   return {
      title: (plainText(recipe.name) || metaContent(html, 'og:title') || 'Imported recipe').slice(0, LIMITS.title),
      description: plainText(recipe.description).slice(0, LIMITS.description),
      servings: yieldServings(recipe.recipeYield),
      prepMinutes: prep,
      // Only a total given: count it as cooking time.
      cookMinutes: cook ?? (prep === null ? total : total !== null && total > prep ? total - prep : null),
      ingredients,
      steps: steps(recipe.recipeInstructions).map((s) => s.slice(0, LIMITS.step)).slice(0, LIMITS.lines),
      tags,
      imageUrl: imageUrl(recipe.image, pageUrl) ?? imageUrl(metaContent(html, 'og:image'), pageUrl),
      sourceUrl: pageUrl,
      complete: true,
   }
}
