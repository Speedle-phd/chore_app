import { CircleAlert, MailCheck } from 'lucide-react'
import type { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'

type FormAlertProps =
   | { tone: 'error'; error: ApiError; children?: React.ReactNode }
   | { tone: 'success'; children: React.ReactNode }

/** Inline message for a form; errors are announced to screen readers. */
const FormAlert = (props: FormAlertProps) => {
   const isError = props.tone === 'error'
   const Icon = isError ? CircleAlert : MailCheck
   return (
      <div
         role={isError ? 'alert' : 'status'}
         className={cn(
            'flex gap-3 rounded-xl border p-3 text-sm',
            isError
               ? 'border-destructive/30 bg-destructive/5 text-destructive'
               : 'border-primary/30 bg-primary/5 text-foreground',
         )}
      >
         <Icon className={cn('mt-0.5 size-4 shrink-0', !isError && 'text-primary')} />
         <div className='min-w-0 space-y-1'>
            {isError && <p className='font-medium'>{props.error.message}</p>}
            {isError && props.error.details && (
               <ul className='list-disc space-y-0.5 pl-4'>
                  {props.error.details.map((detail) => (
                     <li key={detail}>{detail}</li>
                  ))}
               </ul>
            )}
            {props.children}
         </div>
      </div>
   )
}

export default FormAlert
