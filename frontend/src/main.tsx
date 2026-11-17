import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Settings from './routes/Settings.tsx'
import ShoppingList from './routes/ShoppingList.tsx'  
import Calendar from './routes/Calendar.tsx'
import Chores from './routes/Chores.tsx'
import Members from './routes/Members.tsx' 
import MemberOverview from './routes/MemberOverview.tsx'
import Recipes from './routes/Recipes.tsx'
import RecipeDetail from './routes/RecipeDetail.tsx'
import RecipeEdit from './routes/RecipeEdit.tsx'
import Packing from './routes/Packing.tsx'
import PackingListPage from './routes/PackingListPage.tsx'
import NotFound from './routes/NotFound.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ThemeProvider } from '@/components/theme-provider'
import AppLayout from './layout/AppLayout.tsx'
import ErrorPage from './routes/ErrorPage.tsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { GuestOnly, RequireAuth } from '@/features/auth/AuthGuards'
import Login from './routes/auth/Login.tsx'
import Signup from './routes/auth/Signup.tsx'
import VerifyEmail from './routes/auth/VerifyEmail.tsx'
import ForgotPassword from './routes/auth/ForgotPassword.tsx'
import ResetPassword from './routes/auth/ResetPassword.tsx'
import Onboarding from './routes/Onboarding.tsx'
import Invite from './routes/Invite.tsx'
import Invitations from './routes/Invitations.tsx'
import Account from './routes/Account.tsx'
import { RequireHousehold } from '@/features/households/RequireHousehold'
import { Toaster } from '@/components/ui/sonner'
import { MotionConfig } from 'motion/react'

const router = createBrowserRouter([
   {
      // Signed-in app
      Component: RequireAuth,
      errorElement: <ErrorPage />,
      children: [
         { path: 'onboarding', Component: Onboarding },
         {
            // The app itself needs a household
            Component: RequireHousehold,
            children: [
         {
            path: '/',
            Component: AppLayout,
            children: [
               { index: true, Component: App },
               { path: 'calendar', Component: Calendar },
               { path: 'chores', Component: Chores },
               { path: 'members', Component: Members },
               { path: 'members/:memberId', Component: MemberOverview },
               { path: 'shopping-list', Component: ShoppingList },
               { path: 'recipes', Component: Recipes },
               { path: 'recipes/new', Component: RecipeEdit },
               { path: 'recipes/:recipeId', Component: RecipeDetail },
               { path: 'recipes/:recipeId/edit', Component: RecipeEdit },
               { path: 'packing', Component: Packing },
               { path: 'packing/:listId', Component: PackingListPage },
               { path: 'settings', Component: Settings },
               { path: 'invitations', Component: Invitations },
               { path: 'account', Component: Account },
            ],
         },
            ],
         },
      ],
   },
   {
      // Only for signed-out visitors
      Component: GuestOnly,
      errorElement: <ErrorPage />,
      children: [
         { path: 'login', Component: Login },
         { path: 'signup', Component: Signup },
         { path: 'forgot-password', Component: ForgotPassword },
      ],
   },
   // Emailed links work whether or not someone is signed in on this device
   { path: 'verify-email', Component: VerifyEmail, errorElement: <ErrorPage /> },
   { path: 'reset-password', Component: ResetPassword, errorElement: <ErrorPage /> },
   { path: 'invite', Component: Invite, errorElement: <ErrorPage /> },
   { path: '*', Component: NotFound },
])

createRoot(document.getElementById('root')!).render(
   <StrictMode>
      <ThemeProvider
         defaultTheme='dark'
         storageKey='vite-ui-theme'
         
      >
         <QueryClientProvider client={queryClient}>
            <MotionConfig reducedMotion='user'>
               <RouterProvider router={router} />
               <Toaster richColors position='bottom-right' />
            </MotionConfig>
         </QueryClientProvider>
      </ThemeProvider>
   </StrictMode>,
)
