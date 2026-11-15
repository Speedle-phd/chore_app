import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

const householdSchema = new Schema(
   {
      name: { type: String, required: true, trim: true, maxlength: 60 },
      createdBy: { type: Types.ObjectId, ref: 'User', required: true },
      /** Playful parts of the chore stats; owners/admins switch them off. Plain statistics stay. */
      motivation: {
         type: new Schema(
            {
               leaderboard: { type: Boolean, default: true },
               badges: { type: Boolean, default: true },
               streaks: { type: Boolean, default: true },
            },
            { _id: false },
         ),
         default: () => ({}),
      },
   },
   { timestamps: true },
)

export type HouseholdType = HydratedDocument<InferSchemaType<typeof householdSchema>>
export const Household = model('Household', householdSchema)
