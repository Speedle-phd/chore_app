import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Check, Gift, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import EmptyState from '@/components/EmptyState'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { selectClass } from '@/features/calendar/styles'
import type { Household, Member } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import { Person } from '@/features/stats/parts'
import { cn } from '@/lib/utils'
import { points, redeemButton, STATUS_LABEL } from './format'
import { RewardDialog } from './RewardDialog'
import {
   useArchiveReward,
   useDecide,
   useDeleteReward,
   useRedeem,
   useRewards,
   type Balance,
   type DecisionAction,
   type Redemption,
   type Reward,
} from './rewardsApi'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Chores → Rewards: your points, what you can get with them, requests and history. */
export function RewardsView({ household, members }: { household: Household; members: Member[] }) {
   const id = useId()
   const overview = useRewards(household.id)
   const manager = canManage(household.role)
   const me = members.find((m) => m.isMe)
   // Managers also spend for profiles (no login), e.g. a child's pocket money.
   const spenders = manager ? members.filter((m) => m.isMe || m.kind === 'profile') : me ? [me] : []
   const [spenderId, setSpenderId] = useState<string | null>(null)
   const spender = spenders.find((m) => m.id === spenderId) ?? me
   const [editing, setEditing] = useState<Reward | 'new' | null>(null)
   const [asking, setAsking] = useState<Reward | null>(null)
   const [deleting, setDeleting] = useState<Reward | null>(null)
   const member = (mid: string) => members.find((m) => m.id === mid)

   if (overview.isPending) {
      return (
         <p role='status' className='py-10 text-center text-sm text-muted-foreground'>
            Loading rewards…
         </p>
      )
   }
   if (overview.isError) {
      return (
         <EmptyState Icon={Gift} title='Couldn’t load the rewards' description={apiError(overview.error).message}>
            <Button variant='outline' onClick={() => void overview.refetch()}>
               <RefreshCw />
               Try again
            </Button>
         </EmptyState>
      )
   }
   const data = overview.data
   if (!data.enabled) {
      return (
         <EmptyState
            Icon={Gift}
            title='Rewards are switched off'
            description={manager ? 'Turn them on in Settings → Motivation to let people spend their chore points.' : 'An owner or admin can turn them on in Settings.'}
         >
            {manager && (
               <Link to='/settings' className={buttonVariants({ variant: 'outline' })}>
                  Open Settings
               </Link>
            )}
         </EmptyState>
      )
   }

   const balance = spender ? data.balances[spender.id] : undefined
   const waitingForMe = manager ? data.pending : []
   const myPending = manager ? [] : data.pending

   return (
      <div className='space-y-8'>
         <BalanceCard
            balance={balance}
            spenders={spenders}
            spender={spender}
            selectId={`${id}-spender`}
            onSpender={setSpenderId}
         />

         {waitingForMe.length > 0 && (
            <section aria-labelledby={`${id}-approve`} className='space-y-3'>
               <h2 id={`${id}-approve`} className='text-base font-semibold'>
                  Waiting for your approval ({waitingForMe.length})
               </h2>
               <ul className='divide-y rounded-xl border bg-card'>
                  {waitingForMe.map((r) => (
                     <PendingRow key={r.id} householdId={household.id} redemption={r} member={member(r.memberId)} actions={['approve', 'decline']} />
                  ))}
               </ul>
            </section>
         )}
         {myPending.length > 0 && (
            <section aria-labelledby={`${id}-mine`} className='space-y-3'>
               <h2 id={`${id}-mine`} className='text-base font-semibold'>
                  Waiting for approval
               </h2>
               <ul className='divide-y rounded-xl border bg-card'>
                  {myPending.map((r) => (
                     <PendingRow key={r.id} householdId={household.id} redemption={r} member={member(r.memberId)} actions={['cancel']} />
                  ))}
               </ul>
            </section>
         )}

         <section aria-labelledby={`${id}-offer`} className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
               <h2 id={`${id}-offer`} className='text-base font-semibold'>
                  Rewards
               </h2>
               {manager && (
                  <Button variant='outline' size='sm' onClick={() => setEditing('new')}>
                     <Plus />
                     Add reward
                  </Button>
               )}
            </div>
            {data.rewards.length === 0 ? (
               <EmptyState
                  Icon={Gift}
                  title='No rewards yet'
                  description={
                     manager
                        ? 'Add things people can spend their chore points on, like choosing Friday’s movie or a bit of pocket money.'
                        : 'Owners and admins can add rewards to spend chore points on.'
                  }
               >
                  {manager && (
                     <Button onClick={() => setEditing('new')}>
                        <Plus />
                        Add the first reward
                     </Button>
                  )}
               </EmptyState>
            ) : (
               <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {data.rewards.map((r) => (
                     <RewardCard
                        key={r.id}
                        reward={r}
                        balance={balance}
                        manager={manager}
                        forName={spender && !spender.isMe ? spender.fname : null}
                        onAsk={() => setAsking(r)}
                        onEdit={() => setEditing(r)}
                        onDelete={() => setDeleting(r)}
                        householdId={household.id}
                     />
                  ))}
               </ul>
            )}
         </section>

         {manager && data.archived.length > 0 && <ArchivedRewards householdId={household.id} rewards={data.archived} onDelete={setDeleting} />}

         {data.history.length > 0 && (
            <section aria-labelledby={`${id}-history`} className='space-y-3'>
               <h2 id={`${id}-history`} className='text-base font-semibold'>
                  Lately
               </h2>
               <ul className='divide-y rounded-xl border bg-card'>
                  {data.history.map((r) => (
                     <HistoryRow key={r.id} householdId={household.id} redemption={r} member={member(r.memberId)} manager={manager} />
                  ))}
               </ul>
            </section>
         )}

         {editing && <RewardDialog householdId={household.id} reward={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
         {asking && spender && (
            <RedeemDialog householdId={household.id} reward={asking} spender={spender} balance={balance} manager={manager} onClose={() => setAsking(null)} />
         )}
         <DeleteReward householdId={household.id} reward={deleting} onClose={() => setDeleting(null)} />
      </div>
   )
}

function BalanceCard({
   balance,
   spenders,
   spender,
   selectId,
   onSpender,
}: {
   balance: Balance | undefined
   spenders: Member[]
   spender: Member | undefined
   selectId: string
   onSpender: (id: string) => void
}) {
   return (
      <section aria-label='Points to spend' className='flex flex-wrap items-end justify-between gap-4 rounded-2xl border bg-card p-5'>
         <div>
            <p className='text-sm text-muted-foreground'>{spender?.isMe === false ? `${spender.fname}’s points to spend` : 'Your points to spend'}</p>
            <p className='mt-1 text-4xl font-semibold tabular-nums'>{balance ? balance.available.toLocaleString() : '–'}</p>
            {balance && (
               <p className='mt-1 text-sm text-muted-foreground'>
                  {points(balance.earned)} earned · {balance.spent.toLocaleString()} spent
                  {balance.reserved > 0 && ` · ${balance.reserved.toLocaleString()} held for requests`}
               </p>
            )}
            {balance && balance.available < 0 && (
               <p className='mt-1 text-sm text-muted-foreground'>Below zero because a chore was undone after the points were spent.</p>
            )}
         </div>
         {spenders.length > 1 && (
            <div className='space-y-1'>
               <label htmlFor={selectId} className='block text-sm font-medium'>
                  Points of
               </label>
               <select id={selectId} className={cn(selectClass, 'w-auto')} value={spender?.id ?? ''} onChange={(e) => onSpender(e.target.value)}>
                  {spenders.map((m) => (
                     <option key={m.id} value={m.id}>
                        {m.isMe ? `${m.fname} (you)` : m.fname}
                     </option>
                  ))}
               </select>
            </div>
         )}
      </section>
   )
}

function RewardCard({
   householdId,
   reward,
   balance,
   manager,
   forName,
   onAsk,
   onEdit,
   onDelete,
}: {
   householdId: string
   reward: Reward
   balance: Balance | undefined
   manager: boolean
   forName: string | null
   onAsk: () => void
   onEdit: () => void
   onDelete: () => void
}) {
   const id = useId()
   const archive = useArchiveReward(householdId)
   const button = redeemButton(reward, balance, manager)
   return (
      <li className='flex flex-col gap-3 rounded-xl border bg-card p-4'>
         <div className='flex items-start justify-between gap-2'>
            <div className='min-w-0'>
               <h3 className='font-medium wrap-break-word'>{reward.title}</h3>
               <p className='text-sm font-semibold text-primary tabular-nums'>{points(reward.cost)}</p>
            </div>
            {manager && (
               <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant='ghost' size='icon-sm' aria-label={`More for “${reward.title}”`} />}>
                     <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                     <DropdownMenuItem onClick={onEdit}>
                        <Pencil />
                        Edit
                     </DropdownMenuItem>
                     <DropdownMenuItem
                        onClick={() =>
                           archive.mutate(
                              { id: reward.id, archived: true },
                              {
                                 onSuccess: () =>
                                    toast.success('Reward archived', {
                                       action: { label: 'Undo', onClick: () => archive.mutate({ id: reward.id, archived: false }) },
                                    }),
                                 onError: (e) => toast.error(apiError(e).message),
                              },
                           )
                        }
                     >
                        <Archive />
                        Archive
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem variant='destructive' onClick={onDelete}>
                        <Trash2 />
                        Delete
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            )}
         </div>
         {reward.description && <p className='text-sm text-muted-foreground wrap-break-word'>{reward.description}</p>}
         <div className='mt-auto flex flex-wrap items-center gap-x-3 gap-y-1'>
            <Button size='sm' disabled={button.disabled} onClick={onAsk} aria-describedby={button.reason ? `${id}-why` : undefined}>
               {button.label}
               {forName && <span className='sr-only'> for {forName}</span>}
            </Button>
            {button.reason && (
               <span id={`${id}-why`} className='text-xs text-muted-foreground'>
                  {button.reason}
               </span>
            )}
            {reward.needsApproval && !button.reason && <span className='text-xs text-muted-foreground'>Needs approval</span>}
         </div>
      </li>
   )
}

function RedeemDialog({
   householdId,
   reward,
   spender,
   balance,
   manager,
   onClose,
}: {
   householdId: string
   reward: Reward
   spender: Member
   balance: Balance | undefined
   manager: boolean
   onClose: () => void
}) {
   const redeem = useRedeem(householdId)
   const asks = reward.needsApproval && !manager
   const left = balance ? balance.available - reward.cost : null
   const whose = spender.isMe ? 'your' : `${spender.fname}’s`
   return (
      <Dialog open onOpenChange={(next) => !next && !redeem.isPending && onClose()}>
         <DialogContent className='sm:max-w-sm'>
            <DialogHeader>
               <DialogTitle>{asks ? `Ask for “${reward.title}”?` : `Get “${reward.title}”?`}</DialogTitle>
               <DialogDescription>
                  {asks
                     ? `An owner or admin approves it first. ${points(reward.cost)} of ${whose} points are held until then.`
                     : `This spends ${points(reward.cost)} of ${whose} points.`}
                  {left !== null && ` ${points(left)} left afterwards.`}
               </DialogDescription>
            </DialogHeader>
            <DialogFooter>
               <Button variant='ghost' onClick={onClose} disabled={redeem.isPending}>
                  Not now
               </Button>
               <Button
                  className='px-4'
                  disabled={redeem.isPending}
                  onClick={() =>
                     redeem.mutate(
                        { rewardId: reward.id, memberId: spender.id },
                        {
                           onSuccess: (r) => {
                              toast.success(r.status === 'pending' ? 'Asked: waiting for approval' : `Enjoy: ${r.title}!`)
                              onClose()
                           },
                           onError: (e) => toast.error(apiError(e).message),
                        },
                     )
                  }
               >
                  {redeem.isPending ? 'One moment…' : asks ? 'Ask for it' : `Spend ${points(reward.cost)}`}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

const ACTION: Record<DecisionAction, { label: string; done: string; Icon: typeof Check }> = {
   approve: { label: 'Approve', done: 'Approved', Icon: Check },
   decline: { label: 'Decline', done: 'Declined: the points are back', Icon: X },
   cancel: { label: 'Cancel request', done: 'Request cancelled: the points are back', Icon: X },
   refund: { label: 'Give points back', done: 'Points given back', Icon: Undo2 },
}

function DecisionButton({ householdId, redemption, action, variant }: { householdId: string; redemption: Redemption; action: DecisionAction; variant: 'default' | 'outline' | 'ghost' }) {
   const decide = useDecide(householdId)
   const { label, done, Icon } = ACTION[action]
   return (
      <Button
         size='sm'
         variant={variant}
         disabled={decide.isPending}
         aria-label={`${label}: ${redemption.title}`}
         onClick={() =>
            decide.mutate(
               { id: redemption.id, action },
               { onSuccess: () => toast.success(done), onError: (e) => toast.error(apiError(e).message) },
            )
         }
      >
         <Icon />
         {label}
      </Button>
   )
}

function PendingRow({ householdId, redemption, member, actions }: { householdId: string; redemption: Redemption; member: Member | undefined; actions: DecisionAction[] }) {
   return (
      <li className='flex flex-wrap items-center justify-between gap-3 p-3'>
         <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
            <Person member={member} />
            <span className='font-medium'>{redemption.title}</span>
            <span className='text-muted-foreground tabular-nums'>
               {points(redemption.cost)} · {shortDate(redemption.createdAt)}
            </span>
         </div>
         <div className='flex gap-2'>
            {actions.map((a) => (
               <DecisionButton key={a} householdId={householdId} redemption={redemption} action={a} variant={a === 'approve' ? 'default' : 'outline'} />
            ))}
         </div>
      </li>
   )
}

function HistoryRow({ householdId, redemption, member, manager }: { householdId: string; redemption: Redemption; member: Member | undefined; manager: boolean }) {
   return (
      <li className='flex flex-wrap items-center justify-between gap-3 p-3 text-sm'>
         <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
            <span className='w-14 shrink-0 text-muted-foreground tabular-nums'>{shortDate(redemption.createdAt)}</span>
            {manager && <Person member={member} />}
            <span className='font-medium'>{redemption.title}</span>
            <span className='text-muted-foreground tabular-nums'>{points(redemption.cost)}</span>
         </div>
         <div className='flex items-center gap-3'>
            <span className={cn('text-xs', redemption.status === 'approved' ? 'font-medium text-primary' : 'text-muted-foreground')}>
               {STATUS_LABEL[redemption.status]}
               {redemption.note && ` · “${redemption.note}”`}
            </span>
            {manager && redemption.status === 'approved' && <DecisionButton householdId={householdId} redemption={redemption} action='refund' variant='ghost' />}
         </div>
      </li>
   )
}

function ArchivedRewards({ householdId, rewards, onDelete }: { householdId: string; rewards: Reward[]; onDelete: (r: Reward) => void }) {
   const archive = useArchiveReward(householdId)
   return (
      <details className='group rounded-xl border bg-card'>
         <summary className='cursor-pointer rounded-xl p-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50'>
            Archived ({rewards.length})
         </summary>
         <ul className='divide-y border-t'>
            {rewards.map((r) => (
               <li key={r.id} className='flex flex-wrap items-center justify-between gap-2 p-3 text-sm'>
                  <span>
                     <span className='font-medium'>{r.title}</span> <span className='text-muted-foreground'>· {points(r.cost)}</span>
                  </span>
                  <span className='flex gap-2'>
                     <Button
                        size='sm'
                        variant='outline'
                        disabled={archive.isPending}
                        aria-label={`Restore “${r.title}”`}
                        onClick={() =>
                           archive.mutate(
                              { id: r.id, archived: false },
                              { onSuccess: () => toast.success('Reward restored'), onError: (e) => toast.error(apiError(e).message) },
                           )
                        }
                     >
                        <ArchiveRestore />
                        Restore
                     </Button>
                     <Button size='sm' variant='ghost' aria-label={`Delete “${r.title}”`} onClick={() => onDelete(r)}>
                        <Trash2 className='text-destructive' />
                        Delete
                     </Button>
                  </span>
               </li>
            ))}
         </ul>
      </details>
   )
}

function DeleteReward({ householdId, reward, onClose }: { householdId: string; reward: Reward | null; onClose: () => void }) {
   const remove = useDeleteReward(householdId)
   return (
      <ConfirmDeleteDialog
         open={reward !== null}
         onOpenChange={(open) => !open && onClose()}
         title={`Delete “${reward?.title ?? ''}”?`}
         description='Only rewards nobody has asked for can be deleted; otherwise archive it, so its history stays.'
         isPending={remove.isPending}
         onConfirm={() =>
            reward &&
            remove.mutate(reward.id, {
               onSuccess: () => {
                  toast.success('Reward deleted')
                  onClose()
               },
               onError: (e) => {
                  toast.error(apiError(e).message)
                  onClose()
               },
            })
         }
      />
   )
}
