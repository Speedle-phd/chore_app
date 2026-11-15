import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { ASSIGNMENT_MODES, COMPLETION_STATUSES } from '../domain/chores'
import { isTimeZone, rruleProblem } from '../domain/recurrence'
import { compareLocal, localDelta, normalizeLocal } from '../domain/seriesEdits'
import { CALENDAR_KINDS } from '../models/calendarItemModel'

/** Longest window one request may expand (the year view plus its padding). App choice. */
export const MAX_WINDOW_DAYS = 400
const DAY_MS = 86_400_000

const commaList = <T extends z.ZodType<unknown, string>>(item: T) =>
   z
      .string()
      .max(2000)
      .transform((s) => s.split(',').filter(Boolean))
      .pipe(z.array(item).max(50))

export const calendarQuerySchema = z
   .object({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
      tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone.'),
      kinds: commaList(z.enum(CALENDAR_KINDS)).optional(),
      memberIds: commaList(z.string().refine(isValidObjectId, 'Invalid member id.')).optional(),
   })
   .refine((q) => Date.parse(q.from) < Date.parse(q.to), { message: '`from` must be before `to`.', path: ['to'] })
   .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= MAX_WINDOW_DAYS * DAY_MS, {
      message: `Ask for at most ${MAX_WINDOW_DAYS} days at once.`,
      path: ['to'],
   })

export type CalendarQuery = z.infer<typeof calendarQuerySchema>

/** Longest single entry (a vacation, say). App choice. */
export const MAX_ITEM_DAYS = 366
const objectId = z.string().refine(isValidObjectId, 'Invalid id.')
const memberIds = z
   .array(objectId)
   .max(20)
   .refine((ids) => new Set(ids).size === ids.length, 'Each person only once.')

/** Create or replace an entry. Times are local wall-clock in `timezone` (see domain/recurrence.ts). */
export const itemInputSchema = z
   .object({
      kind: z.enum(CALENDAR_KINDS),
      title: z.string().trim().min(1, 'Enter a title.').max(120),
      notes: z.string().trim().max(2000).default(''),
      color: z
         .string()
         .regex(/^#[0-9a-f]{6}$/i, 'Use a colour like #477a68.')
         .nullable()
         .default(null),
      allDay: z.boolean(),
      start: z.string().max(20),
      end: z.string().max(20),
      timezone: z.string().max(64).refine(isTimeZone, 'Unknown time zone.'),
      memberIds: memberIds.default([]),
      rrule: z
         .string()
         .trim()
         .toUpperCase()
         .nullable()
         .default(null)
         .superRefine((rrule, ctx) => {
            const problem = rrule ? rruleProblem(rrule) : null
            if (problem) ctx.addIssue({ code: 'custom', message: problem })
         }),
      /** Birthday entries: year of birth, for the age (optional). */
      birthYear: z.number().int().min(1900).max(2100).nullable().default(null),
      /** "Repeat after completion" (chores only): days after the last one was done. */
      afterDays: z.number().int().min(1).max(365).nullable().default(null),
      chore: z
         .object({
            effort: z.number().int().min(1).max(5).default(1),
            assignmentMode: z.enum(ASSIGNMENT_MODES).default('anyone'),
            rotation: z.boolean().default(false),
         })
         .default({ effort: 1, assignmentMode: 'anyone', rotation: false }),
   })
   .transform((input, ctx) => {
      const start = normalizeLocal(input.allDay, input.start)
      const end = normalizeLocal(input.allDay, input.end)
      const format = input.allDay ? 'a date (YYYY-MM-DD)' : 'a date and time (YYYY-MM-DDTHH:mm)'
      if (!start) ctx.addIssue({ code: 'custom', path: ['start'], message: `Start must be ${format}.` })
      if (!end) ctx.addIssue({ code: 'custom', path: ['end'], message: `End must be ${format}.` })
      if (!start || !end) return z.NEVER
      if (input.afterDays && input.rrule) {
         ctx.addIssue({ code: 'custom', path: ['afterDays'], message: 'Pick either a fixed repeat or “after completion”.' })
         return z.NEVER
      }
      if (input.birthYear !== null && input.kind !== 'birthday') {
         ctx.addIssue({ code: 'custom', path: ['birthYear'], message: 'Only birthdays have a birth year.' })
         return z.NEVER
      }
      if (input.birthYear !== null && input.birthYear > Number(start.slice(0, 4))) {
         ctx.addIssue({ code: 'custom', path: ['birthYear'], message: 'The birth year can’t be after the birthday.' })
         return z.NEVER
      }
      if (input.afterDays && input.kind !== 'chore') {
         ctx.addIssue({ code: 'custom', path: ['afterDays'], message: 'Only chores can repeat after completion.' })
         return z.NEVER
      }
      if (input.chore.rotation && !input.rrule && !input.afterDays) {
         ctx.addIssue({ code: 'custom', path: ['chore', 'rotation'], message: 'Taking turns needs a repeating chore.' })
         return z.NEVER
      }
      if (input.chore.rotation && input.chore.assignmentMode === 'everyone') {
         ctx.addIssue({ code: 'custom', path: ['chore', 'rotation'], message: 'Take turns only works when anyone may do it.' })
         return z.NEVER
      }
      // All-day ends are exclusive, so they must be at least a day later; timed ends after the start.
      if (compareLocal(input.allDay, end, start) <= 0) {
         ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must be after the start.' })
         return z.NEVER
      }
      if (localDelta(input.allDay, start, end).total({ unit: 'day', relativeTo: start }) > MAX_ITEM_DAYS) {
         ctx.addIssue({ code: 'custom', path: ['end'], message: `An entry can last at most ${MAX_ITEM_DAYS} days.` })
         return z.NEVER
      }
      return { ...input, start, end, rrule: input.rrule || null }
   })
export type ItemInput = z.output<typeof itemInputSchema>

export const SCOPES = ['this', 'following', 'all'] as const
export type Scope = (typeof SCOPES)[number]

/** `:originalStart` path segment: the occurrence's local start as listed by the calendar. */
export const occurrenceParamsSchema = z.object({
   id: objectId,
   originalStart: z.string().max(20),
})

/** Move/resize/reassign one occurrence. Times: `YYYY-MM-DD` (all-day) or ISO with offset (timed). */
export const occurrenceChangeSchema = z
   .object({
      start: z.string().max(40).optional(),
      end: z.string().max(40).optional(),
      memberIds: memberIds.optional(),
   })
   .refine((b) => b.start || b.end || b.memberIds, 'Nothing to change.')
export type OccurrenceChange = z.infer<typeof occurrenceChangeSchema>

export const changeScopeSchema = z.object({ scope: z.enum(SCOPES).default('this') })
export const deleteScopeSchema = z.object({ scope: z.enum(['this', 'following']).default('this') })

/** Mark one chore occurrence for yourself or (see canMarkChoreFor) someone else; `open` undoes it. */
export const statusSchema = z.object({
   status: z.enum([...COMPLETION_STATUSES, 'open']),
   memberId: objectId.optional(),
   note: z.string().trim().max(500).default(''),
})
export type StatusInput = z.infer<typeof statusSchema>

export const itemListQuerySchema = z.object({ kind: z.enum(CALENDAR_KINDS).optional() })

/** Statistics for local dates [from, to); at most a year plus a day. */
export const statsQuerySchema = z
   .object({
      from: z.iso.date(),
      to: z.iso.date(),
      tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone.'),
   })
   .refine((q) => q.from < q.to, { message: '`from` must be before `to`.', path: ['to'] })
   .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 367 * DAY_MS, { message: 'Ask for at most a year.', path: ['to'] })

export const choresQuerySchema = z.object({
   tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone.'),
})
