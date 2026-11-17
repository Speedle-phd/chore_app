import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuLabel,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/components/theme-provider'
import { THEMES, isTheme, type ThemeId, type ThemeMode } from '@/components/themes'
import { cn } from 'cn'

/** Background, card and brand colour of a theme, read from its own tokens (its class scopes them). */
function Swatch({ theme }: { theme: ThemeId }) {
   return (
      <span
         aria-hidden
         className={cn(theme, 'flex size-5 shrink-0 overflow-hidden rounded-full border border-border bg-background')}
      >
         <span className='flex-1 bg-background' />
         <span className='flex-1 bg-primary' />
      </span>
   )
}

const SECTIONS: { mode: ThemeMode; label: string }[] = [
   { mode: 'light', label: 'Light themes' },
   { mode: 'dark', label: 'Dark themes' },
]

export function ModeToggle() {
   const { theme, setTheme } = useTheme()
   const pick = (value: unknown) => {
      if (isTheme(value)) setTheme(value)
   }

   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            render={
               <Button variant='outline' size='icon'>
                  <Sun className='h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90' />
                  <Moon className='absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0' />
                  <span className='sr-only'>Colour theme</span>
               </Button>
            }
         ></DropdownMenuTrigger>
         <DropdownMenuContent align='end' className='min-w-44'>
            <DropdownMenuRadioGroup value={theme} onValueChange={pick}>
               <DropdownMenuRadioItem value='system' className='gap-2'>
                  <Monitor aria-hidden className='size-5 text-muted-foreground' />
                  Same as device
               </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {SECTIONS.map((section) => [
               <DropdownMenuSeparator key={`${section.mode}-separator`} />,
               <DropdownMenuGroup key={section.mode}>
                  <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={theme} onValueChange={pick}>
                     {THEMES.filter((t) => t.mode === section.mode).map((t) => (
                        <DropdownMenuRadioItem key={t.id} value={t.id} className='gap-2'>
                           <Swatch theme={t.id} />
                           {t.label}
                        </DropdownMenuRadioItem>
                     ))}
                  </DropdownMenuRadioGroup>
               </DropdownMenuGroup>,
            ])}
         </DropdownMenuContent>
      </DropdownMenu>
   )
}
