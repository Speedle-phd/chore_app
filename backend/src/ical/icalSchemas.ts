import { z } from 'zod'
import { isTimeZone } from '../domain/recurrence'
import { MAX_IMPORT_EVENTS } from '../domain/icalImport'
import { CALENDAR_KINDS } from '../models/calendarItemModel'
import { FEED_SCOPES } from '../models/icalFeedModel'

export const feedScopeSchema = z.object({ scope: z.enum(FEED_SCOPES).default('all') })

/** `/api/ical/<token>.ics`: a token from randomToken() (32 bytes, base64url). */
export const feedParamsSchema = z.object({
   file: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}\.ics$/)
      .transform((f) => f.slice(0, -'.ics'.length)),
})

/** Multipart fields next to the file. */
export const importPreviewSchema = z.object({
   kind: z.enum(CALENDAR_KINDS),
   tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone.'),
})

export const importSchema = importPreviewSchema.extend({
   /** JSON array of the UIDs to import (from the preview). */
   uids: z
      .string()
      .max(500_000)
      .transform((s, ctx) => {
         try {
            return JSON.parse(s) as unknown
         } catch {
            ctx.addIssue({ code: 'custom', message: 'Invalid list of entries.' })
            return z.NEVER
         }
      })
      .pipe(z.array(z.string().max(255)).min(1, 'Pick at least one entry.').max(MAX_IMPORT_EVENTS)),
})
