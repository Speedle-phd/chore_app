import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

const householdSchema = new Schema(
   {
      name: { type: String, required: true, trim: true, maxlength: 60 },
      createdBy: { type: Types.ObjectId, ref: 'User', required: true },
   },
   { timestamps: true },
)

export type HouseholdType = HydratedDocument<InferSchemaType<typeof householdSchema>>
export const Household = model('Household', householdSchema)
