import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { UNIT_IDS } from '../domain/units'

/** A household recipe. Ingredients keep the written line plus its parsed parts (for scaling and lists). */
const recipeSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      title: { type: String, required: true, trim: true, maxlength: 120 },
      description: { type: String, default: '', maxlength: 2000 },
      servings: { type: Number, default: 4, min: 1, max: 100 },
      prepMinutes: { type: Number, default: null, min: 0, max: 2880 },
      cookMinutes: { type: Number, default: null, min: 0, max: 2880 },
      ingredients: {
         type: [
            new Schema(
               {
                  text: { type: String, required: true, maxlength: 200 },
                  quantity: { type: Number, default: null },
                  unit: { type: String, enum: [...UNIT_IDS, null], default: null },
                  name: { type: String, required: true, maxlength: 200 },
                  note: { type: String, default: '', maxlength: 200 },
               },
               { _id: false },
            ),
         ],
         default: [],
      },
      steps: { type: [{ type: String, maxlength: 4000 }], default: [] },
      /** Catalog spelling or the household's own (domain/recipeTags.ts `normalizeTags`). */
      tags: { type: [String], default: [] },
      imageUrl: { type: String, default: null },
      sourceUrl: { type: String, default: null, maxlength: 2000 },
      /** One per member (membership id), 1–5. */
      ratings: {
         type: [new Schema({ memberId: { type: Types.ObjectId, ref: 'Membership', required: true }, stars: { type: Number, min: 1, max: 5, required: true } }, { _id: false })],
         default: [],
      },
      /** Derived from `ratings` on every change (for sorting and filtering). */
      ratingAvg: { type: Number, default: null },
      cooked: {
         type: new Schema({ count: { type: Number, default: 0 }, lastAt: { type: Date, default: null } }, { _id: false }),
         default: () => ({}),
      },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
   },
   { timestamps: true },
)
recipeSchema.index({ householdId: 1, title: 1 })
recipeSchema.index({ householdId: 1, tags: 1 })

export type RecipeType = HydratedDocument<InferSchemaType<typeof recipeSchema>>
export const Recipe = model('Recipe', recipeSchema)
