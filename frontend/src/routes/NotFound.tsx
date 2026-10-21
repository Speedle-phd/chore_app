import { NavLink } from "react-router-dom"

const NotFound = () => {
   return (
      <div className='flex flex-col items-center justify-center h-screen'>
         <h1 className='text-4xl font-bold mb-4'>404 - Not Found</h1>
         <p className='text-muted-foreground'>The page you are looking for does not exist.</p>
         <NavLink
            to='/'
            className='mt-4 text-theme underline'
         >
            Go back to the dashboard
         </NavLink>
      </div>
   )
}

export default NotFound