import { Temporal } from 'temporal-polyfill'

/**
 * Reminder subscriptions: someone asks to be reminded of an entry (any kind), a
 * member's birthday, or all birthdays in the household, some days before.
 * This module only plans *what* is due *when*; sending (e-mail, …) comes later.
 */

export const REMINDER_TARGETS = ['item', 'member', 'allBirthdays'] as const
export type ReminderTarget =
   | { type: 'item'; itemId: string }
   | { type: 'member'; memberId: string }
   | { type: 'allBirthdays' }

/** Offered lead times (days before). App choice. */
export const LEAD_DAYS = [0, 1, 7] as const
export const MAX_LEAD_DAYS = 30

export type Subscription = { id: string; target: ReminderTarget; leadDays: number[] }

/** An occurrence as the planner needs it: what, and its local date for the subscriber. */
export type Happening = {
   key: string
   kind: string
   date: string
   itemId: string | null
   /** For birthdays from member profiles. */
   memberId: string | null
}

export type PlannedReminder = { sendOn: string; leadDays: number; happening: Happening; subscriptionIds: string[] }

export function matches(target: ReminderTarget, h: Happening): boolean {
   if (target.type === 'item') return h.itemId === target.itemId
   if (target.type === 'member') return h.kind === 'birthday' && h.memberId === target.memberId
   return h.kind === 'birthday'
}

/**
 * Reminders to send on days in [from, to). Pass happenings up to `to + MAX_LEAD_DAYS`
 * so early reminders for later dates are included. The same happening and lead time
 * from two subscriptions (e.g. "all birthdays" + one birthday) is sent once.
 */
export function plannedReminders(subs: Subscription[], happenings: Happening[], from: string, to: string): PlannedReminder[] {
   const planned = new Map<string, PlannedReminder>()
   for (const h of happenings) {
      for (const sub of subs) {
         if (!matches(sub.target, h)) continue
         for (const lead of sub.leadDays) {
            const sendOn = Temporal.PlainDate.from(h.date).subtract({ days: lead }).toString()
            if (sendOn < from || sendOn >= to) continue
            const key = `${h.key}|${lead}`
            const existing = planned.get(key)
            if (existing) existing.subscriptionIds.push(sub.id)
            else planned.set(key, { sendOn, leadDays: lead, happening: h, subscriptionIds: [sub.id] })
         }
      }
   }
   return [...planned.values()].sort((a, b) => a.sendOn.localeCompare(b.sendOn) || a.happening.date.localeCompare(b.happening.date))
}
