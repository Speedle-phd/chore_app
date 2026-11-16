import { Award, Clock, Dumbbell, Flame, FlameKindling, HandHeart, Medal, Sparkles, Trophy, type LucideIcon } from 'lucide-react'
import type { BadgeProgress } from './statsApi'

/** Icon per badge (`icon` names from the server's catalog). */
export const BADGE_ICONS: Record<string, LucideIcon> = {
   sparkles: Sparkles,
   medal: Medal,
   award: Award,
   trophy: Trophy,
   clock: Clock,
   dumbbell: Dumbbell,
   'hand-heart': HandHeart,
   flame: Flame,
   'flame-kindling': FlameKindling,
}

export const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`)

/** The badge someone is closest to (largest share of its goal; ties: the smaller goal). Null when all are earned. */
export function nextBadge(progress: BadgeProgress[]): BadgeProgress | null {
   const open = progress.filter((p) => p.value < p.goal)
   if (!open.length) return null
   return open.reduce((best, p) => {
      const ratio = p.value / p.goal
      const bestRatio = best.value / best.goal
      return ratio > bestRatio || (ratio === bestRatio && p.goal < best.goal) ? p : best
   })
}

/** "1st", "2nd", "3rd", "4th" … */
export function ordinal(n: number): string {
   const tens = n % 100
   if (tens >= 11 && tens <= 13) return `${n}th`
   return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}
