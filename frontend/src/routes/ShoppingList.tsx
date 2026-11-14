import { ShoppingBasket } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { usePageMeta } from './usePageMeta'

const ShoppingList = () => {
   const meta = usePageMeta('/shopping-list')
   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Shopping list'}
            description={meta?.subtitle}
            Icon={meta?.Icon}
         />
         <EmptyState
            Icon={ShoppingBasket}
            title='Your list is empty'
            description='Add items here and everyone at home will see them in real time.'
         />
      </>
   )
}

export default ShoppingList
