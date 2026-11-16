import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { ASSIGNMENT_MODES } from '../domain/chores'

export const CALENDAR_KINDS = ['chore', 'event', 'birthday', 'vacation', 'meal'] as const
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
      /** Birthday entries: the year the person was born (for the age), if known. */
      birthYear: { type: Number, default: null },
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
      /**
       * Chores: archived (stopped) since then. Only occurrences with completions are
       * listed (history); restoring skips the dates in between. Null = active.
       */
      archivedAt: { type: Date, default: null },
      /** Meals: the recipe (null = free text, e.g. "Pizza out" or a deleted recipe) and how many it's for. */
      meal: {
         type: new Schema(
            {
               recipeId: { type: Types.ObjectId, ref: 'Recipe', default: null },
               servings: { type: Number, default: 4, min: 1, max: 100 },
            },
            { _id: false },
         ),
         default: null,
      },
      /** Imported from an `.ics` file: its UID (to spot repeated imports). */
      source: {
         type: new Schema(
            {
               uid: { type: String, required: true, maxlength: 255 },
               importedAt: { type: Date, required: true },
            },
            { _id: false },
         ),
         default: null,
      },
      rangeStart: { type: Date, required: true },
      rangeEnd: { type: Date, default: null },
   },
   { timestamps: true },
)

calendarItemSchema.index({ householdId: 1, rangeStart: 1 })
calendarItemSchema.index({ householdId: 1, 'source.uid': 1 }, { partialFilterExpression: { 'source.uid': { $type: 'string' } } })

export type CalendarItemType = HydratedDocument<InferSchemaType<typeof calendarItemSchema>>
export const CalendarItem = model('CalendarItem', calendarItemSchema)
