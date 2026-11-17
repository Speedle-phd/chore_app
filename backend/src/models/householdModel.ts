import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { STATE_CODES } from '../domain/holidayCatalog.de'

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
      /** Where the household lives, for public holidays in the calendar. No state = no holidays shown. */
      region: {
         type: new Schema({ state: { type: String, enum: [...STATE_CODES, null], default: null } }, { _id: false }),
         default: () => ({}),
      },
      /** When the default shopping categories and first list were created (claimed atomically, once). */
      shoppingSeededAt: { type: Date, default: null },
      /** When the starter packing templates were created (claimed atomically, once). */
      packingSeededAt: { type: Date, default: null },
      /** Keys of the starter packing templates this household has received (each once; see domain/packingStarters.ts). */
      packingStarters: { type: [String], default: [] },
   },
   { timestamps: true },
)

export type HouseholdType = HydratedDocument<InferSchemaType<typeof householdSchema>>
export const Household = model('Household', householdSchema)
