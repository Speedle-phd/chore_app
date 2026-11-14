import { PencilIcon } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

type EditButtonProps = React.ComponentProps<typeof Button> & {
   label?: string
}

/** Icon button; forwards all props so it can be used as a dialog trigger. */
const EditButton = ({ className, label = 'Edit', ...props }: EditButtonProps) => {
   return (
      <Button
         size='icon-sm'
         variant='ghost'
         aria-label={label}
         title={label}
         className={cn('cursor-pointer text-muted-foreground', className)}
         {...props}
      >
         <PencilIcon />
      </Button>
   )
}

export default EditButton
