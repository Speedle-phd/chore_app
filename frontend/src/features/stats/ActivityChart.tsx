import { useState } from 'react'
import { cn } from '@/lib/utils'
import { niceTicks } from './periods'
import type { Stats } from './statsApi'

type ActivityChartProps = {
   series: Stats['series']
   bucket: Stats['bucket']
   today: string
}

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, opts)

/**
 * Points per day (or week), one series in the chart accent. Columns ≤ 24 px with a
 * rounded top and a square baseline, hairline grid, clean ticks. The plot is one
 * focusable area (arrow keys, Home/End move between columns; the pointer picks the
 * column under it) instead of a tab stop per column, which stays usable on phones
 * where 30 columns are a few pixels wide (WCAG 2.5.8). A table view carries every number.
 */
export function ActivityChart({ series, bucket, today }: ActivityChartProps) {
   const [active, setActive] = useState<number | null>(null)
   const ticks = niceTicks(Math.max(...series.map((p) => p.points), 0))
   const top = ticks.at(-1) ?? 1
   const label = (date: string) =>
      bucket === 'day' ? fmt(date, { weekday: 'short', day: 'numeric', month: 'short' }) : `Week of ${fmt(date, { day: 'numeric', month: 'short' })}`
   // Thin out x labels so they never collide (about 8 at most).
   const every = Math.ceil(series.length / 8)
   const total = series.reduce((s, p) => s + p.points, 0)
   const point = active !== null ? series[active] : undefined
   const last = series.length - 1
   const onKeyDown = (e: React.KeyboardEvent) => {
      const keys: Record<string, number> = {
         ArrowRight: Math.min((active ?? -1) + 1, last),
         ArrowLeft: Math.max((active ?? series.length) - 1, 0),
         Home: 0,
         End: last,
      }
      const next = keys[e.key]
      if (next === undefined) return
      e.preventDefault()
      setActive(next)
   }
   const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const box = e.currentTarget.getBoundingClientRect()
      setActive(Math.min(last, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * series.length))))
   }

   return (
      <figure className='space-y-3'>
         <figcaption className='sr-only'>
            Points per {bucket}: {total} in total.
         </figcaption>
         {/* pt-3: headroom so the top tick label never touches the caption above. */}
         {/* Always present, so screen readers announce each column as the arrow keys move. */}
         <p role='status' className='sr-only'>
            {point ? `${label(point.date)}: ${point.points} points, ${point.done} done` : ''}
         </p>
         <div className='flex h-52 gap-2 pt-3'>
            {/* Y axis: clean ticks, muted text. */}
            <div className='relative w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums' aria-hidden>
               {ticks.map((t) => (
                  <span key={t} className='absolute right-0 -translate-y-1/2' style={{ bottom: `${(t / top) * 100}%` }}>
                     {t}
                  </span>
               ))}
            </div>
            <div className='relative min-w-0 flex-1'>
               {ticks.map((t) => (
                  <div key={t} aria-hidden className='absolute inset-x-0 h-px bg-border' style={{ bottom: `${(t / top) * 100}%` }} />
               ))}
               <div
                  className='absolute inset-0 flex items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
                  tabIndex={0}
                  role='group'
                  aria-label={`Points per ${bucket}. Use the arrow keys to read each ${bucket}.`}
                  onKeyDown={onKeyDown}
                  onFocus={() => setActive((a) => a ?? last)}
                  onBlur={() => setActive(null)}
                  onPointerMove={onPointerMove}
                  onPointerLeave={() => setActive(null)}
               >
                  {series.map((p, i) => (
                     <span key={p.date} aria-hidden className='flex h-full min-w-0 flex-1 items-end justify-center'>
                        <span
                           className={cn(
                              'block w-[min(24px,70%)] rounded-t-[4px] bg-(--chart-1) transition-opacity',
                              active === i && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
                              active !== null && active !== i && 'opacity-60',
                              p.date > today && 'opacity-30',
                           )}
                           style={{ height: `${(p.points / top) * 100}%`, minHeight: p.points ? 2 : 0 }}
                        />
                     </span>
                  ))}
               </div>
               {point && active !== null && (
                  <div
                     aria-hidden
                     className='pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md'
                     style={{ left: `${((active + 0.5) / series.length) * 100}%` }}
                  >
                     <span className='block text-sm font-semibold'>{point.points} points</span>
                     <span className='text-muted-foreground'>
                        {label(point.date)} · {point.done} done
                     </span>
                  </div>
               )}
            </div>
         </div>
         <div className='flex gap-2 ps-10 text-xs text-muted-foreground' aria-hidden>
            {series.map((p, i) => (
               <span key={p.date} className='min-w-0 flex-1 truncate text-center'>
                  {i % every === 0 ? (bucket === 'day' ? fmt(p.date, { day: 'numeric' }) : fmt(p.date, { day: 'numeric', month: 'short' })) : ''}
               </span>
            ))}
         </div>
         <details className='text-sm'>
            <summary className='cursor-pointer text-muted-foreground hover:text-foreground'>Show as table</summary>
            <table className='mt-2 w-full max-w-md text-left tabular-nums'>
               <thead className='text-muted-foreground'>
                  <tr>
                     <th className='py-1 font-medium'>{bucket === 'day' ? 'Day' : 'Week'}</th>
                     <th className='py-1 text-right font-medium'>Points</th>
                     <th className='py-1 text-right font-medium'>Done</th>
                  </tr>
               </thead>
               <tbody>
                  {series.map((p) => (
                     <tr key={p.date} className='border-t'>
                        <td className='py-1'>{label(p.date)}</td>
                        <td className='py-1 text-right'>{p.points}</td>
                        <td className='py-1 text-right'>{p.done}</td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </details>
      </figure>
   )
}
