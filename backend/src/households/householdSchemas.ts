import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { normalizeBirthday } from '../domain/birthdays'
import { STATE_CODES } from '../domain/holidayCatalog.de'
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
/** The household's Bundesland for public holidays; null switches them off. */
export const regionSchema = z.object({ state: z.enum(STATE_CODES).nullable() }).strict()

const DAY_MS = 24 * 60 * 60 * 1000
/** Holidays on local dates [from, to): at most 400 days (the year view needs a little over a year). */
export const holidayRangeSchema = z
   .object({ from: z.iso.date(), to: z.iso.date() })
   .refine((q) => q.from < q.to, { message: '`from` must be before `to`.', path: ['to'] })
   .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 400 * DAY_MS, { message: 'Ask for at most 400 days.', path: ['to'] })

export const motivationSchema = z
   .object({ leaderboard: z.boolean(), badges: z.boolean(), streaks: z.boolean() })
   .partial()
   .strict()
   .refine((m) => Object.keys(m).length > 0, 'Nothing to change.')
