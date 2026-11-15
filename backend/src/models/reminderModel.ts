import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { REMINDER_TARGETS } from '../domain/reminders'

export const REMINDER_CHANNELS = ['email'] as const

/**
 * "Remind me": a member (with a login) subscribes to an entry, a member's
 * birthday, or all birthdays of the household. Sending happens elsewhere
 * (planned: a scheduler that e-mails through the mailer).
 */
const reminderSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      /** Subscriber (membership of an account). */
      membershipId: { type: Types.ObjectId, ref: 'Membership', required: true },
      target: {
         type: new Schema(
            {
               type: { type: String, enum: REMINDER_TARGETS, required: true },
               itemId: { type: Types.ObjectId, ref: 'CalendarItem', default: null },
               memberId: { type: Types.ObjectId, ref: 'Membership', default: null },
            },
            { _id: false },
         ),
         required: true,
      },
      /** Days before (0 = on the day). */
      leadDays: { type: [Number], default: [0] },
      channels: { type: [{ type: String, enum: REMINDER_CHANNELS }], default: ['email'] },
   },
   { timestamps: true },
)

// One subscription per subscriber and target.
reminderSchema.index({ membershipId: 1, 'target.type': 1, 'target.itemId': 1, 'target.memberId': 1 }, { unique: true })
reminderSchema.index({ householdId: 1 })
reminderSchema.index({ 'target.itemId': 1 })

export type ReminderType = HydratedDocument<InferSchemaType<typeof reminderSchema>>
export const Reminder = model('Reminder', reminderSchema)
