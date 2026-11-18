import { useUnread } from '@/features/chat/chatApi'
import { useMyOverdueCount } from '@/features/chores/useMyOverdueCount'
import { useHousehold } from '@/features/households/householdsApi'
import { usePostsUnread } from '@/features/pinboard/pinboardApi'

/**
 * What a nav link shows next to its label: a count, or a dot. `sr` is read after the label;
 * browsers put a space before it (the hidden text is positioned), so it starts without a comma.
 */
export type NavBadge = { count: number; dot: boolean; sr: string }
const NONE: NavBadge = { count: 0, dot: false, sr: '' }

/** Chores: my overdue chores. Board: unread chat messages plus new notes/polls by others. */
export function useNavBadges(): (href: string) => NavBadge {
   const household = useHousehold()
   const overdue = useMyOverdueCount()
   const messages = useUnread(household.id).data?.count ?? 0
   const posts = usePostsUnread(household.id).data?.count ?? 0
   const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

   return (href) => {
      if (href === '/chores' && overdue) return { count: overdue, dot: false, sr: `${overdue} overdue` }
      if (href === '/board' && (messages || posts)) {
         const sr = [messages && plural(messages, 'unread message', 'unread messages'), posts && plural(posts, 'new post', 'new posts')].filter(Boolean).join(', ')
         return { count: messages + posts, dot: false, sr }
      }
      return NONE
   }
}
