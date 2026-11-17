import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { cn } from '@/lib/utils'
import type { NavigationItem } from '@/types/types'

/**
 * The household menu: its pages (Members, Settings) and switching households.
 * Highlighted like an active nav link while one of its pages is open.
 */
const HouseholdSwitcher = ({ items }: { items: NavigationItem[] }) => {
   const { household, households } = useCurrentHousehold()
   const select = useSelectHousehold()
   const create = useCreateHousehold()
   const navigate = useNavigate()
   const { pathname } = useLocation()
   const current = items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
   const [creating, setCreating] = useState(false)
   if (!household) return null

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger
               // Starts with the visible name (WCAG 2.5.3); says where you are when on one of its pages.
               aria-label={`${household.name}, household menu${current ? `, current page: ${current.label}` : ''}`}
               className={cn(
                  'flex max-w-40 min-w-0 items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted sm:max-w-56 xl:max-w-72',
                  current && 'bg-card shadow-sm ring-1 ring-border/70',
               )}
            >
               <span className='truncate'>{household.name}</span>
               <ChevronsUpDown className='size-3.5 shrink-0 text-muted-foreground' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='min-w-72'>
               <DropdownMenuGroup>
                  {items.map(({ href, label, Icon }) => (
                     <DropdownMenuItem key={href} onClick={() => navigate(href)} className={cn(current?.href === href && 'font-medium')}>
                        <Icon className={cn(current?.href === href && 'text-primary')} />
                        {label}
                        {current?.href === href && <span className='sr-only'>(current page)</span>}
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuGroup>
               <DropdownMenuSeparator />
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
