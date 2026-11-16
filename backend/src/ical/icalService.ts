import { Temporal } from 'temporal-polyfill'
import { randomToken, sha256 } from '../auth/crypto'
import type { CalendarService, ImportDraft } from '../calendar/calendarService'
import { itemInputSchema } from '../calendar/calendarSchemas'
import { FALLBACK_TIME_ZONE } from '../domain/digest'
import { buildFeed, FEED_FUTURE_DAYS, FEED_PAST_DAYS } from '../domain/icalFeed'
import { IcsReadError, itemInputOf, kindProblem, readIcs, type ImportCandidate, type ImportKind } from '../domain/icalImport'
import { BadRequestError, NotFoundError } from '../errors'
import { CalendarItem } from '../models/calendarItemModel'
import { Household } from '../models/householdModel'
import { IcalFeed, type FeedScope, type IcalFeedType } from '../models/icalFeedModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { User } from '../models/userModel'

/** Don't write "last used" on every fetch; calendar apps poll often. */
const LAST_USED_RESOLUTION_MS = 60 * 60_000

export type FeedView = { enabled: boolean; scope: FeedScope; issuedAt: string | null; lastUsedAt: string | null }
/** Only returned when a link is created or replaced: the token can't be shown again. */
export type NewFeedView = FeedView & { url: string }

const feedView = (feed: IcalFeedType | null): FeedView => ({
   enabled: Boolean(feed),
   scope: feed?.scope ?? 'all',
   issuedAt: feed?.issuedAt.toISOString() ?? null,
   lastUsedAt: feed?.lastUsedAt?.toISOString() ?? null,
})

export type PreviewEntry = {
   uid: string
   title: string
   allDay: boolean
   start: string
   end: string
   timezone: string
   repeats: boolean
   /** Already imported into this household (skipped on import). */
   duplicate: boolean
   /** Why it can't be imported as the chosen kind, or null. */
   problem: string | null
}

export function createIcalService({ calendar, appUrl }: { calendar: CalendarService; appUrl: string }) {
   const feedUrl = (token: string) => new URL(`/api/ical/${token}.ics`, appUrl).toString()

   function read(text: string, tz: string): ImportCandidate[] {
      try {
         return readIcs(text, tz)
      } catch (err) {
         if (err instanceof IcsReadError) throw new BadRequestError(err.message)
         throw err
      }
   }

   /** Each candidate with the item it would become, or why it can't. */
   async function check(me: MembershipType, text: string, kind: ImportKind, tz: string) {
      const candidates = read(text, tz)
      const existing = await CalendarItem.find({ householdId: me.householdId, 'source.uid': { $in: candidates.map((c) => c.uid) } })
         .select('source.uid')
         .lean()
      const imported = new Set(existing.map((i) => i.source?.uid))
      const seen = new Set<string>()
      return candidates.map((candidate) => {
         const duplicate = imported.has(candidate.uid)
         const repeated = seen.has(candidate.uid)
         seen.add(candidate.uid)
         const parsed = itemInputSchema.safeParse(itemInputOf(candidate, kind))
         const problem =
            candidate.problem ??
            kindProblem(candidate, kind) ??
            (repeated ? 'This file lists it twice.' : null) ??
            (parsed.success ? null : (parsed.error.issues[0]?.message ?? 'It can’t be imported.'))
         return { candidate, duplicate, problem, input: parsed.success ? parsed.data : null }
      })
   }

   return {
      async getFeed(me: MembershipType): Promise<FeedView> {
         return feedView(await IcalFeed.findOne({ membershipId: me._id }))
      },

      /** Creates the link, or replaces it (the old one stops working). */
      async createFeed(me: MembershipType, scope: FeedScope, now: Date): Promise<NewFeedView> {
         const token = randomToken()
         const feed = await IcalFeed.findOneAndUpdate(
            { membershipId: me._id },
            {
               $set: { tokenHash: sha256(token), scope, issuedAt: now, lastUsedAt: null },
               $setOnInsert: { householdId: me.householdId },
            },
            { upsert: true, returnDocument: 'after' },
         )
         return { ...feedView(feed), url: feedUrl(token) }
      },

      async setFeedScope(me: MembershipType, scope: FeedScope): Promise<FeedView> {
         const feed = await IcalFeed.findOneAndUpdate({ membershipId: me._id }, { $set: { scope } }, { returnDocument: 'after' })
         if (!feed) throw new NotFoundError('No calendar link yet')
         return feedView(feed)
      },

      async removeFeed(me: MembershipType) {
         await IcalFeed.deleteOne({ membershipId: me._id })
      },

      /** The `.ics` text behind a link; 404 for unknown or revoked tokens. */
      async feed(token: string, now: Date): Promise<string> {
         const feed = await IcalFeed.findOne({ tokenHash: sha256(token) })
         const membership = feed && (await Membership.findOne({ _id: feed.membershipId, householdId: feed.householdId }))
         const household = membership && (await Household.findById(membership.householdId).select('name').lean())
         if (!feed || !membership || !household) throw new NotFoundError('Calendar not found')

         const owner = membership.userId ? await User.findById(membership.userId).select('timezone').lean() : null
         const tz = owner?.timezone ?? FALLBACK_TIME_ZONE
         const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(tz).toPlainDate()
         const startOf = (d: Temporal.PlainDate) => d.toZonedDateTime({ timeZone: tz }).toInstant().toString()
         const instances = await calendar.list(
            membership,
            {
               from: startOf(today.subtract({ days: FEED_PAST_DAYS })),
               to: startOf(today.add({ days: FEED_FUTURE_DAYS + 1 })),
               tz,
               ...(feed.scope === 'mine' ? { memberIds: [membership.id as string] } : {}),
            },
            now,
         )

         const memberships = await Membership.find({ householdId: membership.householdId }).select('userId profile.fname').lean()
         const users = await User.find({ _id: { $in: memberships.flatMap((m) => m.userId ?? []) } }).select('fname').lean()
         const userName = new Map(users.map((u) => [u._id.toString(), u.fname]))
         const names = new Map(
            memberships.map((m) => [m._id.toString(), (m.userId ? userName.get(m.userId.toString()) : m.profile?.fname) ?? '']),
         )

         if (!feed.lastUsedAt || now.getTime() - feed.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
            await IcalFeed.updateOne({ _id: feed._id }, { $set: { lastUsedAt: now } })
         }
         return buildFeed({ name: household.name, instances, names, now, calendarUrl: new URL('/calendar', appUrl).toString() })
      },

      /** What an import would do; nothing is stored. */
      async preview(me: MembershipType, text: string, kind: ImportKind, tz: string): Promise<PreviewEntry[]> {
         return (await check(me, text, kind, tz)).map(({ candidate: c, duplicate, problem }) => ({
            uid: c.uid,
            title: c.title,
            allDay: c.allDay,
            start: c.start,
            end: c.end,
            timezone: c.timezone,
            repeats: Boolean(c.rrule),
            duplicate,
            problem,
         }))
      },

      /** Imports the chosen entries (by UID); duplicates and problem entries are skipped. */
      async import(me: MembershipType, text: string, kind: ImportKind, tz: string, uids: string[], now: Date) {
         const wanted = new Set(uids)
         const chosen = (await check(me, text, kind, tz)).filter((r) => wanted.has(r.candidate.uid))
         const drafts: ImportDraft[] = chosen.flatMap(({ candidate, duplicate, problem, input }) =>
            !duplicate && !problem && input
               ? [{ input, uid: candidate.uid, exdates: candidate.exdates, overrides: candidate.overrides }]
               : [],
         )
         const imported = await calendar.importItems(me, drafts, now)
         return { imported, skipped: chosen.length - imported }
      },
   }
}

export type IcalService = ReturnType<typeof createIcalService>
