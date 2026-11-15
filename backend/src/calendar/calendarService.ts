import { isValidObjectId, type Types } from 'mongoose'
import { Temporal } from 'temporal-polyfill'
import {
   assigneesFor,
   choreState,
   isOverdue,
   isSettled,
   nextAfterCompletion,
   rotateFrom,
   tooEarly,
   MAX_EARLY_DAYS,
} from '../domain/chores'
import {
   createRule,
   durationOf,
   expandItem,
   historyOf,
   isOccurrence,
   ruleZone,
   seriesIndex,
   seriesSpan,
   toZoned,
   type ItemTiming,
   type OccurrenceOverride,
} from '../domain/recurrence'
import {
   compareLocal,
   hasDayRules,
   localDelta,
   normalizeLocal,
   shiftLocal,
   splitSeries,
   toItemLocal,
} from '../domain/seriesEdits'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { birthdaysBetween, parseBirthday } from '../domain/birthdays'
import { awayOn, vacationConflict } from '../domain/vacations'
import { canDeleteCalendarItem, canMarkChoreFor } from '../households/permissions'
import { CalendarItem, type CalendarItemType } from '../models/calendarItemModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { Occurrence } from '../models/occurrenceModel'
import { User } from '../models/userModel'
import { realtime } from '../socket/realtime'
import type { CalendarQuery, ItemInput, OccurrenceChange, Scope, StatusInput } from './calendarSchemas'
import { choreSettings, completionView, instanceView, itemView, memberBirthdayView, type CalendarInstance } from './calendarViews'

const DAY_MS = 86_400_000
/** How far back the chore agenda looks for overdue ones. App choice. */
export const OVERDUE_LOOKBACK_DAYS = 30
/** "Upcoming" on the chore agenda: the next 7 days after today. */
export const UPCOMING_DAYS = 7

type StoredOverride = {
   originalStart: string
   start?: string | null
   end?: string | null
   cancelled?: boolean | null
   memberIds?: unknown[] | null
   completions?: unknown[] | null
}

const timingOf = (item: CalendarItemType): ItemTiming => ({
   allDay: item.allDay,
   start: item.start,
   end: item.end,
   timezone: item.timezone,
   rrule: item.recurrence.rrule ?? null,
   exdates: [...item.recurrence.exdates],
   afterDays: item.recurrence.afterDays ?? null,
})

const overrideOf = (o: StoredOverride): OccurrenceOverride => ({
   originalStart: o.originalStart,
   start: o.start ?? null,
   end: o.end ?? null,
   cancelled: Boolean(o.cancelled),
   completed: Boolean(o.completions?.length),
})

/** An occurrence document that only carries what the series already says can go. */
const isEmptyOverride = (o: StoredOverride) =>
   !o.start && !o.end && !o.cancelled && !o.memberIds && !o.completions?.length

async function findItem(me: MembershipType, id: string) {
   const item = isValidObjectId(id) ? await CalendarItem.findOne({ _id: id, householdId: me.householdId }) : null
   if (!item) throw new NotFoundError('Entry not found')
   return item
}

async function assertMembers(me: MembershipType, ids: readonly string[] | undefined) {
   if (!ids?.length) return
   const found = await Membership.countDocuments({ _id: { $in: ids }, householdId: me.householdId })
   if (found !== ids.length) throw new BadRequestError('Pick people from this household.')
}

/** Recomputes the derived window bounds from the item and its stored overrides. */
async function applySpan(item: CalendarItemType, overrides?: OccurrenceOverride[]) {
   const list = overrides ?? (await Occurrence.find({ itemId: item._id }).lean()).map(overrideOf)
   const span = seriesSpan(timingOf(item), list)
   item.rangeStart = span.from
   item.rangeEnd = span.to
}

const assertDeletable = (me: MembershipType, item: CalendarItemType) => {
   if (!canDeleteCalendarItem(me.role, item.createdBy.equals(me._id))) {
      throw new ForbiddenError('Only the person who added this entry or an admin can delete it.')
   }
}

/** The occurrence's local key, or 404 when the series has no such occurrence. */
function occurrenceKey(item: CalendarItemType, originalStart: string, overrides: OccurrenceOverride[] = []) {
   const timing = timingOf(item)
   const original = normalizeLocal(timing.allDay, originalStart)
   const zone = ruleZone(timing)
   const rule = timing.rrule ? createRule(timing.rrule, toZoned(timing, timing.start, zone), []) : null
   if (!original || !isOccurrence(timing, rule, original, new Set(timing.exdates), zone, historyOf(timing, overrides))) {
      throw new NotFoundError('Occurrence not found')
   }
   return original
}

const movesDate = (d: Temporal.Duration) => d.days !== 0

/** When an occurrence is due: its end, in the item's zone (all-day: the viewer's). */
function dueOf(item: { allDay: boolean }, end: string, viewerZone: string): Temporal.Instant {
   return item.allDay
      ? Temporal.PlainDate.from(end).toZonedDateTime({ timeZone: viewerZone }).toInstant()
      : Temporal.Instant.from(end)
}

/** Local calendar date of an occurrence start for the viewer. */
function dateOf(instance: { allDay: boolean; start: string }, zone: string): string {
   return instance.allDay
      ? instance.start
      : Temporal.Instant.from(instance.start).toZonedDateTimeISO(zone).toPlainDate().toString()
}

type CalendarKindName = CalendarItemType['kind']

/** Local date range [start, end) an occurrence covers for the viewer (all-day: as stored). */
function localRange(allDay: boolean, start: string, end: string, tz: string): { start: string; end: string } {
   if (allDay) return { start, end }
   const s = Temporal.Instant.from(start).toZonedDateTimeISO(tz)
   const e = Temporal.Instant.from(end).toZonedDateTimeISO(tz)
   const endDate = e.toPlainTime().equals(Temporal.PlainTime.from('00:00')) ? e.toPlainDate() : e.toPlainDate().add({ days: 1 })
   return { start: s.toPlainDate().toString(), end: endDate.toString() }
}

/** Read-only birthday occurrences for members who entered one (accounts: on the user; profiles: on the membership). */
async function memberBirthdays(
   memberships: { _id: Types.ObjectId; userId?: Types.ObjectId | null; profile?: { fname: string; birthday?: string | null } | null }[],
   window: { from: Temporal.Instant; to: Temporal.Instant },
   tz: string,
): Promise<CalendarInstance[]> {
   const userIds = memberships.flatMap((m) => (m.userId ? [m.userId] : []))
   const users = await User.find({ _id: { $in: userIds } }).select('fname birthday').lean()
   const userOf = new Map(users.map((u) => [u._id.toString(), u]))
   const fromDate = window.from.toZonedDateTimeISO(tz).toPlainDate().toString()
   const toDate = window.to.toZonedDateTimeISO(tz).toPlainDate().add({ days: 1 }).toString()
   const startOf = (d: string) => Temporal.PlainDate.from(d).toZonedDateTime({ timeZone: tz }).toInstant()

   return memberships.flatMap((m) => {
      const person = m.userId ? userOf.get(m.userId.toString()) : m.profile
      const birthday = parseBirthday(person?.birthday)
      if (!person || !birthday) return []
      return birthdaysBetween(birthday, fromDate, toDate)
         .filter(({ date }) => {
            const next = Temporal.PlainDate.from(date).add({ days: 1 }).toString()
            return Temporal.Instant.compare(startOf(date), window.to) < 0 && Temporal.Instant.compare(startOf(next), window.from) > 0
         })
         .map(({ date, age }) =>
            memberBirthdayView({ id: m._id.toString(), fname: person.fname }, date, Temporal.PlainDate.from(date).add({ days: 1 }).toString(), age),
         )
   })
}

export function createCalendarService() {
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'calendar')

   async function list(me: MembershipType, query: CalendarQuery, now: Date): Promise<CalendarInstance[]> {
      const from = new Date(query.from)
      const to = new Date(query.to)
      const tz = query.tz
      const wants = (kind: CalendarKindName) => !query.kinds?.length || query.kinds.includes(kind)
      // rangeStart/rangeEnd of all-day items are UTC midnights; a day of padding covers every viewer zone.
      const inWindow = {
         householdId: me.householdId,
         rangeStart: { $lt: new Date(to.getTime() + DAY_MS) },
         $or: [{ rangeEnd: null }, { rangeEnd: { $gt: new Date(from.getTime() - DAY_MS) } }],
      }
      const items = await CalendarItem.find({ ...inWindow, ...(query.kinds?.length ? { kind: { $in: query.kinds } } : {}) })
         .sort({ rangeStart: 1, _id: 1 })
         .lean()
      // Vacations decide chore conflicts even when they aren't listed themselves.
      const hiddenVacations =
         wants('chore') && !wants('vacation') ? await CalendarItem.find({ ...inWindow, kind: 'vacation' }).lean() : []
      const memberships = await Membership.find({ householdId: me.householdId }).sort({ createdAt: 1 }).lean()

      const allItems = [...items, ...hiddenVacations]
      const overrides = allItems.length
         ? await Occurrence.find({ householdId: me.householdId, itemId: { $in: allItems.map((i) => i._id) } }).lean()
         : []
      const overridesOf = Map.groupBy(overrides, (o) => o.itemId.toString())
      const window = {
         from: Temporal.Instant.fromEpochMilliseconds(from.getTime()),
         to: Temporal.Instant.fromEpochMilliseconds(to.getTime()),
         viewerZone: tz,
      }
      const nowInstant = Temporal.Instant.fromEpochMilliseconds(now.getTime())

      // 1) Expand every item once; chores get their effective assignees.
      const rows = allItems.flatMap((item) => {
         const itemOverrides = overridesOf.get(item._id.toString()) ?? []
         const byOriginal = new Map(itemOverrides.map((o) => [o.originalStart, o]))
         const timing: ItemTiming = {
            allDay: item.allDay,
            start: item.start,
            end: item.end,
            timezone: item.timezone,
            rrule: item.recurrence.rrule ?? null,
            exdates: item.recurrence.exdates,
            afterDays: item.recurrence.afterDays ?? null,
         }
         const pool = item.memberIds.map(String)
         const settings = choreSettings(item)
         return expandItem(timing, itemOverrides.map(overrideOf), window).map((instance) => {
            const override = byOriginal.get(instance.originalStart)
            const reassigned = override?.memberIds ? override.memberIds.map(String) : null
            const assignees =
               item.kind === 'chore' ? assigneesFor(pool, settings.rotation, instance.index, reassigned) : (reassigned ?? pool)
            return { item, instance, override, reassigned, assignees, pool, settings }
         })
      })

      // 2) Who is away when, and how busy everyone is in this period (for fair suggestions).
      const vacations = rows
         .filter((r) => r.item.kind === 'vacation')
         .map((r) => ({ memberIds: r.assignees, ...localRange(r.item.allDay, r.instance.start, r.instance.end, tz) }))
      const load = new Map<string, number>()
      for (const r of rows) if (r.item.kind === 'chore') for (const id of r.assignees) load.set(id, (load.get(id) ?? 0) + 1)
      const household = memberships.map((m) => m._id.toString())
      const listed = new Set(items.map((i) => i._id.toString()))

      // 3) Views.
      const views = rows
         .filter((r) => listed.has(r.item._id.toString()))
         .map(({ item, instance, override, reassigned, assignees, pool, settings }) => {
            if (item.kind !== 'chore') return instanceView(item, instance, assignees, Boolean(reassigned), null)
            const completions = (override?.completions ?? []).map(completionView)
            const state = choreState(settings.assignmentMode, assignees, completions)
            const overdue = isOverdue(state, dueOf(item, instance.end, tz), nowInstant)
            const conflict = isSettled(state)
               ? null
               : vacationConflict(
                    { mode: settings.assignmentMode, assignees, pool },
                    awayOn(vacations, dateOf({ allDay: item.allDay, start: instance.start }, tz)),
                    household,
                    load,
                 )
            return instanceView(item, instance, assignees, Boolean(reassigned), { state, overdue, completions, conflict })
         })

      // 4) Birthdays from member profiles.
      if (wants('birthday')) views.push(...(await memberBirthdays(memberships, window, tz)))

      const wanted = query.memberIds?.length ? new Set(query.memberIds) : null
      return wanted ? views.filter((v) => v.memberIds.some((id) => wanted.has(id))) : views
   }

   return {
      list,

      /** The chore agenda for "now": overdue (last 30 days), today, and the next 7 days. */
      async agenda(me: MembershipType, tz: string, now: Date) {
         const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(tz).toPlainDate()
         const startOf = (d: Temporal.PlainDate) => d.toZonedDateTime({ timeZone: tz }).toInstant().toString()
         const instances = await list(
            me,
            {
               from: startOf(today.subtract({ days: OVERDUE_LOOKBACK_DAYS })),
               to: startOf(today.add({ days: UPCOMING_DAYS + 1 })),
               tz,
               kinds: ['chore'],
            },
            now,
         )
         const todayStr = today.toString()
         const bySoonest = (a: CalendarInstance, b: CalendarInstance) =>
            dateOf(a, tz).localeCompare(dateOf(b, tz)) || Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)
         const overdue = instances.filter((i) => i.chore?.overdue).sort(bySoonest)
         const rest = instances.filter((i) => !i.chore?.overdue)
         return {
            date: todayStr,
            overdue,
            today: rest.filter((i) => dateOf(i, tz) === todayStr).sort(bySoonest),
            upcoming: rest.filter((i) => dateOf(i, tz) > todayStr).sort(bySoonest),
         }
      },

      /** All entries (series) of the household, optionally of one kind, by title. */
      async listItems(me: MembershipType, kind?: CalendarItemType['kind']) {
         const items = await CalendarItem.find({ householdId: me.householdId, ...(kind ? { kind } : {}) })
            .collation({ locale: 'en', strength: 2 })
            .sort({ title: 1 })
         return items.map(itemView)
      },

      async get(me: MembershipType, id: string) {
         return itemView(await findItem(me, id))
      },

      async create(me: MembershipType, input: ItemInput) {
         await assertMembers(me, input.memberIds)
         const item = new CalendarItem({
            householdId: me.householdId,
            createdBy: me._id,
            kind: input.kind,
            title: input.title,
            notes: input.notes,
            color: input.color,
            allDay: input.allDay,
            start: input.start,
            end: input.end,
            timezone: input.timezone,
            memberIds: input.memberIds,
            recurrence: { rrule: input.rrule, exdates: [], afterDays: input.afterDays },
            chore: input.chore,
            birthYear: input.birthYear,
         })
         await applySpan(item, [])
         await item.save()
         changed(me)
         return itemView(item)
      },

      /**
       * Replaces the series. Changing when it happens (start, zone, all-day, repeat)
       * drops skipped dates and single-occurrence changes: their keys no longer match.
       * Occurrences with completions are kept (history for statistics).
       */
      async update(me: MembershipType, id: string, input: ItemInput) {
         const item = await findItem(me, id)
         await assertMembers(me, input.memberIds)
         const timingChanged =
            item.allDay !== input.allDay ||
            item.start !== input.start ||
            item.timezone !== input.timezone ||
            (item.recurrence.rrule ?? null) !== input.rrule ||
            (item.recurrence.afterDays ?? null) !== input.afterDays
         item.set({
            kind: input.kind,
            title: input.title,
            notes: input.notes,
            color: input.color,
            allDay: input.allDay,
            start: input.start,
            end: input.end,
            timezone: input.timezone,
            memberIds: input.memberIds,
            recurrence: {
               rrule: input.rrule,
               afterDays: input.afterDays,
               exdates: timingChanged ? [] : item.recurrence.exdates,
            },
            chore: input.chore,
            birthYear: input.birthYear,
         })
         const kept = timingChanged
            ? await Occurrence.find({ itemId: item._id, 'completions.0': { $exists: true } }).lean()
            : undefined
         await applySpan(item, kept?.map(overrideOf))
         await item.save()
         if (timingChanged) await Occurrence.deleteMany({ itemId: item._id, 'completions.0': { $exists: false } })
         changed(me)
         return itemView(item)
      },

      async remove(me: MembershipType, id: string) {
         const item = await findItem(me, id)
         assertDeletable(me, item)
         await Occurrence.deleteMany({ itemId: item._id })
         await item.deleteOne()
         changed(me)
      },

      /** Move, resize or reassign one occurrence, this and following, or all. */
      async changeOccurrence(me: MembershipType, id: string, originalStart: string, scope: Scope, change: OccurrenceChange) {
         const item = await findItem(me, id)
         const overrides = await Occurrence.find({ itemId: item._id }).lean()
         const original = occurrenceKey(item, originalStart, overrides.map(overrideOf))
         await assertMembers(me, change.memberIds)
         const { allDay } = item
         const timing = timingOf(item)
         const duration = durationOf(timing)

         const override = overrides.find((o) => o.originalStart === original)
         const currentStart = override?.start ?? original
         const currentEnd = override?.end ?? shiftLocal(allDay, currentStart, duration)
         const parse = (value: string) => {
            const local = toItemLocal(item, value)
            if (!local) {
               throw new BadRequestError(
                  allDay ? 'Use a date (YYYY-MM-DD) for an all-day entry.' : 'Use a date and time with offset for a timed entry.',
               )
            }
            return local
         }
         const newStart = change.start ? parse(change.start) : currentStart
         const newEnd = change.end
            ? parse(change.end)
            : shiftLocal(allDay, newStart, localDelta(allDay, currentStart, currentEnd))
         if (compareLocal(allDay, newEnd, newStart) <= 0) throw new BadRequestError('End must be after the start.')

         // One-off entry, or the open one of an after-completion chore: the occurrence is the entry.
         if (!timing.rrule) {
            if (original !== item.start) throw new BadRequestError('Completed occurrences can’t be moved.')
            item.set({ start: newStart, end: newEnd, memberIds: change.memberIds ?? item.memberIds })
            await applySpan(item)
            await item.save()
            changed(me)
            return
         }

         if (scope === 'this') {
            const fields = {
               // Only what differs from the series, so later series edits still apply.
               start: newStart === original ? null : newStart,
               end: newEnd === shiftLocal(allDay, newStart, duration) ? null : newEnd,
               memberIds: change.memberIds ?? override?.memberIds ?? null,
            }
            await Occurrence.updateOne(
               { itemId: item._id, originalStart: original },
               { $set: fields, $setOnInsert: { householdId: me.householdId } },
               { upsert: true },
            )
            await applySpan(item)
            await item.save()
            changed(me)
            return
         }

         const delta = localDelta(allDay, currentStart, newStart)
         if (movesDate(delta) && hasDayRules(timing.rrule)) {
            throw new BadRequestError('This entry repeats on set days. Change its repeat days instead of moving it.')
         }
         const newDuration = localDelta(allDay, newStart, newEnd)
         const memberIds = change.memberIds ?? item.memberIds.map(String)

         if (scope === 'all' || compareLocal(allDay, original, item.start) <= 0) {
            // Shift the whole series; keys of skipped dates and changed occurrences move along.
            const shift = (local: string) => shiftLocal(allDay, local, delta)
            const start = shift(item.start)
            const moved = overrides
               .filter((o) => o.originalStart !== original || o.completions?.length)
               .map((o) => ({
                  ...o,
                  originalStart: shift(o.originalStart),
                  ...(o.originalStart === original ? { start: null, end: null } : {}),
               }))
            item.set({
               start,
               end: shiftLocal(allDay, start, newDuration),
               memberIds,
               recurrence: { ...item.recurrence, exdates: timing.exdates.map(shift) },
            })
            await applySpan(item, moved.map(overrideOf))
            await item.save()
            await Occurrence.deleteMany({ itemId: item._id })
            if (moved.length) await Occurrence.insertMany(moved)
            changed(me)
            return
         }

         // This and following: the old series ends before the split, a new one starts at the moved time.
         const { beforeRrule, afterRrule } = splitSeries({ ...timing, rrule: timing.rrule }, original)
         const fromSplit = (local: string) => compareLocal(allDay, local, original) > 0
         const shiftFromOriginal = localDelta(allDay, original, newStart)
         const shift = (local: string) => shiftLocal(allDay, local, shiftFromOriginal)
         const settings = choreSettings(item)
         // Turns continue where they were: the new series starts with whoever had this one.
         const tailMembers =
            item.kind === 'chore' && settings.rotation && !change.memberIds
               ? rotateFrom(memberIds, seriesIndex(timing, overrides.map(overrideOf), original))
               : memberIds
         const tail = new CalendarItem({
            householdId: item.householdId,
            createdBy: item.createdBy,
            kind: item.kind,
            title: item.title,
            notes: item.notes,
            color: item.color,
            allDay,
            start: newStart,
            end: newEnd,
            timezone: item.timezone,
            memberIds: tailMembers,
            recurrence: { rrule: afterRrule, exdates: timing.exdates.filter(fromSplit).map(shift), afterDays: null },
            chore: settings,
         })
         const tailOverrides = overrides
            .filter((o) => fromSplit(o.originalStart))
            .map(({ _id, ...o }) => ({ ...o, itemId: tail._id, originalStart: shift(o.originalStart) }))
         await applySpan(tail, tailOverrides.map(overrideOf))
         await tail.save()
         if (tailOverrides.length) await Occurrence.insertMany(tailOverrides)

         const kept = overrides.filter((o) => compareLocal(allDay, o.originalStart, original) < 0)
         item.set({
            recurrence: {
               rrule: beforeRrule,
               afterDays: null,
               exdates: timing.exdates.filter((d) => compareLocal(allDay, d, original) < 0),
            },
         })
         await applySpan(item, kept.map(overrideOf))
         await item.save()
         await Occurrence.deleteMany({ itemId: item._id, originalStart: { $gte: original } })
         changed(me)
      },

      /** Delete one occurrence (skip it) or this and all following ones. */
      async removeOccurrence(me: MembershipType, id: string, originalStart: string, scope: 'this' | 'following') {
         const item = await findItem(me, id)
         const original = occurrenceKey(item, originalStart)
         const timing = timingOf(item)
         const rrule = timing.rrule
         if (timing.afterDays) {
            throw new BadRequestError('This chore repeats after completion: mark it as skipped, or delete the whole chore.')
         }

         if (!rrule || (scope === 'following' && compareLocal(item.allDay, original, item.start) <= 0)) {
            assertDeletable(me, item)
            await Occurrence.deleteMany({ itemId: item._id })
            await item.deleteOne()
         } else if (scope === 'this') {
            item.recurrence.exdates = [...new Set([...timing.exdates, original])]
            await Occurrence.deleteOne({ itemId: item._id, originalStart: original })
            await applySpan(item)
            await item.save()
         } else {
            assertDeletable(me, item)
            const { beforeRrule } = splitSeries({ ...timing, rrule }, original)
            item.recurrence.rrule = beforeRrule
            item.recurrence.exdates = timing.exdates.filter((d) => compareLocal(item.allDay, d, original) < 0)
            await Occurrence.deleteMany({ itemId: item._id, originalStart: { $gte: original } })
            await applySpan(item)
            await item.save()
         }
         changed(me)
      },

      /**
       * Mark one chore occurrence done or skipped for a person (default: the caller),
       * or undo it (`open`). Settling the open occurrence of an after-completion
       * chore schedules the next one; only the latest of those can be undone.
       */
      async setStatus(me: MembershipType, id: string, originalStart: string, input: StatusInput, now: Date) {
         const item = await findItem(me, id)
         if (item.kind !== 'chore') throw new BadRequestError('Only chores can be marked done.')
         const overrides = await Occurrence.find({ itemId: item._id }).lean()
         const timing = timingOf(item)
         const original = occurrenceKey(item, originalStart, overrides.map(overrideOf))
         const override = overrides.find((o) => o.originalStart === original)

         const targetId = input.memberId ?? me._id.toString()
         const target = isValidObjectId(targetId)
            ? await Membership.findOne({ _id: targetId, householdId: me.householdId })
            : null
         if (!target) throw new BadRequestError('Pick someone from this household.')
         if (!canMarkChoreFor(me.role, target._id.equals(me._id), Boolean(target.userId))) {
            throw new ForbiddenError('You can mark chores for yourself and for people without a login.')
         }

         const nowInstant = Temporal.Instant.fromEpochMilliseconds(now.getTime())
         const start = toZoned(timing, override?.start ?? original, timing.timezone)
         if (input.status !== 'open' && tooEarly(start.toInstant(), nowInstant)) {
            throw new BadRequestError(`That’s more than ${MAX_EARLY_DAYS} days ahead.`)
         }

         const settings = choreSettings(item)
         const index = seriesIndex(timing, overrides.map(overrideOf), original)
         const assignees = assigneesFor(
            item.memberIds.map(String),
            settings.rotation,
            index,
            override?.memberIds ? override.memberIds.map(String) : null,
         )
         if (settings.assignmentMode === 'everyone' && assignees.length && !assignees.includes(target.id)) {
            throw new BadRequestError('Everyone assigned marks their own part; this person isn’t assigned.')
         }

         const isOpenOne = original === item.start
         const history = historyOf(timing, overrides.map(overrideOf))
         if (timing.afterDays && !isOpenOne && input.status === 'open' && original !== history.at(-1)) {
            throw new ConflictError('Only the latest completion of this chore can be undone.')
         }

         const completions = (override?.completions ?? [])
            .filter((c) => !c.memberId.equals(target._id))
            .map((c) => ({ memberId: c.memberId, status: c.status, at: c.at, by: c.by, note: c.note ?? '' }))
         if (input.status !== 'open') {
            completions.push({ memberId: target._id, status: input.status, at: now, by: me._id, note: input.note })
         }
         const before = choreState(settings.assignmentMode, assignees, (override?.completions ?? []).map(completionView))
         const after = choreState(settings.assignmentMode, assignees, completions.map(completionView))

         const doc = { ...(override ?? { originalStart: original }), completions }
         if (isEmptyOverride(doc)) await Occurrence.deleteOne({ itemId: item._id, originalStart: original })
         else
            await Occurrence.updateOne(
               { itemId: item._id, originalStart: original },
               { $set: { completions }, $setOnInsert: { householdId: me.householdId } },
               { upsert: true },
            )

         if (timing.afterDays) {
            if (isOpenOne && isSettled(after)) {
               // Settled: the next one is due N days from today.
               item.set(nextAfterCompletion(timing, nowInstant, timing.afterDays))
            } else if (!isOpenOne && isSettled(before) && !isSettled(after)) {
               // Undoing the latest completion makes it the open one again.
               const openDoc = overrides.find((o) => o.originalStart === item.start)
               if (openDoc?.completions?.length) {
                  throw new ConflictError('The next one is already marked; undo that first.')
               }
               item.set({ start: original, end: shiftLocal(timing.allDay, original, durationOf(timing)) })
            }
            await applySpan(item)
            await item.save()
         }
         changed(me)
      },
   }
}

export type CalendarService = ReturnType<typeof createCalendarService>
