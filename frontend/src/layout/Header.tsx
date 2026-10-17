import { ModeToggle } from "@/components/mode-toggle"
import { useTheme } from "@/components/theme-provider"
import { cn, themeClass } from "@/lib/utils"

const Header = () => {
   const { theme } = useTheme()
   const shadowClass = themeClass('shadow', theme)
  return (
     <div className={cn(`bg-primary-foreground p-4 flex items-center`, shadowClass)}>
        <header>
         <h1 className="text-lg font-bold">Household Chores</h1>
         <p className="text-xs text-muted-foreground">Manage the schnuffification of a schnuffilicious mess</p>
        </header>
        <div className="ml-auto">
           <ModeToggle />
        </div>
     </div>
  )
}

export default Header
