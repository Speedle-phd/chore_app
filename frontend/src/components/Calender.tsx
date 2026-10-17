import { useTheme } from '@/components/theme-provider'
import interactionPlugin from '@fullcalendar/react/interaction'
import { EventCalendar } from '@/components/event-calendar'



export default function Calendar() {
   const {theme} = useTheme()
   const handleDateClick = (arg: any) => {
      console.log('date clicked: ' + arg.dateStr)
   }
   return (
      <div className='p-6'>
         <EventCalendar
            availableViews={['dayGridMonth', 'timeGridWeek', 'listWeek']}
            addButton={{
               text: 'Add Event',
               click() {
                  alert('add event...')
               },
            }}
            height="90vh"
            dateClick={handleDateClick}
            plugins={[interactionPlugin]}
            editable
            selectable
            eventColor={theme === 'dark' ? '#0bd458' : '#194bd4'}
            events={[
               { title: 'event 1', date: '2026-10-01' },
               { title: 'event 2', date: '2026-10-02' },
            ]}
         />
      </div>
   )
}
