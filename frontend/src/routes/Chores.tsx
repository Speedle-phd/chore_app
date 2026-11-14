import { Sparkles } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { usePageMeta } from './usePageMeta'

const Chores = () => {
   const meta = usePageMeta('/chores')
   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Chores'}
            description={meta?.subtitle}
            Icon={meta?.Icon}
         />
         <EmptyState
            Icon={Sparkles}
            title='No chores yet'
            description='Soon you can create chores, assign them to schnuffis and track who did what.'
         />
      </>
   )
}

export default Chores
