import type { Types } from 'mongoose'
import { Temporal } from 'temporal-polyfill'
import { createCalendarService } from '../calendar/calendarService'
import { digestDate, digestGroups, FALLBACK_TIME_ZONE, MAX_DIGEST_ATTEMPTS, type DigestReminder } from '../domain/digest'
import type { SendMail } from '../mail/mailer'
import { Household } from '../models/householdModel'
import { Membership } from '../models/membershipModel'
import { Reminder } from '../models/reminderModel'
import { ReminderDigest } from '../models/reminderDigestModel'
import { User } from '../models/userModel'
import { createReminderService } from './reminderService'

/** How long a claimed day stays locked if the worker dies mid-send. */
const CLAIM_MS = 5 * 60_000

export type DigestRun = { checked: number; sent: number; empty: number; failed: number; skipped: number }

type Deps = { now: Date; sendMail: SendMail; appUrl: string; log?: (message: string, extra?: object) => void }

const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000

/**
 * One run of the reminder worker: for everyone with reminders whose local time
 * is past 08:00, send today's digest once. Safe to run often and concurrently:
 * each person's day is claimed atomically and sent at most once.
 */
export async function runReminderDigests({ now, sendMail, appUrl, log = () => {} }: Deps): Promise<DigestRun> {
   const run: DigestRun = { checked: 0, sent: 0, empty: 0, failed: 0, skipped: 0 }
   const reminders = createReminderService(createCalendarService())
   const subscriberIds = await Reminder.distinct('membershipId')
   const memberships = await Membership.find({ _id: { $in: subscriberIds }, userId: { $type: 'objectId' } })
   const byUser = Map.groupBy(memberships, (m) => (m.userId as Types.ObjectId).toString())
   const users = await User.find({ _id: { $in: [...byUser.keys()] } })
      .select('email fname timezone emailVerifiedAt')
      .lean()
   const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime())

   for (const user of users) {
      run.checked++
      const timeZone = user.timezone ?? FALLBACK_TIME_ZONE
      const date = digestDate(instant, timeZone)
      // Before 08:00 locally, or no confirmed address: nothing to do (yet).
      if (!date || !user.emailVerifiedAt) {
         run.skipped++
         continue
      }
      if (!(await claim(user._id, date, now))) {
         run.skipped++
         continue
      }

      try {
         const due: DigestReminder[] = []
         for (const membership of byUser.get(user._id.toString()) ?? []) {
            const household = await Household.findById(membership.householdId).select('name').lean()
            for (const r of await reminders.upcoming(membership, timeZone, now, 1)) {
               due.push({ household: household?.name ?? 'Your household', ...r })
            }
         }
         if (!due.length) {
            await ReminderDigest.updateOne({ userId: user._id, date }, { $set: { status: 'sent', count: 0, lockedUntil: null } })
            run.empty++
            continue
         }
         await sendMail('reminder_digest', user.email, {
            name: user.fname,
            date: Temporal.PlainDate.from(date).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
            groups: digestGroups(due, timeZone),
            count: due.length,
            link: new URL('/settings', appUrl).toString(),
         })
         await ReminderDigest.updateOne(
            { userId: user._id, date },
            { $set: { status: 'sent', count: due.length, sentAt: now, lockedUntil: null, error: null } },
         )
         run.sent++
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error)
         await ReminderDigest.updateOne({ userId: user._id, date }, { $set: { status: 'failed', lockedUntil: null, error: message } })
         log('reminder digest failed', { userId: user._id.toString(), date, error: message })
         run.failed++
      }
   }
   return run
}

/**
 * Claims a person's day: creates it, or takes it over when it failed earlier
 * (under the attempt limit) or its lock expired. Sent days never match.
 */
async function claim(userId: Types.ObjectId, date: string, now: Date): Promise<boolean> {
   try {
      const result = await ReminderDigest.updateOne(
         {
            userId,
            date,
            status: { $ne: 'sent' },
            attempts: { $lt: MAX_DIGEST_ATTEMPTS },
            $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
         },
         { $set: { status: 'sending', lockedUntil: new Date(now.getTime() + CLAIM_MS) }, $inc: { attempts: 1 } },
         { upsert: true },
      )
      return result.matchedCount + result.upsertedCount > 0
   } catch (error) {
      // The day exists but doesn't match (already sent, locked, or out of attempts).
      if (isDuplicateKey(error)) return false
      throw error
   }
}
