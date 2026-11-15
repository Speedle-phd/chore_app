import { Temporal } from 'temporal-polyfill'
import { BADGES, earnBadges } from '../domain/badges'
import { activitySeries, choreStats, creditedCompletions, fairShare, memberStats, streaks, totals, type StatsRow } from '../domain/stats'
import { NotFoundError } from '../errors'
import { Household } from '../models/householdModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import type { CalendarService } from './calendarService'
import type { CalendarInstance } from './calendarViews'

/** History is loaded in chunks this long (expansion caps instances per item and call). */
const CHUNK_DAYS = 365
/** Periods longer than this are shown per week instead of per day. */
const DAILY_UP_TO_DAYS = 45

export type StatsQuery = { from: string; to: string; tz: string }

/** One chore occurrence as the statistics need it. */
function toRow(i: CalendarInstance, tz: string): StatsRow | null {
   if (!i.chore) return null
   const zoned = (local: string) =>
      i.allDay ? Temporal.PlainDate.from(local).toZonedDateTime({ timeZone: tz }) : Temporal.Instant.from(local).toZonedDateTimeISO(tz)
   return {
      itemId: i.itemId,
      title: i.title,
      effort: i.chore.effort,
      mode: i.chore.assignmentMode,
      date: zoned(i.start).toPlainDate().toString(),
      due: zoned(i.end).epochMilliseconds,
      assignees: i.memberIds,
      state: i.chore.state,
      overdue: i.chore.overdue,
      completions: i.chore.completions.map((c) => ({ memberId: c.memberId, status: c.status, at: Date.parse(c.at) })),
   }
}

export function createStatsService(calendar: CalendarService) {
   /** Every chore occurrence from the household's start until the end of today. */
   async function history(me: MembershipType, start: Temporal.PlainDate, end: Temporal.PlainDate, tz: string, now: Date) {
      const startOf = (d: Temporal.PlainDate) => d.toZonedDateTime({ timeZone: tz }).toInstant().toString()
      const byId = new Map<string, StatsRow>()
      for (let from = start; Temporal.PlainDate.compare(from, end) < 0; from = from.add({ days: CHUNK_DAYS })) {
         const to = Temporal.PlainDate.compare(from.add({ days: CHUNK_DAYS }), end) < 0 ? from.add({ days: CHUNK_DAYS }) : end
         const instances = await calendar.list(me, { from: startOf(from), to: startOf(to), tz, kinds: ['chore'] }, now)
         for (const i of instances) {
            const row = toRow(i, tz)
            // Occurrences on a chunk boundary come twice.
            if (row) byId.set(i.id, row)
         }
      }
      return [...byId.values()]
   }

   return {
      async stats(me: MembershipType, query: StatsQuery, now: Date) {
         const household = await Household.findById(me.householdId).lean()
         if (!household) throw new NotFoundError('Household not found')
         const motivation = {
            leaderboard: household.motivation?.leaderboard ?? true,
            badges: household.motivation?.badges ?? true,
            streaks: household.motivation?.streaks ?? true,
         }
         const tz = query.tz
         const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(tz).toPlainDate()
         const founded = Temporal.Instant.fromEpochMilliseconds(household.createdAt.getTime()).toZonedDateTimeISO(tz).toPlainDate()
         const firstDay = Temporal.PlainDate.compare(query.from, founded) < 0 ? Temporal.PlainDate.from(query.from) : founded
         const rows = await history(me, firstDay, today.add({ days: 1 }), tz, now)
         const inPeriod = rows.filter((r) => r.date >= query.from && r.date < query.to)

         const memberships = await Membership.find({ householdId: me.householdId }).sort({ createdAt: 1 }).lean()
         const memberIds = memberships.map((m) => m._id.toString())
         const perMember = memberStats(inPeriod, memberIds)
         const share = fairShare(perMember)
         const periodPoints = perMember.reduce((sum, m) => sum + m.points, 0)
         const doneDays = new Map<string, string[]>()
         for (const row of rows) {
            for (const c of creditedCompletions(row)) {
               const day = Temporal.Instant.fromEpochMilliseconds(c.at).toZonedDateTimeISO(tz).toPlainDate().toString()
               doneDays.set(c.memberId, [...(doneDays.get(c.memberId) ?? []), day])
            }
         }
         const days = Temporal.PlainDate.from(query.from).until(query.to, { largestUnit: 'day' }).days

         return {
            from: query.from,
            to: query.to,
            today: today.toString(),
            bucket: days > DAILY_UP_TO_DAYS ? ('week' as const) : ('day' as const),
            motivation,
            fairShare: share,
            totals: totals(inPeriod),
            members: perMember.map((m) => ({
               ...m,
               share: periodPoints ? m.points / periodPoints : null,
               streak: motivation.streaks ? streaks(doneDays.get(m.memberId) ?? [], today.toString()) : null,
               badges: motivation.badges
                  ? earnBadges(rows, m.memberId, tz).map((b) => ({ id: b.id, earnedAt: new Date(b.earnedAt).toISOString() }))
                  : null,
            })),
            chores: choreStats(inPeriod),
            series: activitySeries(rows, query.from, query.to, tz, days > DAILY_UP_TO_DAYS ? 'week' : 'day'),
            badgeCatalog: motivation.badges ? BADGES.map(({ id, name, description, icon }) => ({ id, name, description, icon })) : [],
         }
      },
   }
}

export type StatsService = ReturnType<typeof createStatsService>
