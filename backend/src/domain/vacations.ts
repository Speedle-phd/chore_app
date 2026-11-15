import type { AssignmentMode } from './chores'

/**
 * Vacations vs chores. A vacation is an all-day range [start, end) of local dates
 * for one or more members. App choices (see docs/HANDOFF.md):
 * - a chore is at risk only when nobody assigned can do it: "any one of them" →
 *   all assignees away; "each of them" → any assignee away (their part);
 * - the suggestion drops away people from "each of them", otherwise picks one
 *   substitute: from the chore's own people first, else anyone in the household,
 *   with the fewest assignments in the period (ties: in the given order).
 */

export type VacationRange = { memberIds: string[]; start: string; end: string }
export type Conflict = { away: string[]; suggestion: string[] | null }

/** Members away on a local date (`YYYY-MM-DD`). */
export function awayOn(vacations: VacationRange[], date: string): Set<string> {
   const away = new Set<string>()
   for (const v of vacations) {
      if (v.start <= date && date < v.end) for (const id of v.memberIds) away.add(id)
   }
   return away
}

export function vacationConflict(
   chore: { mode: AssignmentMode; assignees: string[]; pool: string[] },
   away: Set<string>,
   household: string[],
   load: ReadonlyMap<string, number>,
): Conflict | null {
   const awayAssignees = chore.assignees.filter((id) => away.has(id))
   if (!awayAssignees.length) return null
   const remaining = chore.assignees.filter((id) => !away.has(id))

   if (chore.mode === 'everyone') {
      return { away: awayAssignees, suggestion: remaining.length ? remaining : pick(chore, away, household, load) }
   }
   // "Any one of them": someone assigned is still here, so nothing to do.
   if (remaining.length) return null
   return { away: awayAssignees, suggestion: pick(chore, away, household, load) }
}

function pick(
   chore: { assignees: string[]; pool: string[] },
   away: Set<string>,
   household: string[],
   load: ReadonlyMap<string, number>,
): string[] | null {
   const available = (ids: string[]) => ids.filter((id) => !away.has(id) && !chore.assignees.includes(id))
   const fromPool = available(chore.pool)
   const candidates = fromPool.length ? fromPool : available(household)
   if (!candidates.length) return null
   const best = candidates.reduce((a, b) => ((load.get(b) ?? 0) < (load.get(a) ?? 0) ? b : a))
   return [best]
}
