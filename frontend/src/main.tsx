import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Settings from './routes/Settings.tsx'
import ShoppingList from './routes/ShoppingList.tsx'  
import Calendar from './routes/Calendar.tsx'
import Chores from './routes/Chores.tsx'
import Members from './routes/Members.tsx' 
import NotFound from './routes/NotFound.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ThemeProvider } from '@/components/theme-provider'
import AppLayout from './layout/AppLayout.tsx'
import { appLoader } from './loaders/appLoader.ts'

let router = createBrowserRouter([
   {
      path: '/',
      Component: AppLayout,
      loader: appLoader,
      children: [
         {
            index: true,
            Component: App,
         },
         {
            path: 'calendar',
            Component: Calendar,
         },
         {
            path: 'chores',
            Component: Chores,
         },
         {
            path: 'members',
            Component: Members,
         },
         {
            path: 'shopping-list',
            Component: ShoppingList,
         },
         {
            path: 'settings',
            Component: Settings,
         }
      
      ],
      
   },
   {
      path: '*',
      Component: NotFound,
   }
])

createRoot(document.getElementById('root')!).render(
   <StrictMode>
      <ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
         <RouterProvider router={router} />
      </ThemeProvider>
   </StrictMode>,
)
