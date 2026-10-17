export { cn } from "cn"

export const themeClass = (key: string, theme: string) => {
   const keys = {
      shadow: theme === 'dark' ? 'shadow-xs shadow-teal-200' : 'shadow-xs shadow-amber-600',
      background: theme === 'dark' ? 'bg-teal-200' : 'bg-amber-600',
      text: theme === 'dark' ? 'text-white' : 'text-black',
   } as Record<string, string>
   if (!keys[key]) {
      return null
   }
   return keys[key]
}