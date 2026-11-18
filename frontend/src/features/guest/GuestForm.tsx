import { useId } from 'react'
import { BookOpen, Phone, Plus, Siren, Trash2, Users, Wifi as WifiIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { selectClass } from '@/features/calendar/styles'
import type { Member } from '@/features/households/householdsApi'
import { cn } from '@/lib/utils'
import { PRIVACY_HINT, wifiPasswordShort, wifiQrText } from './guestText'
import { QrCode } from './QrCode'
import { GUEST_LIMITS, type GuestContent, type Wifi, type WifiSecurity } from './types'

const EMPTY_WIFI: Wifi = { network: '', password: '', security: 'WPA', hidden: false }
const SECURITY: { value: WifiSecurity; label: string }[] = [
   { value: 'WPA', label: 'WPA / WPA2 / WPA3 (most home networks)' },
   { value: 'WEP', label: 'WEP (old routers)' },
   { value: 'nopass', label: 'Open, no password' },
]
const NOTE_IDEAS = ['Keys & doors', 'Fuse box', 'Heating', 'Pets', 'Bins', 'TV & internet']

function Field({ label, hint, children, className }: { label: string; hint?: string; className?: string; children: (id: string, hintId?: string) => React.ReactNode }) {
   const id = useId()
   return (
      <div className={cn('space-y-1.5', className)}>
         <label htmlFor={id} className='text-sm font-medium'>
            {label}
         </label>
         {children(id, hint ? `${id}-hint` : undefined)}
         {hint && (
            <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
               {hint}
            </p>
         )}
      </div>
   )
}

function Block({ title, Icon, description, children }: { title: string; Icon: typeof WifiIcon; description?: string; children: React.ReactNode }) {
   const id = useId()
   return (
      <section aria-labelledby={id} className='rounded-2xl border bg-card p-5 sm:p-6'>
         <h2 id={id} className='flex items-center gap-2 text-lg font-semibold'>
            <Icon className='size-5 text-primary' aria-hidden />
            {title}
         </h2>
         {description && <p className='mt-1 text-sm text-muted-foreground'>{description}</p>}
         <div className='mt-4 space-y-4'>{children}</div>
      </section>
   )
}

/** One entry of a list (contact, person, note) with its remove button. */
function Row({ label, onRemove, children }: { label: string; onRemove: () => void; children: React.ReactNode }) {
   return (
      <div className='relative rounded-xl border bg-background/50 p-4 pt-3'>
         <div className='mb-2 flex items-center justify-between gap-2'>
            <span className='text-xs font-medium text-muted-foreground'>{label}</span>
            <Button type='button' variant='ghost' size='icon-sm' aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
               <Trash2 />
            </Button>
         </div>
         <div className='grid gap-3 sm:grid-cols-2'>{children}</div>
      </div>
   )
}

const AddButton = ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => (
   <Button type='button' variant='outline' size='sm' onClick={onClick} disabled={disabled}>
      <Plus />
      {children}
   </Button>
)

/** Replace item i of a list. */
const put = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...patch } : x))
const drop = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i)

/** The guest page editor (owners and admins). Controlled: the page owns the draft. */
export function GuestForm({ value, onChange, members }: { value: GuestContent; onChange: (next: GuestContent) => void; members: Member[] }) {
   const set = (patch: Partial<GuestContent>) => onChange({ ...value, ...patch })
   const wifi = value.wifi ?? EMPTY_WIFI
   const setWifi = (patch: Partial<Wifi>) => set({ wifi: { ...wifi, ...patch } })
   const wpaShort = wifiPasswordShort(wifi)
   const qrReady = wifi.network.trim() && (wifi.security === 'nopass' || (wifi.password && !wpaShort))
   const e = value.emergency
   const setEmergency = (patch: Partial<GuestContent['emergency']>) => set({ emergency: { ...e, ...patch } })
   const listed = new Set(value.people.map((p) => p.name.trim().toLowerCase()))
   const notListed = members.filter((m) => !listed.has(m.fname.trim().toLowerCase()))
   const usedTitles = new Set(value.notes.map((n) => n.title.trim().toLowerCase()))

   return (
      <div className='space-y-5'>
         <Block title='In an emergency' Icon={Siren} description='Shown first. Phone numbers become call buttons on the guest’s phone.'>
            <Field label='Your address' hint='What a guest tells the emergency service: street, number, town, and anything that helps find the door.'>
               {(id, hint) => (
                  <Textarea id={id} aria-describedby={hint} rows={2} maxLength={300} value={e.address} onChange={(ev) => setEmergency({ address: ev.target.value })} />
               )}
            </Field>
            <fieldset className='space-y-2'>
               <legend className='mb-1.5 text-sm font-medium'>Emergency numbers</legend>
               {e.numbers.map((n, i) => (
                  <div key={i} className='flex items-end gap-2'>
                     <Field label={`Label ${i + 1}`} className='min-w-0 flex-1'>
                        {(id) => <Input id={id} maxLength={40} value={n.label} onChange={(ev) => setEmergency({ numbers: put(e.numbers, i, { label: ev.target.value }) })} />}
                     </Field>
                     <Field label={`Number ${i + 1}`} className='w-32 shrink-0'>
                        {(id) => (
                           <Input id={id} inputMode='tel' maxLength={40} value={n.number} onChange={(ev) => setEmergency({ numbers: put(e.numbers, i, { number: ev.target.value }) })} />
                        )}
                     </Field>
                     <Button type='button' variant='ghost' size='icon' aria-label={`Remove number ${i + 1}`} onClick={() => setEmergency({ numbers: drop(e.numbers, i) })}>
                        <Trash2 />
                     </Button>
                  </div>
               ))}
               <AddButton disabled={e.numbers.length >= GUEST_LIMITS.numbers} onClick={() => setEmergency({ numbers: [...e.numbers, { label: '', number: '' }] })}>
                  Add a number
               </AddButton>
            </fieldset>
            <Field label='Nearest pharmacy' hint='Name and address.'>
               {(id, hint) => (
                  <Textarea id={id} aria-describedby={hint} rows={2} maxLength={300} value={e.pharmacy} onChange={(ev) => setEmergency({ pharmacy: ev.target.value })} />
               )}
            </Field>
         </Block>

         <Block title='Contacts' Icon={Phone} description='People a guest can call: you, grandparents, neighbours.'>
            {value.contacts.map((c, i) => (
               <Row key={i} label={`Contact ${i + 1}`} onRemove={() => set({ contacts: drop(value.contacts, i) })}>
                  <Field label='Name'>{(id) => <Input id={id} maxLength={80} value={c.name} onChange={(ev) => set({ contacts: put(value.contacts, i, { name: ev.target.value }) })} />}</Field>
                  <Field label='Relation' hint='For example “Mum”, “Neighbour”.'>
                     {(id, hint) => (
                        <Input id={id} aria-describedby={hint} maxLength={60} value={c.relation} onChange={(ev) => set({ contacts: put(value.contacts, i, { relation: ev.target.value }) })} />
                     )}
                  </Field>
                  <Field label='Phone'>
                     {(id) => <Input id={id} inputMode='tel' maxLength={40} value={c.phone} onChange={(ev) => set({ contacts: put(value.contacts, i, { phone: ev.target.value }) })} />}
                  </Field>
                  <Field label='Note'>{(id) => <Input id={id} maxLength={300} value={c.note} onChange={(ev) => set({ contacts: put(value.contacts, i, { note: ev.target.value }) })} />}</Field>
               </Row>
            ))}
            <AddButton
               disabled={value.contacts.length >= GUEST_LIMITS.contacts}
               onClick={() => set({ contacts: [...value.contacts, { name: '', relation: '', phone: '', note: '' }] })}
            >
               Add a contact
            </AddButton>
         </Block>

         <Block title='Wi-Fi' Icon={WifiIcon} description='Guests see the name and password, and a QR code their phone camera can join with.'>
            <div className='grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]'>
               <div className='space-y-4'>
                  <Field label='Network name'>
                     {(id) => <Input id={id} maxLength={64} autoComplete='off' spellCheck={false} value={wifi.network} onChange={(ev) => setWifi({ network: ev.target.value })} />}
                  </Field>
                  <Field label='Security'>
                     {(id) => (
                        <select id={id} className={cn(selectClass, 'w-full')} value={wifi.security} onChange={(ev) => setWifi({ security: ev.target.value as WifiSecurity })}>
                           {SECURITY.map((s) => (
                              <option key={s.value} value={s.value}>
                                 {s.label}
                              </option>
                           ))}
                        </select>
                     )}
                  </Field>
                  {wifi.security !== 'nopass' && (
                     <Field label='Password' hint={wifi.security === 'WPA' ? '8 to 63 characters (as on the router’s sticker).' : undefined}>
                        {(id, hint) => (
                           <Input
                              id={id}
                              aria-describedby={hint}
                              aria-invalid={wpaShort || undefined}
                              maxLength={64}
                              autoComplete='off'
                              spellCheck={false}
                              className='font-mono'
                              value={wifi.password}
                              onChange={(ev) => setWifi({ password: ev.target.value })}
                           />
                        )}
                     </Field>
                  )}
                  <label className='flex items-center gap-2.5 text-sm'>
                     <Checkbox checked={wifi.hidden} onCheckedChange={(checked) => setWifi({ hidden: checked })} />
                     Hidden network (doesn’t show up in the list)
                  </label>
               </div>
               <div className='flex flex-col items-center gap-2'>
                  {qrReady ? (
                     <QrCode text={wifiQrText(wifi)} label={`QR code to join the Wi-Fi ${wifi.network}`} className='w-36 border' />
                  ) : (
                     <div className='grid size-36 place-items-center rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground'>The QR code appears here</div>
                  )}
                  {qrReady && <p className='max-w-36 text-center text-xs text-muted-foreground'>Try it with your phone camera.</p>}
               </div>
            </div>
            {value.wifi && (
               <Button type='button' variant='ghost' size='sm' onClick={() => set({ wifi: null })}>
                  <Trash2 />
                  Remove the Wi-Fi details
               </Button>
            )}
         </Block>

         <Block title='People & routines' Icon={Users} description={`Bedtimes, meals and house rules per person. ${PRIVACY_HINT}`}>
            {value.people.map((p, i) => (
               <Row key={i} label={p.name.trim() || `Person ${i + 1}`} onRemove={() => set({ people: drop(value.people, i) })}>
                  <Field label='Name'>{(id) => <Input id={id} maxLength={80} value={p.name} onChange={(ev) => set({ people: put(value.people, i, { name: ev.target.value }) })} />}</Field>
                  <Field label='Bedtime'>
                     {(id) => <Input id={id} maxLength={80} placeholder='19:30, story first' value={p.bedtime} onChange={(ev) => set({ people: put(value.people, i, { bedtime: ev.target.value }) })} />}
                  </Field>
                  <Field label='Meals' className='sm:col-span-2'>
                     {(id) => <Textarea id={id} rows={2} maxLength={500} value={p.meals} onChange={(ev) => set({ people: put(value.people, i, { meals: ev.target.value }) })} />}
                  </Field>
                  <Field label='Rules and good to know' hint={PRIVACY_HINT} className='sm:col-span-2'>
                     {(id, hint) => (
                        <Textarea id={id} aria-describedby={hint} rows={3} maxLength={1000} value={p.rules} onChange={(ev) => set({ people: put(value.people, i, { rules: ev.target.value }) })} />
                     )}
                  </Field>
               </Row>
            ))}
            <div className='flex flex-wrap gap-2'>
               {notListed.map((m) => (
                  <AddButton key={m.id} disabled={value.people.length >= GUEST_LIMITS.people} onClick={() => set({ people: [...value.people, { name: m.fname, bedtime: '', meals: '', rules: '' }] })}>
                     {m.fname}
                  </AddButton>
               ))}
               <AddButton disabled={value.people.length >= GUEST_LIMITS.people} onClick={() => set({ people: [...value.people, { name: '', bedtime: '', meals: '', rules: '' }] })}>
                  {notListed.length ? 'Someone else' : 'Add a person'}
               </AddButton>
            </div>
         </Block>

         <Block title='House notes' Icon={BookOpen} description={`Fuse box, heating, pets, bins… ${PRIVACY_HINT}`}>
            {value.notes.map((n, i) => (
               <Row key={i} label={n.title.trim() || `Note ${i + 1}`} onRemove={() => set({ notes: drop(value.notes, i) })}>
                  <Field label='Title' className='sm:col-span-2'>
                     {(id) => <Input id={id} maxLength={80} value={n.title} onChange={(ev) => set({ notes: put(value.notes, i, { title: ev.target.value }) })} />}
                  </Field>
                  <Field label='Text' hint={PRIVACY_HINT} className='sm:col-span-2'>
                     {(id, hint) => (
                        <Textarea id={id} aria-describedby={hint} rows={3} maxLength={2000} value={n.text} onChange={(ev) => set({ notes: put(value.notes, i, { text: ev.target.value }) })} />
                     )}
                  </Field>
               </Row>
            ))}
            <div className='flex flex-wrap gap-2'>
               {NOTE_IDEAS.filter((t) => !usedTitles.has(t.toLowerCase())).map((title) => (
                  <AddButton key={title} disabled={value.notes.length >= GUEST_LIMITS.notes} onClick={() => set({ notes: [...value.notes, { title, text: '' }] })}>
                     {title}
                  </AddButton>
               ))}
               <AddButton disabled={value.notes.length >= GUEST_LIMITS.notes} onClick={() => set({ notes: [...value.notes, { title: '', text: '' }] })}>
                  Another note
               </AddButton>
            </div>
         </Block>
      </div>
   )
}
