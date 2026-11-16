import type { CalendarKind } from './calendarApi'

/** Labels and theme colour per kind; colours are chart tokens, defined for every theme. */
export const KINDS: Record<CalendarKind, { one: string; label: string; color: string }> = {
   chore: { one: 'Chore', label: 'Chores', color: 'var(--chart-1)' },
   event: { one: 'Event', label: 'Events', color: 'var(--chart-3)' },
   birthday: { one: 'Birthday', label: 'Birthdays', color: 'var(--chart-4)' },
   vacation: { one: 'Vacation', label: 'Vacations', color: 'var(--chart-5)' },
   meal: { one: 'Meal', label: 'Meals', color: 'var(--chart-2)' },
}

export const ALL_KINDS = Object.keys(KINDS) as CalendarKind[]

/** Kinds that existed before saved filters remembered which kinds they knew. */
const FIRST_KINDS: CalendarKind[] = ['chore', 'event', 'birthday', 'vacation']

/**
 * Kinds to show from a saved filter. A kind added to the app after the filter was
 * saved is shown (otherwise new things like meals would silently stay hidden).
 */
export function visibleKinds(saved: { kinds?: unknown; seen?: unknown } | null | undefined): CalendarKind[] {
   const known = (list: unknown) => (Array.isArray(list) ? ALL_KINDS.filter((k) => list.includes(k)) : null)
   const kinds = known(saved?.kinds) ?? ALL_KINDS
   const seen = known(saved?.seen) ?? FIRST_KINDS
   return ALL_KINDS.filter((k) => kinds.includes(k) || !seen.includes(k))
}
