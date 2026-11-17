import { Baby, Backpack, Cable, FileText, HeartPulse, Package, Sandwich, Shirt, SprayCan, type LucideIcon } from 'lucide-react'

/** Mirror of backend/src/domain/packing.ts PACKING_SECTIONS (the server validates); order = display order. */
export const SECTIONS = {
   documents: { label: 'Documents', Icon: FileText },
   clothes: { label: 'Clothes', Icon: Shirt },
   toiletries: { label: 'Toiletries', Icon: SprayCan },
   health: { label: 'Health', Icon: HeartPulse },
   electronics: { label: 'Electronics', Icon: Cable },
   gear: { label: 'Gear', Icon: Backpack },
   kids: { label: 'Kids', Icon: Baby },
   food: { label: 'Food', Icon: Sandwich },
   other: { label: 'Other', Icon: Package },
} as const satisfies Record<string, { label: string; Icon: LucideIcon }>

export type PackingSection = keyof typeof SECTIONS
export const SECTION_IDS = Object.keys(SECTIONS) as PackingSection[]

/** Items grouped by section in display order; empty sections left out. */
export function bySection<T extends { section: PackingSection }>(items: readonly T[]) {
   return SECTION_IDS.map((section) => ({ section, items: items.filter((i) => i.section === section) })).filter((g) => g.items.length > 0)
}
