import { Home, Link2Off, Printer, RefreshCw, TimerOff } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { guestPageProblem, useGuestPage } from '@/features/guest/guestApi'
import { GuestPageEmpty, GuestPageView } from '@/features/guest/GuestPageView'

const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

function Shell({ children, title }: { children: React.ReactNode; title: string }) {
   return (
      <div className='min-h-dvh bg-background print:bg-white'>
         {/* React 19 hoists these into <head>: keep the page out of search engines and the secret out of referrers. */}
         <title>{title}</title>
         <meta name='robots' content='noindex, nofollow' />
         <meta name='referrer' content='no-referrer' />
         <main className='mx-auto max-w-2xl px-4 py-6 sm:py-10 print:max-w-none print:p-0'>{children}</main>
      </div>
   )
}

function Problem({ Icon, title, text }: { Icon: typeof Home; title: string; text: string }) {
   return (
      <div role='alert' className='mt-16 flex flex-col items-center gap-3 text-center'>
         <Icon className='size-10 text-muted-foreground' aria-hidden />
         <h1 className='text-xl font-semibold'>{title}</h1>
         <p className='max-w-sm text-sm text-muted-foreground'>{text}</p>
      </div>
   )
}

/** The public guest page behind a secret link: read-only, no sign-in, nothing else of the household. */
export default function GuestPage() {
   const { token = '' } = useParams()
   const page = useGuestPage(token)

   if (page.isPending) {
      return (
         <Shell title='Guest page'>
            <p role='status' className='mt-16 text-center text-sm text-muted-foreground'>
               Loading…
            </p>
         </Shell>
      )
   }
   if (page.isError) {
      const problem = guestPageProblem(page.error)
      return (
         <Shell title='Guest page'>
            {problem === 'expired' ? (
               <Problem Icon={TimerOff} title='This link has expired' text='Ask your hosts for a new link if you still need the information.' />
            ) : problem === 'missing' ? (
               <Problem Icon={Link2Off} title='This link doesn’t work' text='It may have been mistyped, replaced or turned off. Ask your hosts for the current link.' />
            ) : (
               <div className='mt-16 flex flex-col items-center gap-3 text-center'>
                  <Problem Icon={Home} title='Couldn’t load the guest page' text={apiError(page.error).message} />
                  <Button variant='outline' onClick={() => void page.refetch()}>
                     <RefreshCw />
                     Try again
                  </Button>
               </div>
            )}
         </Shell>
      )
   }

   const { household, sections, updatedAt } = page.data
   const empty = Object.keys(sections).length === 0
   return (
      <Shell title={`Welcome to ${household}`}>
         <header className='mb-6 flex flex-wrap items-start justify-between gap-3 print:mb-4'>
            <div>
               <p className='flex items-center gap-1.5 text-sm font-medium text-primary'>
                  <Home className='size-4' aria-hidden />
                  Guest page
               </p>
               <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>Welcome to {household}</h1>
               {updatedAt && <p className='mt-1 text-sm text-muted-foreground'>Last updated {dateText(updatedAt)}</p>}
            </div>
            {!empty && (
               <Button variant='outline' onClick={() => window.print()} className='print:hidden'>
                  <Printer />
                  Print
               </Button>
            )}
         </header>
         {empty ? <GuestPageEmpty /> : <GuestPageView sections={sections} />}
         <p className='mt-8 text-center text-xs text-muted-foreground print:hidden'>Made with Hearth. Please don’t share this link.</p>
      </Shell>
   )
}
