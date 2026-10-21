
import { cn } from "@/lib/utils"
const MainWrapper = ({ children }: { children: React.ReactNode }) => {
 // Replace 'light' with the actual theme if available
  return (
    <div className={cn(`m-8 p-4 max-w-[clamp(300px,90vw,900px)] bg-primary-foreground mx-auto max-h-3xl border-2 rounded-sm`, "shadow-sm shadow-theme")}>
      {children}
    </div>
  )
}

export default MainWrapper
