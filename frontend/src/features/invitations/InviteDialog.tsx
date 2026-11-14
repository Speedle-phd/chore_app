import { useId, useState } from 'react'
import { AtSign, Check, Copy, Link2, Mail, Search, UserRound } from 'lucide-react'
import { apiError, type ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import FormAlert from '@/features/auth/FormAlert'
import type { Member, Role } from '@/features/households/householdsApi'
import { searchUser, useCreateInvitation, type FoundUser, type InvitableRole } from './invitationsApi'

type InviteDialogProps = {
   householdId: string
   householdName: string
   myRole: Role
   /** Profiles the invitee could take over. */
   profiles: Member[]
   /** Pre-selects a profile to claim (opened from that profile's card). */
   claim?: Member
   trigger: React.ReactElement
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

function RoleChoice({ value, onChange, myRole }: { value: InvitableRole; onChange: (r: InvitableRole) => void; myRole: Role }) {
   const id = useId()
   const ownerOnly = myRole !== 'owner'
   return (
      <fieldset className='space-y-2'>
         <legend className='text-sm font-medium'>Role</legend>
         <RadioGroup value={value} onValueChange={(v) => onChange(v as InvitableRole)} className='flex gap-5'>
            <div className='flex items-center gap-2'>
               <RadioGroupItem value='member' id={`${id}-member`} />
               <Label htmlFor={`${id}-member`} className='font-normal'>
                  Member
               </Label>
            </div>
            <div className='flex items-center gap-2'>
               <RadioGroupItem value='admin' id={`${id}-admin`} disabled={ownerOnly} />
               <Label htmlFor={`${id}-admin`} className='font-normal'>
                  Admin
               </Label>
            </div>
         </RadioGroup>
         {ownerOnly && <p className='text-xs text-muted-foreground'>Only owners can invite admins.</p>}
      </fieldset>
   )
}

function ClaimChoice({ profiles, value, onChange, locked }: { profiles: Member[]; value: string; onChange: (id: string) => void; locked: boolean }) {
   const id = useId()
   if (profiles.length === 0) return null
   return (
      <div className='space-y-1.5'>
         <Label htmlFor={id}>Take over a profile (optional)</Label>
         <select
            id={id}
            value={value}
            disabled={locked}
            onChange={(e) => onChange(e.target.value)}
            className='h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70 dark:bg-input/30'
         >
            <option value=''>No, join as a new person</option>
            {profiles.map((p) => (
               <option key={p.id} value={p.id}>
                  {p.fullName}
               </option>
            ))}
         </select>
         <p className='text-xs text-muted-foreground'>They keep that profile’s place and history, with their own login.</p>
      </div>
   )
}

function Sent({ children, onAgain }: { children: React.ReactNode; onAgain: () => void }) {
   return (
      <div className='space-y-4'>
         <FormAlert tone='success'>{children}</FormAlert>
         <Button variant='outline' className='w-full' onClick={onAgain}>
            Invite someone else
         </Button>
      </div>
   )
}

const InviteDialog = ({ householdId, householdName, myRole, profiles, claim, trigger }: InviteDialogProps) => {
   const [open, setOpen] = useState(false)
   const [tab, setTab] = useState<'email' | 'handle' | 'link'>('email')
   const [role, setRole] = useState<InvitableRole>('member')
   const [claimId, setClaimId] = useState(claim?.id ?? '')
   const [email, setEmail] = useState('')
   const [handle, setHandle] = useState('')
   const [found, setFound] = useState<FoundUser | null | undefined>(undefined)
   const [searching, setSearching] = useState(false)
   const [searchError, setSearchError] = useState<ApiError | null>(null)
   const [maxUses, setMaxUses] = useState(25)
   const [copied, setCopied] = useState(false)
   const create = useCreateInvitation(householdId)
   const emailId = useId()
   const handleId = useId()
   const usesId = useId()

   const claimsMembershipId = claimId || undefined
   const result = create.data
   const error = create.isError ? apiError(create.error) : null

   function reset() {
      create.reset()
      setEmail('')
      setHandle('')
      setFound(undefined)
      setSearchError(null)
      setCopied(false)
   }

   async function find() {
      const q = handle.trim().replace(/^@/, '')
      if (!q) return
      setSearching(true)
      setSearchError(null)
      try {
         setFound(await searchUser(q))
      } catch (e) {
         setSearchError(apiError(e))
      } finally {
         setSearching(false)
      }
   }

   const emailWarning = result && result.emailSent === false && (
      <p className='text-xs'>The email couldn’t be sent right now. Use “Resend” in the pending list.</p>
   )

   return (
      <Dialog
         open={open}
         onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
               reset()
               setRole('member')
               setClaimId(claim?.id ?? '')
            }
         }}
      >
         <DialogTrigger render={trigger} />
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle className='text-lg font-semibold'>
                  {claim ? `Invite someone to take over ${claim.fname}` : `Invite people to ${householdName}`}
               </DialogTitle>
               <DialogDescription>Invitations expire after 7 days. They can accept or decline.</DialogDescription>
            </DialogHeader>

            <Tabs
               value={tab}
               onValueChange={(v) => {
                  setTab(v as typeof tab)
                  reset()
               }}
            >
               <TabsList className='w-full'>
                  <TabsTrigger value='email'>
                     <Mail />
                     Email
                  </TabsTrigger>
                  <TabsTrigger value='handle'>
                     <AtSign />
                     Handle
                  </TabsTrigger>
                  {!claim && (
                     <TabsTrigger value='link'>
                        <Link2 />
                        Link
                     </TabsTrigger>
                  )}
               </TabsList>

               <TabsContent value='email' className='pt-4'>
                  {result && tab === 'email' ? (
                     <Sent onAgain={reset}>
                        Invitation sent to {email.trim()}. It only works for an account with that address.
                        {emailWarning}
                     </Sent>
                  ) : (
                     <form
                        noValidate
                        className='space-y-4'
                        onSubmit={(e) => {
                           e.preventDefault()
                           create.mutate({ kind: 'email', email: email.trim(), role, claimsMembershipId })
                        }}
                     >
                        {error && <FormAlert tone='error' error={error} />}
                        <div className='space-y-1.5'>
                           <Label htmlFor={emailId}>Email address</Label>
                           <Input
                              id={emailId}
                              type='email'
                              autoComplete='off'
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className='h-10'
                              required
                           />
                        </div>
                        <RoleChoice value={role} onChange={setRole} myRole={myRole} />
                        <ClaimChoice profiles={profiles} value={claimId} onChange={setClaimId} locked={Boolean(claim)} />
                        <Button type='submit' size='lg' className='h-10 w-full' disabled={!email.trim() || create.isPending}>
                           {create.isPending ? 'Sending…' : 'Send invitation'}
                        </Button>
                     </form>
                  )}
               </TabsContent>

               <TabsContent value='handle' className='pt-4'>
                  {result && tab === 'handle' ? (
                     <Sent onAgain={reset}>
                        Invited {found?.fullName}. They’ll see it in Hearth and get an email.
                        {emailWarning}
                     </Sent>
                  ) : (
                     <div className='space-y-4'>
                        {error && <FormAlert tone='error' error={error} />}
                        <form
                           noValidate
                           className='space-y-1.5'
                           onSubmit={(e) => {
                              e.preventDefault()
                              void find()
                           }}
                        >
                           <Label htmlFor={handleId}>Exact @handle</Label>
                           <div className='flex gap-2'>
                              <div className='relative flex-1'>
                                 <AtSign className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                                 <Input
                                    id={handleId}
                                    autoComplete='off'
                                    spellCheck={false}
                                    value={handle}
                                    onChange={(e) => {
                                       setHandle(e.target.value)
                                       setFound(undefined)
                                    }}
                                    className='h-10 pl-9'
                                 />
                              </div>
                              <Button type='submit' variant='outline' className='h-10' disabled={!handle.trim() || searching}>
                                 <Search />
                                 Find
                              </Button>
                           </div>
                           <p className='text-xs text-muted-foreground'>
                              Only people who turned on “Let others find me” can be found.
                           </p>
                        </form>
                        {searchError && <FormAlert tone='error' error={searchError} />}
                        <div aria-live='polite'>
                           {found === null && (
                              <p className='rounded-xl border border-dashed p-3 text-sm text-muted-foreground'>
                                 No one can be found with that exact handle.
                              </p>
                           )}
                           {found && (
                              <div className='flex items-center gap-3 rounded-xl border p-3'>
                                 <span className='grid size-9 place-items-center rounded-full bg-primary/10 text-primary'>
                                    <UserRound className='size-4' />
                                 </span>
                                 <span className='min-w-0 flex-1'>
                                    <span className='block truncate text-sm font-medium'>{found.fullName}</span>
                                    <span className='block text-xs text-muted-foreground'>@{found.handle}</span>
                                 </span>
                              </div>
                           )}
                        </div>
                        {found && (
                           <>
                              <RoleChoice value={role} onChange={setRole} myRole={myRole} />
                              <ClaimChoice profiles={profiles} value={claimId} onChange={setClaimId} locked={Boolean(claim)} />
                              <Button
                                 size='lg'
                                 className='h-10 w-full'
                                 disabled={create.isPending}
                                 onClick={() => create.mutate({ kind: 'user', userId: found.id, role, claimsMembershipId })}
                              >
                                 {create.isPending ? 'Inviting…' : `Invite ${found.fullName}`}
                              </Button>
                           </>
                        )}
                     </div>
                  )}
               </TabsContent>

               {!claim && (
                  <TabsContent value='link' className='pt-4'>
                     {result?.url ? (
                        <div className='space-y-4'>
                           <div className='space-y-1.5'>
                              <Label htmlFor={`${usesId}-url`}>Share this link</Label>
                              <div className='flex gap-2'>
                                 <Input id={`${usesId}-url`} readOnly value={result.url} className='h-10 font-mono text-xs' onFocus={(e) => e.target.select()} />
                                 <Button
                                    variant='outline'
                                    className='h-10'
                                    onClick={() => {
                                       void navigator.clipboard.writeText(result.url ?? '').then(() => setCopied(true))
                                    }}
                                 >
                                    {copied ? <Check /> : <Copy />}
                                    {copied ? 'Copied' : 'Copy'}
                                 </Button>
                              </div>
                           </div>
                           <FormAlert tone='success'>
                              Anyone with this link can join as {result.invitation.role} until{' '}
                              {fmtDate(result.invitation.expiresAt)}, up to {result.invitation.maxUses}{' '}
                              {result.invitation.maxUses === 1 ? 'person' : 'people'}. For security it’s shown only now; you can
                              revoke it any time.
                           </FormAlert>
                           <Button variant='outline' className='w-full' onClick={reset}>
                              Create another link
                           </Button>
                        </div>
                     ) : (
                        <form
                           noValidate
                           className='space-y-4'
                           onSubmit={(e) => {
                              e.preventDefault()
                              create.mutate({ kind: 'link', role, maxUses })
                           }}
                        >
                           {error && <FormAlert tone='error' error={error} />}
                           <RoleChoice value={role} onChange={setRole} myRole={myRole} />
                           <div className='space-y-1.5'>
                              <Label htmlFor={usesId}>How many people can use it?</Label>
                              <Input
                                 id={usesId}
                                 type='number'
                                 min={1}
                                 max={100}
                                 value={maxUses}
                                 onChange={(e) => setMaxUses(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                                 className='h-10 w-28'
                              />
                           </div>
                           <Button type='submit' size='lg' className='h-10 w-full' disabled={create.isPending}>
                              {create.isPending ? 'Creating…' : 'Create invite link'}
                           </Button>
                        </form>
                     )}
                  </TabsContent>
               )}
            </Tabs>
         </DialogContent>
      </Dialog>
   )
}

export default InviteDialog
