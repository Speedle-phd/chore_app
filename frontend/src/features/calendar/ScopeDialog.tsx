import { useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { Scope } from './calendarApi'

const SCOPE_LABEL: Record<Scope, string> = {
   this: 'This occurrence',
   following: 'This and following',
   all: 'All occurrences',
}

type ScopeDialogProps = {
   open: boolean
   title: string
   description?: string
   /** Offered choices; with one or none the dialog is a plain confirmation. */
   scopes: Scope[]
   confirmLabel: string
   destructive?: boolean
   isPending?: boolean
   onConfirm: (scope: Scope) => void
   onCancel: () => void
}

/** "Which occurrences?" for changes and deletions in a repeating series (also used as a plain confirm). */
export function ScopeDialog(props: ScopeDialogProps) {
   // Remount per opening so the choice starts at the first option.
   return props.open ? <ScopeDialogOpen key={props.scopes.join()} {...props} /> : null
}

function ScopeDialogOpen({
   title,
   description,
   scopes,
   confirmLabel,
   destructive = false,
   isPending = false,
   onConfirm,
   onCancel,
}: ScopeDialogProps) {
   const [scope, setScope] = useState<Scope>(scopes[0] ?? 'this')
   return (
      <AlertDialog.Root
         open
         onOpenChange={(next) => {
            if (!next && !isPending) onCancel()
         }}
      >
         <AlertDialog.Portal>
            <AlertDialog.Backdrop className='fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs' />
            <AlertDialog.Popup className='fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm'>
               <div className='space-y-1.5'>
                  <AlertDialog.Title className='text-base font-semibold'>{title}</AlertDialog.Title>
                  {description && (
                     <AlertDialog.Description className='text-muted-foreground'>{description}</AlertDialog.Description>
                  )}
               </div>
               {scopes.length > 1 && (
                  <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} aria-label='Apply to' className='gap-1'>
                     {scopes.map((s) => (
                        <label key={s} className='flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted'>
                           <RadioGroupItem value={s} />
                           {SCOPE_LABEL[s]}
                        </label>
                     ))}
                  </RadioGroup>
               )}
               <div className='mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                  <AlertDialog.Close disabled={isPending} render={<Button variant='outline' size='lg' className='px-4' />}>
                     Cancel
                  </AlertDialog.Close>
                  <Button
                     size='lg'
                     className={cn('px-4', destructive && 'bg-destructive text-white hover:bg-destructive/90')}
                     disabled={isPending}
                     onClick={() => onConfirm(scope)}
                  >
                     {isPending ? 'Saving…' : confirmLabel}
                  </Button>
               </div>
            </AlertDialog.Popup>
         </AlertDialog.Portal>
      </AlertDialog.Root>
   )
}
