import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { GUEST_SECTIONS, WIFI_SECURITY } from '../domain/guest'

const text = (max: number) => ({ type: String, default: '', maxlength: max })

/**
 * What the household writes down for guests (babysitter, house sitter). One per household,
 * edited by owners/admins, readable by members; guests see it through a GuestLink.
 * Validation lives in guestSchemas.ts; the limits here are a backstop.
 */
const guestInfoSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      wifi: {
         type: new Schema(
            {
               network: text(64),
               password: text(64),
               security: { type: String, enum: WIFI_SECURITY, default: 'WPA' },
               hidden: { type: Boolean, default: false },
            },
            { _id: false },
         ),
         default: null,
      },
      emergency: {
         address: text(300),
         numbers: [new Schema({ label: text(40), number: text(40) }, { _id: false })],
         pharmacy: text(300),
      },
      contacts: [new Schema({ name: text(80), relation: text(60), phone: text(40), note: text(300) }, { _id: false })],
      people: [new Schema({ name: text(80), bedtime: text(80), meals: text(500), rules: text(1000) }, { _id: false })],
      notes: [new Schema({ title: text(80), text: text(2000) }, { _id: false })],
      updatedBy: { type: Types.ObjectId, ref: 'Membership', default: null },
   },
   { timestamps: true },
)
guestInfoSchema.index({ householdId: 1 }, { unique: true })

export type GuestInfoType = HydratedDocument<InferSchemaType<typeof guestInfoSchema>>
export const GuestInfo = model('GuestInfo', guestInfoSchema)

/**
 * A secret link to the guest page. Only the token's hash is stored; the link is shown once
 * (create / replace). Revoking deletes it.
 */
const guestLinkSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      label: { type: String, required: true, maxlength: 60 },
      sections: [{ type: String, enum: GUEST_SECTIONS }],
      expiresAt: { type: Date, default: null },
      tokenHash: { type: String, required: true },
      issuedAt: { type: Date, required: true },
      lastOpenedAt: { type: Date, default: null },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
   },
   { timestamps: true },
)
guestLinkSchema.index({ tokenHash: 1 }, { unique: true })
guestLinkSchema.index({ householdId: 1, _id: 1 })

export type GuestLinkType = HydratedDocument<InferSchemaType<typeof guestLinkSchema>>
export const GuestLink = model('GuestLink', guestLinkSchema)
