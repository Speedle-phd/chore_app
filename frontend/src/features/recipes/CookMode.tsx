import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Recipe } from './recipesApi'

/**
 * Full-screen steps for the kitchen: big text, one step at a time (buttons or ← →),
 * and the screen stays on while it's open (Screen Wake Lock, where supported).
 */
export function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
   const [step, setStep] = useState(0)
   const [awake, setAwake] = useState<boolean | null>(null)
   const last = recipe.steps.length - 1

   useEffect(() => {
      let lock: WakeLockSentinel | null = null
      let cancelled = false
      const request = async () => {
         try {
            if (!('wakeLock' in navigator)) return setAwake(false)
            lock = await navigator.wakeLock.request('screen')
            if (cancelled) await lock.release()
            else setAwake(true)
         } catch {
            // Refused (battery saver, no permission): cooking still works, the screen may dim.
            setAwake(false)
         }
      }
      void request()
      // A wake lock ends when the tab is hidden; take it again when it's back.
      const onVisible = () => {
         if (document.visibilityState === 'visible' && (!lock || lock.released)) void request()
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
         cancelled = true
         document.removeEventListener('visibilitychange', onVisible)
         void lock?.release()
      }
   }, [])

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent
            className='flex h-dvh max-h-none w-screen max-w-none flex-col rounded-none sm:max-w-none'
            onKeyDown={(e) => {
               if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, last))
               if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0))
            }}
         >
            <DialogHeader>
               <DialogTitle>{recipe.title}</DialogTitle>
               <DialogDescription>
                  Step {step + 1} of {recipe.steps.length}
                  {awake === true ? ' · the screen stays on' : ''}
               </DialogDescription>
            </DialogHeader>
            <div className='flex min-h-0 flex-1 items-center justify-center overflow-y-auto py-6'>
               <p className='max-w-3xl text-2xl leading-relaxed sm:text-3xl' aria-live='polite'>
                  {recipe.steps[step]}
               </p>
            </div>
            <div className='flex items-center justify-between gap-3 border-t pt-4'>
               <Button variant='outline' size='lg' className='h-12 px-5 text-base' disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                  <ChevronLeft />
                  Back
               </Button>
               <span className='flex gap-1.5' aria-hidden>
                  {recipe.steps.map((_, i) => (
                     <span key={i} className={i === step ? 'size-2 rounded-full bg-primary' : 'size-2 rounded-full bg-muted'} />
                  ))}
               </span>
               {step < last ? (
                  <Button size='lg' className='h-12 px-5 text-base' onClick={() => setStep((s) => s + 1)}>
                     Next
                     <ChevronRight />
                  </Button>
               ) : (
                  <Button size='lg' className='h-12 px-5 text-base' onClick={onClose}>
                     Done
                  </Button>
               )}
            </div>
         </DialogContent>
      </Dialog>
   )
}
