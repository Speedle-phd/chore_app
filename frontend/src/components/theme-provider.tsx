import { createContext, useContext, useEffect, useState } from 'react'

import { THEMES, isTheme, themeMode, type Theme, type ThemeId, type ThemeMode } from './themes'

type ThemeProviderProps = {
   children: React.ReactNode
   defaultTheme?: Theme
   storageKey?: string
}

type ThemeProviderState = {
   theme: Theme
   /** The light or dark mode the page is showing (system resolved). */
   mode: ThemeMode
   setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
   theme: 'system',
   mode: 'light',
   setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({
   children,
   defaultTheme = 'system',
   storageKey = 'vite-ui-theme',
   ...props
}: ThemeProviderProps) {
   // A saved theme that no longer exists (Midnight Ocean, Plum Noir) falls back to the default.
   const [theme, setTheme] = useState<Theme>(() => {
      const saved = localStorage.getItem(storageKey)
      return isTheme(saved) ? saved : defaultTheme
   })
   const [systemDark, setSystemDark] = useState(() => darkQuery().matches)

   useEffect(() => {
      const query = darkQuery()
      const onChange = () => setSystemDark(query.matches)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
   }, [])

   const applied: ThemeId = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

   useEffect(() => {
      const root = window.document.documentElement
      root.classList.remove(...THEMES.map((t) => t.id))
      root.classList.add(applied)
   }, [applied])

   const value = {
      theme,
      mode: themeMode(applied),
      setTheme: (theme: Theme) => {
         localStorage.setItem(storageKey, theme)
         setTheme(theme)
      },
   }

   return (
      <ThemeProviderContext.Provider {...props} value={value}>
         {children}
      </ThemeProviderContext.Provider>
   )
}

export const useTheme = () => {
   const context = useContext(ThemeProviderContext)

   if (context === undefined)
      throw new Error('useTheme must be used within a ThemeProvider')

   return context
}
