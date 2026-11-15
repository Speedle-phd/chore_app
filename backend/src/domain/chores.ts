import { Temporal } from 'temporal-polyfill'

/**
 * Chore rules: who is assigned to an occurrence, what state it is in, and when an
 * after-completion series is due next. Pure; "now" is passed in. App choices,
 * documented in docs/HANDOFF.md.
 */

export const ASSIGNMENT_MODES = ['anyone', 'everyone'] as const
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number]
export const COMPLETION_STATUSES = ['done', 'skipped'] as const
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number]

export type Completion = { memberId: string; status: CompletionStatus }

/** open → nothing yet; partial → some of "everyone" have settled; done/skipped → settled. */
export type ChoreState = 'open' | 'partial' | 'done' | 'skipped'

/**
 * People responsible for one occurrence. A per-occurrence reassignment wins;
 * with rotation the pool takes turns by series position.
 */
export function assigneesFor(pool: string[], rotation: boolean, index: number, reassigned: string[] | null): string[] {
   if (reassigned) return reassigned
   if (!rotation || pool.length < 2) return pool
   return [pool[index % pool.length] as string]
}

/**
 * "anyone": the first completion settles it. "everyone": each assignee settles
 * their part (done or skipped); with nobody assigned it behaves like "anyone".
 * Settled with at least one done → done; all skipped → skipped.
 */
export function choreState(mode: AssignmentMode, assignees: string[], completions: Completion[]): ChoreState {
   if (mode === 'anyone' || assignees.length === 0) {
      if (completions.some((c) => c.status === 'done')) return 'done'
      return completions.length ? 'skipped' : 'open'
   }
   const settled = assignees.filter((id) => completions.some((c) => c.memberId === id))
   if (settled.length < assignees.length) return settled.length ? 'partial' : 'open'
   const anyDone = assignees.some((id) => completions.some((c) => c.memberId === id && c.status === 'done'))
   return anyDone ? 'done' : 'skipped'
}

export const isSettled = (state: ChoreState) => state === 'done' || state === 'skipped'

/** Overdue: not settled once its end (the due time) has passed. */
export function isOverdue(state: ChoreState, due: Temporal.Instant, now: Temporal.Instant): boolean {
   return !isSettled(state) && Temporal.Instant.compare(now, due) >= 0
}

/** How far ahead an occurrence may be marked (e.g. done a day early). App choice. */
export const MAX_EARLY_DAYS = 7

export function tooEarly(start: Temporal.Instant, now: Temporal.Instant): boolean {
   return Temporal.Instant.compare(start, now.add({ hours: 24 * MAX_EARLY_DAYS })) > 0
}

/**
 * Next open occurrence of an after-completion series: `afterDays` after the day
 * it was settled (in the item's zone), at the same time of day, same length.
 */
export function nextAfterCompletion(
   item: { allDay: boolean; start: string; end: string; timezone: string },
   settledAt: Temporal.Instant,
   afterDays: number,
): { start: string; end: string } {
   const day = settledAt.toZonedDateTimeISO(item.timezone).toPlainDate().add({ days: afterDays })
   if (item.allDay) {
      const length = Temporal.PlainDate.from(item.start).until(item.end, { largestUnit: 'day' })
      return { start: day.toString(), end: day.add(length).toString() }
   }
   const start = Temporal.PlainDateTime.from(item.start)
   const length = start.until(item.end, { largestUnit: 'day' })
   const next = day.toPlainDateTime(start.toPlainTime())
   return {
      start: next.toString({ smallestUnit: 'minute' }),
      end: next.add(length).toString({ smallestUnit: 'minute' }),
   }
}

/** Rotation order for a series split at position `index`, so turns continue seamlessly. */
export function rotateFrom<T>(order: T[], index: number): T[] {
   if (!order.length) return order
   const k = index % order.length
   return [...order.slice(k), ...order.slice(0, k)]
}
