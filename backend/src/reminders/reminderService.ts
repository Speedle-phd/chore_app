import { isValidObjectId, type Types } from 'mongoose'
import { Temporal } from 'temporal-polyfill'
import type { CalendarService } from '../calendar/calendarService'
import { MAX_LEAD_DAYS, plannedReminders, type ReminderTarget } from '../domain/reminders'
import { BadRequestError, NotFoundError } from '../errors'
import { CalendarItem } from '../models/calendarItemModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { Reminder } from '../models/reminderModel'
import { User } from '../models/userModel'

export type ReminderInput = { target: ReminderTarget; leadDays: number[] }

type StoredReminder = {
   _id: Types.ObjectId
   target: { type: ReminderTarget['type']; itemId?: Types.ObjectId | null; memberId?: Types.ObjectId | null }
   leadDays: number[]
   channels: string[]
}

const targetOf = (r: StoredReminder): ReminderTarget =>
   r.target.type === 'item'
      ? { type: 'item', itemId: String(r.target.itemId) }
      : r.target.type === 'member'
        ? { type: 'member', memberId: String(r.target.memberId) }
        : { type: 'allBirthdays' }

/** Names for member targets (accounts: from the user; profiles: from the membership). */
async function memberNames(ids: Types.ObjectId[]) {
   const memberships = await Membership.find({ _id: { $in: ids } }).lean()
   const users = await User.find({ _id: { $in: memberships.flatMap((m) => (m.userId ? [m.userId] : [])) } })
      .select('fname')
      .lean()
   const userName = new Map(users.map((u) => [u._id.toString(), u.fname]))
   return new Map(
      memberships.map((m) => [m._id.toString(), (m.userId ? userName.get(m.userId.toString()) : m.profile?.fname) ?? 'Someone']),
   )
}

export function createReminderService(calendar: CalendarService) {
   async function views(reminders: StoredReminder[]) {
      const itemIds = reminders.flatMap((r) => (r.target.itemId ? [r.target.itemId] : []))
      const memberIds = reminders.flatMap((r) => (r.target.memberId ? [r.target.memberId] : []))
      const titles = new Map((await CalendarItem.find({ _id: { $in: itemIds } }).select('title').lean()).map((i) => [i._id.toString(), i.title]))
      const names = await memberNames(memberIds)
      return reminders.map((r) => {
         const target = targetOf(r)
         const label =
            target.type === 'item'
               ? (titles.get(target.itemId) ?? 'Deleted entry')
               : target.type === 'member'
                 ? `${names.get(target.memberId) ?? 'Someone'}’s birthday`
                 : 'All birthdays'
         return { id: r._id.toString(), target, label, leadDays: [...r.leadDays].sort((a, b) => a - b), channels: r.channels }
      })
   }

   return {
      /** The caller's own subscriptions in this household. */
      async list(me: MembershipType) {
         return views(await Reminder.find({ membershipId: me._id }).sort({ createdAt: 1, _id: 1 }).lean())
      },

      /** Create or update the caller's subscription for a target (one per target). */
      async save(me: MembershipType, input: ReminderInput) {
         const { target } = input
         if (target.type === 'item') {
            const exists = isValidObjectId(target.itemId) && (await CalendarItem.exists({ _id: target.itemId, householdId: me.householdId }))
            if (!exists) throw new NotFoundError('Entry not found')
         }
         if (target.type === 'member') {
            const exists = isValidObjectId(target.memberId) && (await Membership.exists({ _id: target.memberId, householdId: me.householdId }))
            if (!exists) throw new BadRequestError('Pick someone from this household.')
         }
         const filter = {
            membershipId: me._id,
            'target.type': target.type,
            'target.itemId': target.type === 'item' ? target.itemId : null,
            'target.memberId': target.type === 'member' ? target.memberId : null,
         }
         const saved = await Reminder.findOneAndUpdate(
            filter,
            {
               $set: { leadDays: [...new Set(input.leadDays)], householdId: me.householdId },
               $setOnInsert: {
                  target: {
                     type: target.type,
                     itemId: target.type === 'item' ? target.itemId : null,
                     memberId: target.type === 'member' ? target.memberId : null,
                  },
               },
            },
            { upsert: true, new: true },
         ).lean()
         const [view] = await views([saved as StoredReminder])
         return view
      },

      async remove(me: MembershipType, id: string) {
         const result = isValidObjectId(id) ? await Reminder.deleteOne({ _id: id, membershipId: me._id }) : { deletedCount: 0 }
         if (!result.deletedCount) throw new NotFoundError('Reminder not found')
      },

      /** What the caller's reminders would send in the next `days` days (send date, what, how far ahead). */
      async upcoming(me: MembershipType, tz: string, now: Date, days: number) {
         const subs = await Reminder.find({ membershipId: me._id }).lean()
         if (!subs.length) return []
         const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(tz).toPlainDate()
         const until = today.add({ days })
         const startOf = (d: Temporal.PlainDate) => d.toZonedDateTime({ timeZone: tz }).toInstant().toString()
         const instances = await calendar.list(me, { from: startOf(today), to: startOf(until.add({ days: MAX_LEAD_DAYS })), tz }, now)
         const byKey = new Map(instances.map((i) => [i.id, i]))
         const happenings = instances.map((i) => ({
            key: i.id,
            kind: i.kind,
            date: i.allDay ? i.start : Temporal.Instant.from(i.start).toZonedDateTimeISO(tz).toPlainDate().toString(),
            itemId: i.itemId || null,
            memberId: i.source === 'member' ? (i.memberIds[0] ?? null) : null,
         }))
         const subscriptions = subs.map((s) => ({ id: s._id.toString(), target: targetOf(s as StoredReminder), leadDays: s.leadDays }))
         return plannedReminders(subscriptions, happenings, today.toString(), until.toString()).map((p) => {
            const instance = byKey.get(p.happening.key)
            return {
               sendOn: p.sendOn,
               leadDays: p.leadDays,
               date: p.happening.date,
               kind: p.happening.kind,
               title: instance?.title ?? '',
               allDay: instance?.allDay ?? true,
               start: instance?.start ?? p.happening.date,
               age: instance?.age ?? null,
            }
         })
      },
   }
}

export type ReminderService = ReturnType<typeof createReminderService>
