import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

const userSchema = new Schema(
   {
      email: {
         type: String,
         required: true,
         unique: true,
         lowercase: true,
         trim: true,
      },
      emailVerifiedAt: { type: Date, default: null },
      passwordHash: { type: String, required: true },
      passwordChangedAt: { type: Date, default: null },
      fname: { type: String, required: true, trim: true },
      lname: { type: String, required: true, trim: true },
      avatarUrl: { type: String, default: null },
      /** IANA zone, saved automatically from the browser; the reminder digest goes out at 08:00 here. */
      timezone: { type: String, default: null },
      /** Optional; `YYYY-MM-DD` or `--MM-DD` (year unknown). Shown to fellow household members. */
      birthday: { type: String, default: null },
      /** Public @handle, stored lowercase; optional until the user picks one. */
      handle: { type: String, default: null, lowercase: true, trim: true },
      /** Opt-in: others may find this account by its exact @handle. */
      findableByHandle: { type: Boolean, default: false },
      /** Household shown after login; validated against memberships on read. */
      lastHouseholdId: { type: Types.ObjectId, ref: 'Household', default: null },
   },
   { timestamps: true },
)

userSchema.index({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } })

userSchema.virtual('fullName').get(function () {
   return `${this.fname} ${this.lname}`.trim()
})

export type UserType = HydratedDocument<InferSchemaType<typeof userSchema>>
export const User = model('User', userSchema)
