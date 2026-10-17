import { Outlet } from 'react-router'
import Header from './Header'
import MainWrapper from './MainWrapper'

const AppLayout = () => {
   return (
      <div>
         <Header />
         <MainWrapper>
            <Outlet />
         </MainWrapper>
      </div>
   )
}

export default AppLayout
