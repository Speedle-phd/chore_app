import { Temporal } from 'temporal-polyfill'
import { NO_REPEAT, describeRepeat, toRrule, weekdayOf, type Repeat } from '@/features/calendar/recurrence'
import { CHORE_TEMPLATE_GROUPS, type ChoreTemplate, type TemplateGroup } from './choreTemplates'

const FREQ = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const

/**
 * The repeat editor's state for a template. Weekly ones get the start's weekday ticked,
 * as the editor does when weekly is picked by hand (`start` = `YYYY-MM-DD…`).
 */
export function templateRepeat(template: ChoreTemplate, start?: string): Repeat {
   const r = template.repeat
   if ('afterDays' in r) return { ...NO_REPEAT, freq: 'AFTER', interval: r.afterDays }
   const freq = FREQ[r.unit]
   return { ...NO_REPEAT, freq, interval: r.every, byDay: freq === 'WEEKLY' && start ? [weekdayOf(start)] : [] }
}

/**
 * First date for a template: a month-bound one starts on the 1st of the next such month
 * (today when we are in that month already); others start on `fallback`.
 */
export function templateStart(template: ChoreTemplate, today: string, fallback: string): string {
   if (!template.month) return fallback
   const day = Temporal.PlainDate.from(today)
   if (day.month === template.month) return today
   const year = day.month < template.month ? day.year : day.year + 1
   return Temporal.PlainDate.from({ year, month: template.month, day: 1 }).toString()
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** E.g. "Every 3 months", "30 days after it’s done", "Every year, in October". */
export function describeTemplate(template: ChoreTemplate): string {
   const repeat = templateRepeat(template)
   const after = 'afterDays' in template.repeat ? template.repeat.afterDays : null
   const text = describeRepeat(toRrule(repeat, 'UTC'), 'UTC', after)
   return template.month ? `${text}, in ${MONTHS[template.month - 1]}` : text
}

/** Groups with the templates whose title (or group name) contains every word of the query. */
export function searchTemplates(query: string, groups: readonly TemplateGroup[] = CHORE_TEMPLATE_GROUPS): TemplateGroup[] {
   const words = query.toLowerCase().split(/\s+/).filter(Boolean)
   if (!words.length) return [...groups]
   return groups
      .map((g) => ({
         ...g,
         templates: g.templates.filter((t) => {
            const text = `${t.title} ${g.label}`.toLowerCase()
            return words.every((w) => text.includes(w))
         }),
      }))
      .filter((g) => g.templates.length > 0)
}
