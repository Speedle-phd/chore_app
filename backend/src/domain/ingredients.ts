import { parseUnit, type UnitId } from './units'

/**
 * Reads a free ingredient line (German or English) into amount, unit, name and
 * note, e.g. "1 Dose (400 g) gehackte Tomaten" → 1 can · "gehackte Tomaten" · "400 g".
 * Pure; unknown shapes keep the whole line as the name. App choices:
 * a range ("2–3") counts as its upper end (enough to buy); "etwas / some / nach Belieben" become notes.
 */

export type Ingredient = {
   /** The line as written (kept for display and re-parsing). */
   text: string
   quantity: number | null
   unit: UnitId | null
   name: string
   note: string
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅕': 0.2 }
const FRACTION_CHARS = Object.keys(FRACTIONS).join('')
// Mixed numbers and fractions first, or "1 1/2" would stop at "1".
const NUMBER = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?|[${FRACTION_CHARS}])`
const QUANTITY = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|—|bis|to)\\s*(${NUMBER}))?`, 'i')
const ARTICLE = /^(?:a|an|one|ein|eine|einen)\s+/i
const VAGUE = /^(?:etwas|ein wenig|einige|some|a little|a few|nach belieben|to taste)\s+/i
const VAGUE_TAIL = /[,\s]+(?:nach belieben|nach geschmack|to taste|optional)\s*$/i

function toNumber(text: string): number {
   const t = text.trim().replace(',', '.')
   const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
   if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
   const frac = /^(\d+)\/(\d+)$/.exec(t)
   if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : NaN
   const glued = new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*([${FRACTION_CHARS}])$`).exec(t)
   if (glued) return Number(glued[1] ?? 0) + (FRACTIONS[glued[2] ?? ''] ?? 0)
   return Number(t)
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')

export function parseIngredient(line: string): Ingredient {
   const text = clean(line)
   let rest = text
   const notes: string[] = []

   // Notes in parentheses, anywhere: "(400 g)", "(gewürfelt)".
   rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
      if (inner.trim()) notes.push(inner.trim())
      return ' '
   })
   rest = clean(rest)
   const tail = VAGUE_TAIL.exec(rest)
   if (tail) {
      notes.push(clean(tail[0]))
      rest = clean(rest.slice(0, tail.index))
   }
   const vague = VAGUE.exec(rest)
   if (vague) {
      notes.unshift(clean(vague[0]))
      rest = rest.slice(vague[0].length)
   }

   let quantity: number | null = null
   const q = QUANTITY.exec(rest)
   if (q?.[1]) {
      const value = toNumber(q[2] ?? q[1])
      if (Number.isFinite(value) && value > 0) {
         quantity = value
         rest = rest.slice(q[0].length)
      }
   } else {
      const article = ARTICLE.exec(rest)
      // "a pinch of salt", "eine Prise Salz": the article counts as 1 only before a unit.
      if (article && parseUnit(rest.slice(article[0].length).split(/\s+/)[0] ?? '')) {
         quantity = 1
         rest = rest.slice(article[0].length)
      }
   }

   let unit: UnitId | null = null
   const unitMatch = /^\s*([A-Za-zÄÖÜäöüß]+\.?)(?=\s|$)/.exec(rest)
   const candidate = unitMatch?.[1] ? parseUnit(unitMatch[1]) : null
   // Only take the word as a unit when something is left as the name ("2 l Milch", not just "Dose").
   if (candidate && unitMatch && clean(rest.slice(unitMatch[0].length))) {
      unit = candidate
      rest = rest.slice(unitMatch[0].length)
   }
   rest = clean(rest).replace(/^(?:of|von)\s+/i, '')

   // "Zwiebeln, fein gewürfelt": after the first comma is a note.
   const comma = rest.indexOf(',')
   if (comma > 0) {
      notes.push(clean(rest.slice(comma + 1)))
      rest = rest.slice(0, comma)
   }
   const name = clean(rest)
   return name ? { text, quantity, unit, name, note: notes.filter(Boolean).join(', ') } : { text, quantity: null, unit: null, name: text, note: '' }
}
