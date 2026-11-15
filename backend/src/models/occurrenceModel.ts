import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { COMPLETION_STATUSES } from '../domain/chores'

/**
 * A change to one occurrence of a calendar item, keyed by its original start
 * (iCalendar RECURRENCE-ID). Sparse: only occurrences that differ from the
 * series are stored, or that have completions (who did it, kept for statistics).
 */
const occurrenceSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      itemId: { type: Types.ObjectId, ref: 'CalendarItem', required: true },
      originalStart: { type: String, required: true },
      start: { type: String, default: null },
      end: { type: String, default: null },
      memberIds: { type: [{ type: Types.ObjectId, ref: 'Membership' }], default: null },
      cancelled: { type: Boolean, default: false },
      completions: {
         type: [
            new Schema(
               {
                  memberId: { type: Types.ObjectId, ref: 'Membership', required: true },
                  status: { type: String, enum: COMPLETION_STATUSES, required: true },
                  at: { type: Date, required: true },
                  /** Membership that recorded it (differs when marked for a profile). */
                  by: { type: Types.ObjectId, ref: 'Membership', required: true },
                  note: { type: String, default: '', maxlength: 500 },
               },
               { _id: false },
            ),
         ],
         default: [],
      },
   },
   { timestamps: true },
)

occurrenceSchema.index({ itemId: 1, originalStart: 1 }, { unique: true })
occurrenceSchema.index({ householdId: 1 })

export type OccurrenceType = HydratedDocument<InferSchemaType<typeof occurrenceSchema>>
export const Occurrence = model('Occurrence', occurrenceSchema)
