import { CalendarDays } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { usePageMeta } from './usePageMeta'

const Calendar = () => {
   const meta = usePageMeta('/calendar')
   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Calendar'}
            description={meta?.subtitle}
            Icon={meta?.Icon}
         />
         <EmptyState
            Icon={CalendarDays}
            title='Nothing planned yet'
            description='Shared events and chore schedules will show up here soon.'
         />
      </>
   )
}

export default Calendar
