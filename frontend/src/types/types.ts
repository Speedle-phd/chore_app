import type { LucideIcon } from "lucide-react"

export type NavigationItem = {
   label: string
   href: string
   Icon: LucideIcon
   subtitle: string
   /**
    * Where the desktop header shows it: a main link, or in the household menu
    * (Members, Settings). Home has no link of its own: the logo goes there.
    * The phone menu lists everything.
    */
   place: 'main' | 'household' | 'logo'
}