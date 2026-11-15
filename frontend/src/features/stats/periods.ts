import { Temporal } from 'temporal-polyfill'

export const PERIODS = [
   { id: 'week', label: 'This week' },
   { id: 'month', label: 'This month' },
   { id: '30days', label: 'Last 30 days' },
   { id: 'year', label: 'This year' },
] as const
export type PeriodId = (typeof PERIODS)[number]['id']

/** Local dates [from, to) for a preset, relative to `today` (weeks start on Monday). */
export function periodRange(id: PeriodId, today: string): { from: string; to: string } {
   const d = Temporal.PlainDate.from(today)
   const next = d.add({ days: 1 }).toString()
   switch (id) {
      case 'week': {
         const monday = d.subtract({ days: d.dayOfWeek - 1 })
         return { from: monday.toString(), to: monday.add({ days: 7 }).toString() }
      }
      case 'month':
         return { from: d.with({ day: 1 }).toString(), to: d.with({ day: 1 }).add({ months: 1 }).toString() }
      case '30days':
         return { from: d.subtract({ days: 29 }).toString(), to: next }
      case 'year':
         return { from: d.with({ month: 1, day: 1 }).toString(), to: d.with({ month: 1, day: 1 }).add({ years: 1 }).toString() }
   }
}

/** "Nice" axis maximum and 3–4 tick values for counts (0, 5, 10, 15 …). */
export function niceTicks(max: number): number[] {
   if (max <= 0) return [0, 1]
   const raw = max / 3
   const magnitude = 10 ** Math.floor(Math.log10(raw))
   const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude
   const top = Math.ceil(max / step) * step
   const ticks: number[] = []
   for (let t = 0; t <= top + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100)
   return ticks
}
