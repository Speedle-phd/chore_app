import { AlertDialog } from '@base-ui/react/alert-dialog'
import { TriangleAlert } from 'lucide-react'
import { Button } from './ui/button'

type ConfirmDeleteDialogProps = {
   open: boolean
   onOpenChange: (open: boolean) => void
   /** The element that opens the dialog, e.g. a delete button. Omit when it's opened another way (a menu item). */
   trigger?: React.ReactElement
   title: string
   description: React.ReactNode
   confirmLabel?: string
   isPending?: boolean
   onConfirm: () => void
}

const ConfirmDeleteDialog = ({
   open,
   onOpenChange,
   trigger,
   title,
   description,
   confirmLabel = 'Delete',
   isPending = false,
   onConfirm,
}: ConfirmDeleteDialogProps) => {
   return (
      <AlertDialog.Root
         open={open}
         onOpenChange={(next) => {
            // Keep the dialog open while the request is running.
            if (!isPending) onOpenChange(next)
         }}
      >
         {trigger && <AlertDialog.Trigger render={trigger} />}
         <AlertDialog.Portal>
            <AlertDialog.Backdrop className='fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0' />
            <AlertDialog.Popup className='fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'>
               <span className='grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive'>
                  <TriangleAlert className='size-5' />
               </span>
               <div className='space-y-1.5'>
                  <AlertDialog.Title className='text-base font-semibold'>
                     {title}
                  </AlertDialog.Title>
                  <AlertDialog.Description className='text-muted-foreground'>
                     {description}
                  </AlertDialog.Description>
               </div>
               <div className='mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                  <AlertDialog.Close
                     disabled={isPending}
                     render={<Button variant='outline' size='lg' className='px-4' />}
                  >
                     Cancel
                  </AlertDialog.Close>
                  <Button
                     size='lg'
                     className='bg-destructive px-4 text-white hover:bg-destructive/90'
                     disabled={isPending}
                     onClick={onConfirm}
                  >
                     {isPending ? 'Removing…' : confirmLabel}
                  </Button>
               </div>
            </AlertDialog.Popup>
         </AlertDialog.Portal>
      </AlertDialog.Root>
   )
}

export default ConfirmDeleteDialog
