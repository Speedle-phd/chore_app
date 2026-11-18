import { z } from 'zod'
import { GUEST_LIMITS, GUEST_SECTIONS, ssidTooLong, WIFI_SECURITY, wifiPasswordProblem } from '../domain/guest'

const text = (max: number, label: string) => z.string().trim().max(max, `${label} is too long (at most ${max} characters).`)
const required = (max: number, label: string) => text(max, label).min(1, `${label} is missing.`)
/** Digits with the usual separators, optionally starting with +. */
const phone = (label: string) =>
   z
      .string()
      .trim()
      .max(40, `${label} is too long.`)
      .regex(/^\+?[0-9][0-9 ()/.-]*$/, `${label}: only digits, spaces, + ( ) / . - please.`)

const wifiSchema = z
   .object({
      network: required(64, 'Network name').refine((n) => !ssidTooLong(n), 'Network name is too long (at most 32 bytes).'),
      password: z.string().max(64, 'The password is too long.'),
      security: z.enum(WIFI_SECURITY),
      hidden: z.boolean().default(false),
   })
   .superRefine((w, ctx) => {
      const problem = wifiPasswordProblem(w.security, w.password)
      if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem })
   })

/** The whole guest page (PUT replaces it). */
export const guestContentSchema = z.object({
   wifi: wifiSchema.nullable(),
   emergency: z.object({
      address: text(300, 'Address'),
      numbers: z
         .array(z.object({ label: required(40, 'Label'), number: phone('Number').min(1, 'Number is missing.') }))
         .max(GUEST_LIMITS.numbers, `At most ${GUEST_LIMITS.numbers} numbers.`),
      pharmacy: text(300, 'Pharmacy'),
   }),
   contacts: z
      .array(
         z.object({
            name: required(80, 'Name'),
            relation: text(60, 'Relation'),
            phone: phone('Phone').min(1, 'Phone number is missing.'),
            note: text(300, 'Note'),
         }),
      )
      .max(GUEST_LIMITS.contacts, `At most ${GUEST_LIMITS.contacts} contacts.`),
   people: z
      .array(z.object({ name: required(80, 'Name'), bedtime: text(80, 'Bedtime'), meals: text(500, 'Meals'), rules: text(1000, 'Rules') }))
      .max(GUEST_LIMITS.people, `At most ${GUEST_LIMITS.people} people.`),
   notes: z
      .array(z.object({ title: required(80, 'Title'), text: text(2000, 'Text') }))
      .max(GUEST_LIMITS.notes, `At most ${GUEST_LIMITS.notes} notes.`),
})

const sections = z
   .array(z.enum(GUEST_SECTIONS))
   .min(1, 'Pick at least one section.')
   .transform((s) => GUEST_SECTIONS.filter((x) => s.includes(x)))

/** An instant in the future (the client sends the end of the chosen day in its zone). */
const expiresAt = z.iso.datetime({ offset: true }).transform((s) => new Date(s)).nullable()

export const linkInputSchema = z.object({ label: required(60, 'Label'), sections, expiresAt: expiresAt.default(null) })
export const linkPatchSchema = z
   .object({ label: required(60, 'Label'), sections, expiresAt })
   .partial()
   .refine((p) => Object.keys(p).length > 0, 'Nothing to change.')

/** `/api/guest/<token>`: a token from randomToken() (32 bytes, base64url). */
export const tokenParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
