import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'>

/** Password field with a show/hide toggle. Paste and password managers stay allowed. */
const PasswordInput = ({ className, ...props }: PasswordInputProps) => {
   const [visible, setVisible] = useState(false)
   return (
      <div className='relative'>
         <Input
            type={visible ? 'text' : 'password'}
            spellCheck={false}
            className={cn('h-10 pr-10', className)}
            {...props}
         />
         <button
            type='button'
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className='absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            {visible ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
         </button>
      </div>
   )
}

export default PasswordInput
