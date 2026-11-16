/**
 * Categories every household starts with (renameable, reorderable, deletable).
 * `key` links them to the grocery catalog's defaults; order = a typical walk
 * through a German supermarket. English names to match the UI. App choice.
 */
export const DEFAULT_CATEGORIES = [
   { key: 'produce', name: 'Fruit & vegetables', icon: 'apple' },
   { key: 'bakery', name: 'Bakery', icon: 'croissant' },
   { key: 'fridge', name: 'Fridge', icon: 'milk' },
   { key: 'meat', name: 'Meat & fish', icon: 'beef' },
   { key: 'freezer', name: 'Freezer', icon: 'snowflake' },
   { key: 'pantry', name: 'Pantry', icon: 'wheat' },
   { key: 'drinks', name: 'Drinks', icon: 'cup-soda' },
   { key: 'household', name: 'Household', icon: 'spray-can' },
   { key: 'drugstore', name: 'Drugstore', icon: 'pill' },
   { key: 'other', name: 'Other', icon: 'package' },
] as const

export type CategoryKey = (typeof DEFAULT_CATEGORIES)[number]['key']

/** Icons a category can have (lucide names; the client maps them). */
export const CATEGORY_ICONS = [
   'apple', 'croissant', 'milk', 'beef', 'fish', 'snowflake', 'wheat', 'cup-soda', 'wine', 'coffee', 'candy',
   'spray-can', 'pill', 'baby', 'dog', 'flower', 'shirt', 'hammer', 'package', 'shopping-basket',
] as const
export type CategoryIcon = (typeof CATEGORY_ICONS)[number]
