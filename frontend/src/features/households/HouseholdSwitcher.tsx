import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import HouseholdNameForm from './HouseholdNameForm'
import { useCreateHousehold, useCurrentHousehold, useSelectHousehold } from './householdsApi'
import { ROLE_LABEL } from './permissions'

const HouseholdSwitcher = () => {
   const { household, households } = useCurrentHousehold()
   const select = useSelectHousehold()
   const create = useCreateHousehold()
   const navigate = useNavigate()
   const [creating, setCreating] = useState(false)
   if (!household) return null

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger
               aria-label={`Household: ${household.name}. Switch household`}
               className='flex max-w-40 min-w-0 items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted xl:max-w-56'
            >
               <span className='truncate'>{household.name}</span>
               <ChevronsUpDown className='size-3.5 shrink-0 text-muted-foreground' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='min-w-60'>
               <DropdownMenuGroup>
                  <DropdownMenuLabel>Your households</DropdownMenuLabel>
                  {households.map((h) => (
                     <DropdownMenuItem
                        key={h.id}
                        onClick={() => {
                           if (h.id === household.id) return
                           select.mutate(h.id, { onError: (e) => toast.error(apiError(e).message) })
                        }}
                        className='gap-2'
                     >
                        <span className='min-w-0 flex-1'>
                           <span className='block truncate'>{h.name}</span>
                           <span className='block text-xs text-muted-foreground'>
                              {ROLE_LABEL[h.role]} · {h.memberCount} {h.memberCount === 1 ? 'person' : 'people'}
                           </span>
                        </span>
                        {h.id === household.id && <Check className='text-primary' aria-label='Current household' />}
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuGroup>
               <DropdownMenuSeparator />
               <DropdownMenuItem onClick={() => setCreating(true)}>
                  <Plus />
                  New household…
               </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>

         <Dialog
            open={creating}
            onOpenChange={(open) => {
               setCreating(open)
               if (!open) create.reset()
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle className='text-lg font-semibold'>New household</DialogTitle>
                  <DialogDescription>You’ll be its owner. You can switch between households any time.</DialogDescription>
               </DialogHeader>
               <HouseholdNameForm
                  submitLabel='Create household'
                  pendingLabel='Creating…'
                  isPending={create.isPending}
                  error={create.isError ? apiError(create.error) : null}
                  autoFocus
                  onSubmit={(name) =>
                     create.mutate(name, {
                        onSuccess: (created) => {
                           setCreating(false)
                           toast.success(`Created “${created.name}”`)
                           navigate('/members')
                        },
                     })
                  }
               />
            </DialogContent>
         </Dialog>
      </>
   )
}

export default HouseholdSwitcher
