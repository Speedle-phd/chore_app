import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { normalizeBirthday } from '../domain/birthdays'
import { ROLES } from '../models/membershipModel'

const name = z.string().trim().min(1, 'Enter a name.').max(60)
const personName = z.string().trim().min(1).max(50)

export const householdNameSchema = z.object({ name })
/** `YYYY-MM-DD`, `--MM-DD` (year unknown) or empty (none). */
export const birthdaySchema = z
   .string()
   .trim()
   .max(10)
   .transform((value, ctx) => {
      if (!value) return null
      const normalized = normalizeBirthday(value, new Date().toISOString().slice(0, 10))
      if (!normalized) {
         ctx.addIssue({ code: 'custom', message: 'Enter a valid birthday (not in the future).' })
         return z.NEVER
      }
      return normalized
   })

export const profileSchema = z.object({ fname: personName, lname: personName, birthday: birthdaySchema.optional() })
export const roleSchema = z.object({ role: z.enum(ROLES) })
export const objectId = z.string().refine(isValidObjectId, 'Invalid id')
