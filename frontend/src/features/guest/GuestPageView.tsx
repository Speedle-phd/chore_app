import { useState } from 'react'
import { BookOpen, Check, Copy, Eye, EyeOff, Info, Phone, Pill, Siren, Users, Wifi as WifiIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GuestContent, Wifi } from './guestApi'
import { telHref, wifiQrText } from './guestText'
import { QrCode } from './QrCode'

function Card({ title, Icon, children, tone }: { title: string; Icon: typeof WifiIcon; children: React.ReactNode; tone?: 'urgent' }) {
   return (
      <section
         aria-label={title}
         className={cn('break-inside-avoid rounded-2xl border bg-card p-5 print:rounded-none print:border-x-0 print:border-b-0 print:px-0', tone === 'urgent' && 'border-destructive/40')}
      >
         <h2 className='mb-4 flex items-center gap-2 text-lg font-semibold'>
            <Icon className={cn('size-5', tone === 'urgent' ? 'text-destructive' : 'text-primary')} aria-hidden />
            {title}
         </h2>
         {children}
      </section>
   )
}

/** A phone number as a big tappable call link (prints as plain text). */
function CallLink({ number, label }: { number: string; label?: string }) {
   return (
      <a
         href={telHref(number)}
         className='inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3.5 font-semibold tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 print:min-h-0 print:border-0 print:p-0'
      >
         <Phone className='size-4 text-primary print:hidden' aria-hidden />
         {label && <span className='sr-only'>Call {label}: </span>}
         {number}
      </a>
   )
}

function WifiCard({ wifi }: { wifi: Wifi }) {
   const [shown, setShown] = useState(false)
   const [copied, setCopied] = useState(false)
   const open = wifi.security === 'nopass'
   const copy = () =>
      void navigator.clipboard.writeText(wifi.password).then(() => {
         setCopied(true)
         setTimeout(() => setCopied(false), 2000)
      })
   return (
      <Card title='Wi-Fi' Icon={WifiIcon}>
         <div className='grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start'>
            <dl className='space-y-3 text-sm'>
               <div>
                  <dt className='text-muted-foreground'>Network</dt>
                  <dd className='text-base font-semibold break-all'>{wifi.network}</dd>
                  {wifi.hidden && <dd className='text-muted-foreground'>Hidden network: type the name in by hand.</dd>}
               </div>
               <div>
                  <dt className='text-muted-foreground'>Password</dt>
                  {open ? (
                     <dd className='font-medium'>None (open network)</dd>
                  ) : (
                     <dd className='flex flex-wrap items-center gap-2'>
                        <span className='font-mono text-base break-all'>
                           {/* Hidden on screen until asked (people look over shoulders); always on paper. */}
                           <span className={cn(!shown && 'hidden print:inline')}>{wifi.password}</span>
                           {!shown && (
                              <span className='print:hidden' aria-hidden>
                                 ••••••••
                              </span>
                           )}
                           {!shown && <span className='sr-only'>hidden</span>}
                        </span>
                        <span className='flex gap-1 print:hidden'>
                           <Button size='sm' variant='outline' onClick={() => setShown((s) => !s)} aria-pressed={shown}>
                              {shown ? <EyeOff /> : <Eye />}
                              {shown ? 'Hide' : 'Show'}
                           </Button>
                           <Button size='sm' variant='outline' onClick={copy}>
                              {copied ? <Check /> : <Copy />}
                              {copied ? 'Copied' : 'Copy'}
                           </Button>
                        </span>
                        <span role='status' className='sr-only'>
                           {copied ? 'Password copied' : ''}
                        </span>
                     </dd>
                  )}
               </div>
            </dl>
            <figure className='flex flex-col items-center gap-2'>
               <QrCode text={wifiQrText(wifi)} label={`QR code to join the Wi-Fi ${wifi.network}`} className='w-44 border' />
               <figcaption className='max-w-44 text-center text-xs text-muted-foreground'>Point your phone camera at it to join.</figcaption>
            </figure>
         </div>
      </Card>
   )
}

const Pre = ({ children }: { children: React.ReactNode }) => <p className='text-sm whitespace-pre-wrap'>{children}</p>

/** The guest page's sections (public page and "Preview as a guest"); empty sections are left out by the caller/server. */
export function GuestPageView({ sections }: { sections: Partial<GuestContent> }) {
   const { wifi, emergency, contacts, people, notes } = sections
   return (
      <div className='space-y-4 print:space-y-0'>
         {emergency && (
            <Card title='In an emergency' Icon={Siren} tone='urgent'>
               <div className='space-y-4 text-sm'>
                  {emergency.numbers.length > 0 && (
                     <ul className='flex flex-wrap gap-2'>
                        {emergency.numbers.map((n, i) => (
                           <li key={i} className='flex flex-col gap-1'>
                              <span className='text-xs text-muted-foreground'>{n.label}</span>
                              <CallLink number={n.number} label={n.label} />
                           </li>
                        ))}
                     </ul>
                  )}
                  {emergency.address && (
                     <div>
                        <p className='text-muted-foreground'>Tell them this address</p>
                        <p className='text-base font-semibold whitespace-pre-wrap'>{emergency.address}</p>
                     </div>
                  )}
                  {emergency.pharmacy && (
                     <div>
                        <p className='flex items-center gap-1.5 text-muted-foreground'>
                           <Pill className='size-4' aria-hidden />
                           Nearest pharmacy
                        </p>
                        <p className='whitespace-pre-wrap'>{emergency.pharmacy}</p>
                     </div>
                  )}
               </div>
            </Card>
         )}

         {contacts && (
            <Card title='Contacts' Icon={Phone}>
               <ul className='divide-y'>
                  {contacts.map((c, i) => (
                     <li key={i} className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0'>
                        <div className='min-w-0'>
                           <p className='font-semibold'>
                              {c.name}
                              {c.relation && <span className='font-normal text-muted-foreground'> · {c.relation}</span>}
                           </p>
                           {c.note && <p className='text-sm text-muted-foreground'>{c.note}</p>}
                        </div>
                        <CallLink number={c.phone} label={c.name} />
                     </li>
                  ))}
               </ul>
            </Card>
         )}

         {wifi && <WifiCard wifi={wifi} />}

         {people && (
            <Card title='People & routines' Icon={Users}>
               <div className='grid gap-3 sm:grid-cols-2'>
                  {people.map((p, i) => (
                     <article key={i} className='break-inside-avoid rounded-xl bg-muted/60 p-4 print:bg-transparent print:p-0'>
                        <h3 className='mb-2 font-semibold'>{p.name}</h3>
                        <dl className='space-y-2 text-sm'>
                           {p.bedtime && (
                              <div>
                                 <dt className='text-muted-foreground'>Bedtime</dt>
                                 <dd>{p.bedtime}</dd>
                              </div>
                           )}
                           {p.meals && (
                              <div>
                                 <dt className='text-muted-foreground'>Meals</dt>
                                 <dd className='whitespace-pre-wrap'>{p.meals}</dd>
                              </div>
                           )}
                           {p.rules && (
                              <div>
                                 <dt className='text-muted-foreground'>Good to know</dt>
                                 <dd className='whitespace-pre-wrap'>{p.rules}</dd>
                              </div>
                           )}
                        </dl>
                     </article>
                  ))}
               </div>
            </Card>
         )}

         {notes && (
            <Card title='House notes' Icon={BookOpen}>
               <div className='space-y-4'>
                  {notes.map((n, i) => (
                     <div key={i} className='break-inside-avoid'>
                        <h3 className='font-semibold'>{n.title}</h3>
                        {n.text && <Pre>{n.text}</Pre>}
                     </div>
                  ))}
               </div>
            </Card>
         )}
      </div>
   )
}

/** Shown when a link has nothing to show (all its sections are empty). */
export function GuestPageEmpty() {
   return (
      <p className='flex items-center gap-2 rounded-2xl border bg-card p-5 text-sm text-muted-foreground'>
         <Info className='size-4' aria-hidden />
         Nothing here yet. Ask your hosts to fill in the guest page.
      </p>
   )
}
