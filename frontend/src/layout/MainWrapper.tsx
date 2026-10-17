import { useTheme } from "@/components/theme-provider"
import { cn, themeClass } from "@/lib/utils"
const MainWrapper = ({ children }: { children: React.ReactNode }) => {
   const { theme } = useTheme()
   const shadowClass = themeClass('shadow', theme) // Replace 'light' with the actual theme if available
  return (
    <div className={cn(`m-4 p-4 max-w-[clamp(300px,90vw,800px)] mx-auto max-h-3xl border-2 rounded-sm`, shadowClass)}>
      {children}
    </div>
  )
}

export default MainWrapper
