import { useQuery } from '@tanstack/react-query'
import { Temporal } from 'temporal-polyfill'
import { api } from '@/api/client'
import type { CalendarRange } from '@/features/calendar/calendarApi'
import { viewerTimeZone } from '@/features/calendar/time'

/** Bundesländer (mirror of backend/src/domain/holidayCatalog.de.ts; the server validates). */
export const STATES = {
   BW: 'Baden-Württemberg',
   BY: 'Bayern',
   BE: 'Berlin',
   BB: 'Brandenburg',
   HB: 'Bremen',
   HH: 'Hamburg',
   HE: 'Hessen',
   MV: 'Mecklenburg-Vorpommern',
   NI: 'Niedersachsen',
   NW: 'Nordrhein-Westfalen',
   RP: 'Rheinland-Pfalz',
   SL: 'Saarland',
   SN: 'Sachsen',
   ST: 'Sachsen-Anhalt',
   SH: 'Schleswig-Holstein',
   TH: 'Thüringen',
} as const

export type StateCode = keyof typeof STATES
export const STATE_CODES = Object.keys(STATES) as StateCode[]

export type Holiday = {
   /** `YYYY-MM-DD`. */
   date: string
   id: string
   name: string
   /** Only a holiday in some municipalities of the state. */
   partial: boolean
}

const localDate = (iso: string) => Temporal.Instant.from(iso).toZonedDateTimeISO(viewerTimeZone()).toPlainDate().toString()

/** Public holidays in the visible range; nothing is fetched while the household has no state. */
export function useHolidays(hid: string, state: StateCode | null, range: CalendarRange | null) {
   const from = range ? localDate(range.from) : ''
   const to = range ? localDate(range.to) : ''
   return useQuery({
      queryKey: ['household', hid, 'holidays', state, from, to],
      queryFn: async () => (await api.get<{ holidays: Holiday[] }>(`/households/${hid}/holidays`, { params: { from, to } })).data.holidays,
      enabled: Boolean(state && range),
      // Holidays don't change while the app is open.
      staleTime: Infinity,
      placeholderData: (previous) => previous,
   })
}
