import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ThemeProvider } from '@/components/theme-provider'
import AppLayout from './layout/AppLayout.tsx'

let router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      {
        index: true,
        Component: App,
      }
    ]
  },
]) 

createRoot(document.getElementById('root')!).render(
   <StrictMode>
      <ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
         <RouterProvider router={router} />
      </ThemeProvider>
   </StrictMode>,
)
