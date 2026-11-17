import { useId, useState } from 'react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import FormAlert from '@/features/auth/FormAlert'
import { cn } from '@/lib/utils'
import { useSaveReward, type Reward } from './rewardsApi'

/** Same limit as the server (models/rewardModels.ts MAX_REWARD_COST). */
const MAX_COST = 10_000

/** Add or edit a reward (owners and admins). */
export function RewardDialog({ householdId, reward, onClose }: { householdId: string; reward: Reward | null; onClose: () => void }) {
   const id = useId()
   const save = useSaveReward(householdId)
   const [title, setTitle] = useState(reward?.title ?? '')
   const [description, setDescription] = useState(reward?.description ?? '')
   const [costText, setCostText] = useState(reward ? String(reward.cost) : '')
   const [needsApproval, setNeedsApproval] = useState(reward?.needsApproval ?? false)
   const [tried, setTried] = useState(false)
   const cost = /^\d+$/.test(costText.trim()) && Number(costText) >= 1 && Number(costText) <= MAX_COST ? Number(costText) : null
   const titleError = tried && !title.trim() ? 'Enter a name for the reward.' : null
   const costError = tried && cost === null ? `Use a whole number from 1 to ${MAX_COST.toLocaleString()}.` : null

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      setTried(true)
      if (!title.trim() || cost === null) return
      save.mutate(
         { id: reward?.id ?? null, input: { title: title.trim(), description: description.trim(), cost, needsApproval } },
         {
            onSuccess: () => {
               toast.success(reward ? 'Reward saved' : 'Reward added')
               onClose()
            },
         },
      )
   }

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>{reward ? 'Edit reward' : 'New reward'}</DialogTitle>
               <DialogDescription>
                  {reward ? 'Earlier requests keep the name and price they had.' : 'Something people can spend their chore points on.'}
               </DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} noValidate className='space-y-4'>
               {save.isError && <FormAlert tone='error' error={apiError(save.error)} />}
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-title`} className='text-sm font-medium'>
                     Reward
                  </label>
                  <Input
                     id={`${id}-title`}
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     maxLength={80}
                     placeholder='e.g. Choose Friday’s movie'
                     aria-invalid={Boolean(titleError) || undefined}
                     aria-describedby={titleError ? `${id}-title-error` : undefined}
                     autoFocus
                  />
                  {titleError && (
                     <p id={`${id}-title-error`} className='text-xs text-destructive'>
                        {titleError}
                     </p>
                  )}
               </div>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-cost`} className='text-sm font-medium'>
                     Price in points
                  </label>
                  <Input
                     id={`${id}-cost`}
                     inputMode='numeric'
                     value={costText}
                     onChange={(e) => setCostText(e.target.value)}
                     className='w-28'
                     placeholder='e.g. 50'
                     aria-invalid={Boolean(costError) || undefined}
                     aria-describedby={`${id}-cost-hint`}
                  />
                  <p id={`${id}-cost-hint`} className={cn('text-xs', costError ? 'text-destructive' : 'text-muted-foreground')}>
                     {costError ?? 'A chore earns its effort in points (1 for a quick task, 5 for a big job).'}
                  </p>
               </div>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-description`} className='text-sm font-medium'>
                     Details <span className='font-normal text-muted-foreground'>(optional)</span>
                  </label>
                  <Textarea id={`${id}-description`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
               </div>
               <label className='flex cursor-pointer items-start gap-3 rounded-xl border p-3'>
                  <Checkbox className='mt-0.5' checked={needsApproval} onCheckedChange={setNeedsApproval} />
                  <span className='text-sm'>
                     <span className='block font-medium'>Needs approval</span>
                     <span className='block text-muted-foreground'>An owner or admin says yes first (good for pocket money). Points are held meanwhile.</span>
                  </span>
               </label>
            </form>
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : reward ? 'Save reward' : 'Add reward'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
