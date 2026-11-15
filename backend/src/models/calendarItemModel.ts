import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { ASSIGNMENT_MODES } from '../domain/chores'

export const CALENDAR_KINDS = ['chore', 'event', 'birthday', 'vacation'] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

/**
 * A one-off or repeating calendar entry. Times are local wall-clock strings in
 * `timezone` (see domain/recurrence.ts); `rangeStart`/`rangeEnd` are derived
 * instants bounding every occurrence, kept only for the window query.
 * People (`memberIds`, `createdBy`) are membership ids.
 */
const calendarItemSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
      kind: { type: String, enum: CALENDAR_KINDS, required: true },
      title: { type: String, required: true, trim: true, maxlength: 120 },
      notes: { type: String, default: '', maxlength: 2000 },
      color: { type: String, default: null },
      allDay: { type: Boolean, required: true, default: false },
      start: { type: String, required: true },
      end: { type: String, required: true },
      timezone: { type: String, required: true },
      memberIds: { type: [{ type: Types.ObjectId, ref: 'Membership' }], default: [] },
      recurrence: {
         type: new Schema(
            {
               rrule: { type: String, default: null },
               exdates: { type: [String], default: [] },
               /** "Repeat after completion": days after the last one was settled. Excludes `rrule`. */
               afterDays: { type: Number, default: null, min: 1, max: 365 },
            },
            { _id: false },
         ),
         default: () => ({}),
      },
      /** Chore settings (ignored for other kinds). With rotation, `memberIds` is the turn order. */
      chore: {
         type: new Schema(
            {
               effort: { type: Number, default: 1, min: 1, max: 5 },
               assignmentMode: { type: String, enum: ASSIGNMENT_MODES, default: 'anyone' },
               rotation: { type: Boolean, default: false },
            },
            { _id: false },
         ),
         default: () => ({}),
      },
      rangeStart: { type: Date, required: true },
      rangeEnd: { type: Date, default: null },
   },
   { timestamps: true },
)

calendarItemSchema.index({ householdId: 1, rangeStart: 1 })

export type CalendarItemType = HydratedDocument<InferSchemaType<typeof calendarItemSchema>>
export const CalendarItem = model('CalendarItem', calendarItemSchema)
