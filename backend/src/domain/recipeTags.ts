/**
 * Predefined recipe tags (user wish 2026-11-15: pick from a list rather than type).
 * German, like ingredients and units; group labels are UI text (English).
 * Own tags stay possible (app choice: a closed list feels limiting for the odd
 * family tag), but imports from websites only keep tags from this list.
 */
export const RECIPE_TAG_GROUPS = [
   { id: 'course', label: 'Meal', tags: ['Frühstück', 'Brunch', 'Mittagessen', 'Abendessen', 'Snack', 'Vorspeise', 'Hauptgericht', 'Beilage', 'Dessert', 'Kuchen & Gebäck', 'Brot & Brötchen', 'Getränk'] },
   { id: 'diet', label: 'Diet', tags: ['Vegetarisch', 'Vegan', 'Glutenfrei', 'Laktosefrei', 'Low Carb', 'Proteinreich', 'Kalorienarm', 'Ohne Zucker'] },
   { id: 'main', label: 'Main ingredient', tags: ['Fleisch', 'Geflügel', 'Fisch', 'Meeresfrüchte', 'Nudeln', 'Reis', 'Kartoffeln', 'Gemüse', 'Hülsenfrüchte', 'Eier', 'Käse', 'Pilze'] },
   { id: 'dish', label: 'Dish', tags: ['Suppe', 'Eintopf', 'Salat', 'Auflauf', 'Pfannengericht', 'Curry', 'Pizza', 'Burger', 'Bowl', 'Sandwich', 'Soße & Dip'] },
   { id: 'cuisine', label: 'Cuisine', tags: ['Deutsch', 'Italienisch', 'Französisch', 'Spanisch', 'Griechisch', 'Türkisch', 'Orientalisch', 'Indisch', 'Asiatisch', 'Chinesisch', 'Japanisch', 'Thailändisch', 'Mexikanisch', 'Amerikanisch'] },
   { id: 'effort', label: 'Effort', tags: ['Schnell', 'Einfach', 'Für Gäste', 'Meal Prep', 'Ofengericht', 'One Pot', 'Grillen', 'Ohne Kochen', 'Kinderfreundlich'] },
   { id: 'occasion', label: 'Occasion & season', tags: ['Party', 'Picknick', 'Weihnachten', 'Ostern', 'Frühling', 'Sommer', 'Herbst', 'Winter'] },
] as const

export const RECIPE_TAGS: readonly string[] = RECIPE_TAG_GROUPS.flatMap((g) => g.tags)

/** Other spellings (lowercase) of catalog tags, mostly what recipe websites use in their keywords. */
const SYNONYMS: Record<string, string> = {
   vegetarian: 'Vegetarisch', vegetarische: 'Vegetarisch', veggie: 'Vegetarisch', vegane: 'Vegan',
   'gluten-free': 'Glutenfrei', glutenfreie: 'Glutenfrei', 'dairy-free': 'Laktosefrei', laktosefreie: 'Laktosefrei', 'low-carb': 'Low Carb',
   breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', abendbrot: 'Abendessen', hauptspeise: 'Hauptgericht', 'main course': 'Hauptgericht',
   vorspeisen: 'Vorspeise', starter: 'Vorspeise', appetizer: 'Vorspeise', beilagen: 'Beilage', 'side dish': 'Beilage', nachtisch: 'Dessert', nachspeise: 'Dessert',
   desserts: 'Dessert', kuchen: 'Kuchen & Gebäck', gebäck: 'Kuchen & Gebäck', backen: 'Kuchen & Gebäck', cake: 'Kuchen & Gebäck', baking: 'Kuchen & Gebäck',
   brot: 'Brot & Brötchen', bread: 'Brot & Brötchen', getränke: 'Getränk', drinks: 'Getränk', snacks: 'Snack', fingerfood: 'Snack',
   rind: 'Fleisch', rindfleisch: 'Fleisch', schwein: 'Fleisch', schweinefleisch: 'Fleisch', beef: 'Fleisch', pork: 'Fleisch', meat: 'Fleisch',
   hähnchen: 'Geflügel', huhn: 'Geflügel', pute: 'Geflügel', chicken: 'Geflügel', poultry: 'Geflügel', fish: 'Fisch', seafood: 'Meeresfrüchte',
   pasta: 'Nudeln', nudel: 'Nudeln', rice: 'Reis', kartoffel: 'Kartoffeln', potatoes: 'Kartoffeln', vegetables: 'Gemüse',
   linsen: 'Hülsenfrüchte', bohnen: 'Hülsenfrüchte', kichererbsen: 'Hülsenfrüchte', legumes: 'Hülsenfrüchte', ei: 'Eier', eggs: 'Eier', cheese: 'Käse', mushrooms: 'Pilze',
   suppen: 'Suppe', soup: 'Suppe', eintöpfe: 'Eintopf', stew: 'Eintopf', salate: 'Salat', salad: 'Salat', aufläufe: 'Auflauf', gratin: 'Auflauf', casserole: 'Auflauf',
   saucen: 'Soße & Dip', sauce: 'Soße & Dip', soßen: 'Soße & Dip', dip: 'Soße & Dip',
   deutsche: 'Deutsch', german: 'Deutsch', italien: 'Italienisch', italian: 'Italienisch', french: 'Französisch', spanish: 'Spanisch', greek: 'Griechisch',
   turkish: 'Türkisch', indian: 'Indisch', asian: 'Asiatisch', asien: 'Asiatisch', chinese: 'Chinesisch', japanese: 'Japanisch', thai: 'Thailändisch',
   mexican: 'Mexikanisch', american: 'Amerikanisch', usa: 'Amerikanisch',
   quick: 'Schnell', 'schnell & einfach': 'Schnell', 'schnelle küche': 'Schnell', easy: 'Einfach', simple: 'Einfach', 'einfache küche': 'Einfach',
   gäste: 'Für Gäste', 'meal-prep': 'Meal Prep', backofen: 'Ofengericht', ofen: 'Ofengericht', 'one-pot': 'One Pot', grill: 'Grillen', bbq: 'Grillen', barbecue: 'Grillen',
   kinder: 'Kinderfreundlich', kids: 'Kinderfreundlich', 'für kinder': 'Kinderfreundlich', christmas: 'Weihnachten', easter: 'Ostern',
   spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', fall: 'Herbst',
}

const byLower = new Map<string, string>(RECIPE_TAGS.map((t) => [t.toLowerCase(), t]))

const clean = (tag: string) => tag.trim().replace(/\s+/g, ' ')

/** The catalog spelling of a tag (any case, or a known synonym), or null if it isn't in the catalog. */
export function catalogTag(tag: string): string | null {
   const key = clean(tag).toLowerCase()
   return byLower.get(key) ?? SYNONYMS[key] ?? null
}

/** Tags as stored: catalog spelling where known, own tags trimmed; no duplicates (any case), no empties. */
export function normalizeTags(tags: string[]): string[] {
   const seen = new Set<string>()
   const out: string[] = []
   for (const raw of tags) {
      const tag = catalogTag(raw) ?? clean(raw)
      const key = tag.toLowerCase()
      if (!tag || seen.has(key)) continue
      seen.add(key)
      out.push(tag)
   }
   return out
}

/** Website keywords → catalog tags only (unknown ones are dropped). */
export const catalogTagsOnly = (tags: string[]) => normalizeTags(tags.flatMap((t) => catalogTag(t) ?? []))
