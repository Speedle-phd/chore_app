import { Temporal } from 'temporal-polyfill'

/** Meal times offered (local, one hour). App choice. */
export const MEAL_SLOTS = [
   { id: 'breakfast', label: 'Breakfast', start: '08:00', end: '09:00' },
   { id: 'lunch', label: 'Lunch', start: '12:30', end: '13:30' },
   { id: 'dinner', label: 'Dinner', start: '18:30', end: '19:30' },
] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]['id']

/** Monday of the week a date is in (weeks start on Monday, like the calendar). */
export function mondayOf(date: string): string {
   const d = Temporal.PlainDate.from(date)
   return d.subtract({ days: d.dayOfWeek - 1 }).toString()
}

export const addDays = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString()

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

/** The week as instants for the calendar query, in the viewer's zone. */
export function weekRange(monday: string, zone: string): { from: string; to: string } {
   const at = (d: string) => Temporal.PlainDate.from(d).toZonedDateTime({ timeZone: zone }).toInstant().toString()
   return { from: at(monday), to: at(addDays(monday, 7)) }
}

/** Which slot a meal starting at a local time belongs to (nearest of the three). */
export function slotOf(time: string): MealSlot {
   const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
   const m = minutes(time)
   return MEAL_SLOTS.reduce((best, s) => (Math.abs(minutes(s.start) - m) < Math.abs(minutes(best.start) - m) ? s : best)).id
}

/** "Mon 16 – Sun 22 Nov" in the viewer's locale. */
export function weekLabel(monday: string, locale?: string): string {
   const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
   return fmt.formatRange(new Date(`${monday}T12:00:00`), new Date(`${addDays(monday, 6)}T12:00:00`))
}
