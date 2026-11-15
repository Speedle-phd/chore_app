import type { CalendarKind } from './calendarApi'

/** Labels and theme colour per kind; colours are chart tokens, defined for every theme. */
export const KINDS: Record<CalendarKind, { one: string; label: string; color: string }> = {
   chore: { one: 'Chore', label: 'Chores', color: 'var(--chart-1)' },
   event: { one: 'Event', label: 'Events', color: 'var(--chart-3)' },
   birthday: { one: 'Birthday', label: 'Birthdays', color: 'var(--chart-4)' },
   vacation: { one: 'Vacation', label: 'Vacations', color: 'var(--chart-5)' },
}
