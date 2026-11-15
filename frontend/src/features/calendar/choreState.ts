import type { AssignmentMode, ChoreState, CompletionStatus } from './calendarApi'

/**
 * Mirrors backend/src/domain/chores.ts `choreState`, only for showing a change
 * before the server answers; the server's state wins on refetch.
 */
export function choreState(
   mode: AssignmentMode,
   assignees: string[],
   completions: { memberId: string; status: CompletionStatus }[],
): ChoreState {
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
