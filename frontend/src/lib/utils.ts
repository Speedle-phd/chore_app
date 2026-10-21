export { cn } from "cn"

export const themeClass = (key: string, theme: string) => {
   const keys = {
      shadow:
         theme === 'dark'
            ? 'shadow-xs shadow-teal-200'
            : 'shadow-xs shadow-amber-700',
      background:
         theme === 'dark'
            ? '!bg-teal-200 text-black'
            : '!bg-amber-700 text-white',
      text: theme === 'dark' ? '!text-black' : '!text-white',
      textAccent: theme === 'dark' ? '!text-teal-200' : '!text-amber-700',
      border: theme === 'dark' ? 'border border-teal-200' : 'border border-amber-700'
   } as Record<string, string>
   if (!keys[key]) {
      return null
   }
   return keys[key]
}