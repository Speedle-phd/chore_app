import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorPage() {
   const error = useRouteError()

   let message = 'Something unexpected happened.'

   if (isRouteErrorResponse(error)) {
      message =
         error.status === 404
            ? "Sorry, we couldn't find that page."
            : error.statusText || message
   } else if (error instanceof Error) {
      // Log details for debugging; don't expose them to users.
      console.error(error)
   }

   return (
      <main className='flex min-h-dvh flex-col items-center justify-center gap-2 bg-background p-6 text-center text-foreground'>
         <span className='mb-4 grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive'>
            <TriangleAlert className='size-7' />
         </span>
         <h1 className='text-3xl font-semibold'>Something went wrong</h1>

         <p className='max-w-sm text-muted-foreground'>{message}</p>

         <Button size='lg' className='mt-6 px-4' onClick={() => window.location.assign('/')}>
            Back to home
         </Button>
      </main>
   )
}
