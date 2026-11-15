import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const DIGEST_STATUSES = ['sending', 'sent', 'failed'] as const

/**
 * One daily reminder digest per person and local date. The unique key makes
 * sending idempotent: a worker claims the day (status "sending"), sends, then
 * marks it "sent"; a failure is retried on the next run up to a limit.
 */
const reminderDigestSchema = new Schema(
   {
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      /** Local date (`YYYY-MM-DD`) in the person's zone. */
      date: { type: String, required: true },
      status: { type: String, enum: DIGEST_STATUSES, required: true },
      attempts: { type: Number, default: 0 },
      /** A claim expires, so a crashed worker doesn't block the day forever. */
      lockedUntil: { type: Date, default: null },
      /** How many reminders the e-mail listed (0 = nothing due, nothing sent). */
      count: { type: Number, default: 0 },
      sentAt: { type: Date, default: null },
      error: { type: String, default: null },
   },
   { timestamps: true },
)

reminderDigestSchema.index({ userId: 1, date: 1 }, { unique: true })

export type ReminderDigestType = HydratedDocument<InferSchemaType<typeof reminderDigestSchema>>
export const ReminderDigest = model('ReminderDigest', reminderDigestSchema)
