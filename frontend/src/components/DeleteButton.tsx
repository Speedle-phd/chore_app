import { TrashIcon } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

type DeleteButtonProps = React.ComponentProps<typeof Button> & {
   label?: string
}

/** Icon button; forwards all props so it can be used as a dialog trigger. */
const DeleteButton = ({
   className,
   label = 'Delete',
   ...props
}: DeleteButtonProps) => {
   return (
      <Button
         size='icon-sm'
         variant='ghost'
         aria-label={label}
         title={label}
         className={cn(
            'cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
            className,
         )}
         {...props}
      >
         <TrashIcon />
      </Button>
   )
}

export default DeleteButton
