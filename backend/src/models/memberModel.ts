import { Schema, model } from 'mongoose'
import { z } from 'zod'
import type { InferSchemaType, HydratedDocument } from 'mongoose'

export const RoleEnum = ['admin', 'member'] as const
export const RoleSchema = z.enum(RoleEnum)
export type Role = z.infer<typeof RoleSchema>
const memberSchema = new Schema({
   fname: {
      type: String,
      required: true,
   },
   lname: {
      type: String,
      required: true,
   },
   fullName: {
      type: String,
      required: true,
   },
   handle: {
      type: String,
      required: true,
      unique: true,
   },
   email: {
      type: String,
      required: true,
      unique: true,
   },
   role: {
      type: String,
      required: true,
      enum: RoleEnum,
      default: 'member',
   },
   avatarUrl: {
      type: String,
   },
}, {
   timestamps: true,
})
export type MemberType = HydratedDocument<InferSchemaType<typeof memberSchema>>
export const Member = model('Member', memberSchema)