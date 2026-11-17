import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { PACKING_SECTIONS } from '../domain/packing'

/** At most this many items per template / list (embedded, so bounded). App choice. */
export const MAX_TEMPLATE_ITEMS = 300
export const MAX_LIST_ITEMS = 500

/** A reusable packing list ("Summer holiday"); per-person items are copied for each traveller. */
const packingTemplateSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      name: { type: String, required: true, trim: true, maxlength: 60 },
      items: {
         type: [
            new Schema(
               {
                  text: { type: String, required: true, trim: true, maxlength: 100 },
                  section: { type: String, enum: PACKING_SECTIONS, required: true },
                  perPerson: { type: Boolean, default: false },
                  /** How many (null = no amount); per day × trip days, capped by maxAmount. */
                  amount: { type: Number, default: null, min: 0 },
                  perDay: { type: Boolean, default: false },
                  maxAmount: { type: Number, default: null, min: 1 },
               },
               { _id: false },
            ),
         ],
         default: [],
      },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
   },
   { timestamps: true },
)
packingTemplateSchema.index({ householdId: 1, name: 1 })

/** One trip's list. `vacationId` links it to a vacation entry (unlinked when that is deleted). */
const packingListSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      name: { type: String, required: true, trim: true, maxlength: 60 },
      vacationId: { type: Types.ObjectId, ref: 'CalendarItem', default: null },
      travellerIds: { type: [{ type: Types.ObjectId, ref: 'Membership' }], default: [] },
      /** Trip length used for per-day amounts; null = unknown. */
      days: { type: Number, default: null, min: 1 },
      items: {
         type: [
            new Schema({
               text: { type: String, required: true, trim: true, maxlength: 100 },
               section: { type: String, enum: PACKING_SECTIONS, required: true },
               /** Whose it is; null = shared. */
               memberId: { type: Types.ObjectId, ref: 'Membership', default: null },
               /** How many to pack; null = no amount (an ID card). */
               quantity: { type: Number, default: null, min: 1 },
               checked: { type: Boolean, default: false },
               checkedBy: { type: Types.ObjectId, ref: 'Membership', default: null },
               checkedAt: { type: Date, default: null },
            }),
         ],
         default: [],
      },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
      archivedAt: { type: Date, default: null },
   },
   { timestamps: true },
)
packingListSchema.index({ householdId: 1, archivedAt: 1 })
packingListSchema.index({ vacationId: 1 })

export type PackingTemplateType = HydratedDocument<InferSchemaType<typeof packingTemplateSchema>>
export type PackingListType = HydratedDocument<InferSchemaType<typeof packingListSchema>>
export const PackingTemplate = model('PackingTemplate', packingTemplateSchema)
export const PackingList = model('PackingList', packingListSchema)
