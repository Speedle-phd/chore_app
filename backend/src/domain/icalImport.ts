import { sync as ical, type DateWithTimeZone, type ParameterValue, type VEvent } from 'node-ical'
import { Temporal } from 'temporal-polyfill'
import { createRule, isTimeZone, MAX_INSTANCES_PER_ITEM, toZoned } from './recurrence'

/**
 * Reading `.ics` files (RFC 5545) into entries the app can store. Pure: the
 * caller passes the file text and the importer's time zone.
 *
 * Times become local wall-clock strings in an IANA zone (see recurrence.ts):
 * - DATE values → all-day dates;
 * - DATE-TIME with a TZID → kept in that zone (Windows names are mapped by node-ical);
 * - UTC (`Z`) or floating times → the importer's zone, so they show at the
 *   right local time and repeats keep their local time across DST.
 */

/** Most VEVENTs read from one file. App choice. */
export const MAX_IMPORT_EVENTS = 1000
/** Moved or cancelled single occurrences kept per series. App choice. */
const MAX_OVERRIDES = 200
/** Length of a timed entry without DTEND/DURATION (RFC 5545 would make it zero). App choice. */
const DEFAULT_TIMED_MINUTES = 60
const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Z'])

export type ImportedOverride = { originalStart: string; start: string; end: string }

export type ImportCandidate = {
   uid: string
   title: string
   notes: string
   allDay: boolean
   start: string
   end: string
   timezone: string
   /** RRULE body (no DTSTART), or null for a one-off. */
   rrule: string | null
   exdates: string[]
   overrides: ImportedOverride[]
   /** Why it can't be imported (null = fine so far; the item schema checks the rest). */
   problem: string | null
}

export class IcsReadError extends Error {}

/** All VEVENTs of a calendar file, in file order. Throws IcsReadError for unreadable files. */
export function readIcs(text: string, importerZone: string): ImportCandidate[] {
   if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsReadError('This isn’t a calendar (.ics) file.')
   let parsed: ReturnType<typeof ical.parseICS>
   try {
      parsed = ical.parseICS(text.replace(/^﻿/, ''))
   } catch {
      throw new IcsReadError('This calendar file couldn’t be read.')
   }
   const events = Object.values(parsed).filter((c): c is VEvent => c?.type === 'VEVENT')
   if (!events.length) throw new IcsReadError('No calendar entries found in this file.')
   if (events.length > MAX_IMPORT_EVENTS) {
      throw new IcsReadError(`This file has more than ${MAX_IMPORT_EVENTS} entries; split it up first.`)
   }
   return events.map((event, i) => candidateOf(event, importerZone, i))
}

function candidateOf(event: VEvent, importerZone: string, index: number): ImportCandidate {
   const uid = (event.uid || `no-uid-${index}`).slice(0, 255)
   const title = textOf(event.summary).trim().slice(0, 120) || '(No title)'
   const location = textOf(event.location).trim()
   const notes = [textOf(event.description).trim(), location ? `Location: ${location}` : '']
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 2000)
   const base = { uid, title, notes, rrule: null, exdates: [], overrides: [] }

   if (!(event.start instanceof Date) || Number.isNaN(event.start.getTime())) {
      return { ...base, allDay: true, start: '', end: '', timezone: importerZone, problem: 'It has no start date.' }
   }
   const allDay = Boolean(event.start.dateOnly) || event.datetype === 'date'
   const timezone = allDay ? importerZone : zoneOf(event.start, importerZone)
   const local = (d: DateWithTimeZone) => localOf(d, allDay, timezone)
   const start = local(event.start)
   const end = endOf(allDay, start, event.end ? local(event.end) : null)
   const candidate: ImportCandidate = { ...base, allDay, start, end, timezone, problem: null }

   if (event.status === 'CANCELLED') return { ...candidate, problem: 'It was cancelled in the original calendar.' }
   if (!event.rrule) return candidate

   const rrule = rruleBody(event.rrule.toString())
   if (!rrule) return { ...candidate, problem: 'Its repeat rule couldn’t be read.' }

   const exdates = uniqueDates(Object.values(event.exdate ?? {})).map(local)
   const overrides: ImportedOverride[] = []
   // node-ical's override type loses its fields (index signature), so each one is checked here.
   const recurrences = Object.values(event.recurrences ?? {}).flatMap((r) => {
      const { recurrenceid: id, start: s, end: e, status } = r
      if (!(id instanceof Date)) return []
      return [{ id, start: s instanceof Date ? s : null, end: e instanceof Date ? e : null, cancelled: status === 'CANCELLED' }]
   })
   for (const r of uniqueBy(recurrences, (o) => o.id.getTime())) {
      const originalStart = local(r.id)
      if (r.cancelled) {
         exdates.push(originalStart)
      } else if (r.start) {
         const oStart = local(r.start)
         overrides.push({ originalStart, start: oStart, end: endOf(allDay, oStart, r.end ? local(r.end) : null) })
      }
   }

   const result = { ...candidate, rrule, exdates: [...new Set(exdates)].slice(0, MAX_INSTANCES_PER_ITEM), overrides: overrides.slice(0, MAX_OVERRIDES) }
   return { ...result, problem: ruleProblemAt(result) }
}

export type ImportKind = 'chore' | 'event' | 'birthday' | 'vacation' | 'meal'

/** Why this candidate can't become an entry of `kind` (before the item schema's own checks). */
export function kindProblem(c: Pick<ImportCandidate, 'allDay'>, kind: ImportKind): string | null {
   return kind === 'birthday' && !c.allDay ? 'Birthdays must be all-day entries.' : null
}

/**
 * Body for the item schema (`itemInputSchema`), which validates it like a
 * hand-made entry. Yearly birthdays on 29 February use the app's rule (28th in
 * other years) instead of RFC 5545's "leap years only".
 */
export function itemInputOf(c: ImportCandidate, kind: ImportKind) {
   const leapDayBirthday = kind === 'birthday' && c.start.endsWith('-02-29') && c.rrule === 'FREQ=YEARLY'
   return {
      kind,
      title: c.title,
      notes: c.notes,
      allDay: c.allDay,
      start: c.start,
      end: c.end,
      timezone: c.timezone,
      memberIds: [],
      rrule: leapDayBirthday ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : c.rrule,
   }
}

/** The text of a property that may carry parameters (LANGUAGE, ALTREP …). */
const textOf = (value: ParameterValue | undefined): string =>
   typeof value === 'string' ? value : typeof value?.val === 'string' ? value.val : ''

function zoneOf(start: DateWithTimeZone, importerZone: string): string {
   const tz = start.tz
   return tz && !UTC_ZONES.has(tz) && isTimeZone(tz) ? tz : importerZone
}

/**
 * Local wall-clock string of a parsed value. node-ical builds DATE and floating
 * DATE-TIME values in the process's own zone, so their local fields are the
 * original ones; values with a zone are real instants.
 */
function localOf(d: DateWithTimeZone, allDay: boolean, zone: string): string {
   const floating = d.dateOnly || !d.tz
   const wall = floating
      ? Temporal.PlainDateTime.from({
           year: d.getFullYear(),
           month: d.getMonth() + 1,
           day: d.getDate(),
           hour: d.getHours(),
           minute: d.getMinutes(),
        })
      : Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(zone).toPlainDateTime()
   return allDay ? wall.toPlainDate().toString() : wall.toString({ smallestUnit: 'minute' })
}

/** DTEND if it is after the start; otherwise one day (all-day) or an hour. */
function endOf(allDay: boolean, start: string, end: string | null): string {
   if (end && end > start) return end
   return allDay
      ? Temporal.PlainDate.from(start).add({ days: 1 }).toString()
      : Temporal.PlainDateTime.from(start).add({ minutes: DEFAULT_TIMED_MINUTES }).toString({ smallestUnit: 'minute' })
}

/** `RRULE:` line of node-ical's `DTSTART…\nRRULE:…` text. */
function rruleBody(text: string): string | null {
   const line = text.split(/\r?\n/).find((l) => l.toUpperCase().startsWith('RRULE:'))
   const body = line?.slice('RRULE:'.length).trim().toUpperCase()
   return body || null
}

const uniqueBy = <T>(list: T[], key: (item: T) => unknown) => {
   const seen = new Set<unknown>()
   return list.filter((item) => {
      const k = key(item)
      if (seen.has(k)) return false
      seen.add(k)
      return true
   })
}
// node-ical lists each EXDATE/RECURRENCE-ID under a date key and a timestamp key.
const uniqueDates = (dates: DateWithTimeZone[]) => uniqueBy(dates.filter((d) => d instanceof Date), (d) => d.getTime())

/** The rule must expand from this entry's own start (UNTIL forms, odd parts). */
function ruleProblemAt(c: Pick<ImportCandidate, 'allDay' | 'start' | 'timezone' | 'rrule' | 'exdates'>): string | null {
   if (!c.rrule) return null
   try {
      const zone = c.allDay ? 'UTC' : c.timezone
      createRule(c.rrule, toZoned(c, c.start, zone), c.exdates.map((d) => toZoned(c, d, zone))).all((_, i) => i < 2)
      return null
   } catch {
      return 'Its repeat rule isn’t supported.'
   }
}
