/** "8 of 12 packed" with a bar; the text carries the meaning, the bar is decoration. */
export function ProgressBar({ done, total }: { done: number; total: number }) {
   const percent = total ? Math.round((done / total) * 100) : 0
   return (
      <div className='space-y-1.5'>
         <div className='h-2 overflow-hidden rounded-full bg-muted' aria-hidden>
            <div className='h-full rounded-full bg-primary transition-[width] duration-300' style={{ width: `${percent}%` }} />
         </div>
         <p className='text-sm text-muted-foreground'>{total === 0 ? 'No items yet' : done === total ? `All ${total} packed` : `${done} of ${total} packed`}</p>
      </div>
   )
}
