import type { Types } from 'mongoose'
import type { AssignmentMode, ChoreState, CompletionStatus } from '../domain/chores'
import type { Instance } from '../domain/recurrence'
import type { CalendarKind } from '../models/calendarItemModel'

type ChoreSettings = { effort?: number | null; assignmentMode?: AssignmentMode | null; rotation?: boolean | null }

type StoredItem = {
   _id: Types.ObjectId
   createdBy: Types.ObjectId
   kind: CalendarKind
   title: string
   notes: string
   color?: string | null
   allDay: boolean
   memberIds: Types.ObjectId[]
   recurrence: { rrule?: string | null; afterDays?: number | null }
   chore?: ChoreSettings | null
}

type StoredCompletion = {
   memberId: Types.ObjectId
   status: CompletionStatus
   at: Date
   by: Types.ObjectId
   note?: string | null
}

export type CompletionView = { memberId: string; status: CompletionStatus; at: string; by: string; note: string }

/** Chore part of an occurrence: settings plus the computed state for "now". */
export type ChoreView = {
   effort: number
   assignmentMode: AssignmentMode
   rotation: boolean
   afterDays: number | null
   state: ChoreState
   overdue: boolean
   completions: CompletionView[]
}

/** One concrete occurrence as the calendar shows it. */
export type CalendarInstance = {
   /** Stable per occurrence: `<itemId>_<originalStart>`. */
   id: string
   itemId: string
   kind: CalendarKind
   title: string
   notes: string
   color: string | null
   allDay: boolean
   start: string
   end: string
   originalStart: string
   /** Who it is for; for chores the effective assignees (rotation and reassignment applied). */
   memberIds: string[]
   /** Membership id of who added the entry (decides who may delete the series). */
   createdBy: string
   recurring: boolean
   overridden: boolean
   chore: ChoreView | null
}

export const choreSettings = (item: { chore?: ChoreSettings | null }) => ({
   effort: item.chore?.effort ?? 1,
   assignmentMode: item.chore?.assignmentMode ?? 'anyone',
   rotation: item.chore?.rotation ?? false,
})

export const completionView = (c: StoredCompletion): CompletionView => ({
   memberId: c.memberId.toString(),
   status: c.status,
   at: c.at.toISOString(),
   by: c.by.toString(),
   note: c.note ?? '',
})

export function instanceView(
   item: StoredItem,
   instance: Instance,
   memberIds: string[],
   reassigned: boolean,
   chore: Pick<ChoreView, 'state' | 'overdue' | 'completions'> | null,
): CalendarInstance {
   const itemId = item._id.toString()
   return {
      id: `${itemId}_${instance.originalStart}`,
      itemId,
      kind: item.kind,
      title: item.title,
      notes: item.notes,
      color: item.color ?? null,
      allDay: item.allDay,
      start: instance.start,
      end: instance.end,
      originalStart: instance.originalStart,
      memberIds,
      createdBy: item.createdBy.toString(),
      recurring: Boolean(item.recurrence.rrule || item.recurrence.afterDays),
      overridden: instance.overridden || reassigned,
      chore: chore ? { ...choreSettings(item), afterDays: item.recurrence.afterDays ?? null, ...chore } : null,
   }
}

/** A whole entry (series) as the edit dialog needs it. Times are local in `timezone`. */
export type CalendarItemView = {
   id: string
   kind: CalendarKind
   title: string
   notes: string
   color: string | null
   allDay: boolean
   start: string
   end: string
   timezone: string
   memberIds: string[]
   rrule: string | null
   afterDays: number | null
   exdates: string[]
   chore: { effort: number; assignmentMode: AssignmentMode; rotation: boolean }
   createdBy: string
   createdAt: string
   updatedAt: string
}

type FullItem = StoredItem & {
   start: string
   end: string
   timezone: string
   recurrence: { rrule?: string | null; afterDays?: number | null; exdates: string[] }
   createdAt: Date
   updatedAt: Date
}

export function itemView(item: FullItem): CalendarItemView {
   return {
      id: item._id.toString(),
      kind: item.kind,
      title: item.title,
      notes: item.notes,
      color: item.color ?? null,
      allDay: item.allDay,
      start: item.start,
      end: item.end,
      timezone: item.timezone,
      memberIds: item.memberIds.map(String),
      rrule: item.recurrence.rrule ?? null,
      afterDays: item.recurrence.afterDays ?? null,
      exdates: [...item.recurrence.exdates],
      chore: choreSettings(item),
      createdBy: item.createdBy.toString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
   }
}
