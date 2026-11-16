import { CalendarController } from '@fullcalendar/react'
import { EventCalendarNextIcon, EventCalendarPrevIcon } from '@/components/event-calendar-icons'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface EventCalendarToolbarProps {
  className?: string
  controller: CalendarController
  availableViews: string[]
  addButton?: {
    isPrimary?: boolean
    text?: string
    hint?: string
    click?: (ev: MouseEvent) => void
  }
}

export function EventCalendarToolbar({
  className,
  controller,
  availableViews,
  addButton,
}: EventCalendarToolbarProps) {
   'use no memo'
  const buttons = controller.getButtonState()

  return (
    <div className={cn('flex items-center justify-between flex-wrap gap-3', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {addButton && (
          <Button
            onClick={addButton.click as any}
            aria-label={addButton.hint}
          >{addButton.text}</Button>
        )}
        <Button
          onClick={() => controller.today()}
          // The visible "Today" is the name (WCAG 2.5.3); FullCalendar's hint ("This Month") is only a tooltip.
          title={buttons.today.hint}
          variant="outline"
        >{buttons.today.text}</Button>
        <div className="flex items-center">
          <Button
            onClick={() => controller.prev()}
            disabled={buttons.prev.isDisabled}
            aria-label={buttons.prev.hint}
            variant="ghost"
            size="icon"
          >
            <EventCalendarPrevIcon />
          </Button>
          <Button
            onClick={() => controller.next()}
            disabled={buttons.next.isDisabled}
            aria-label={buttons.next.hint}
            variant="ghost"
            size="icon"
          >
            <EventCalendarNextIcon />
          </Button>
        </div>
        <h2 className="text-lg sm:text-xl" aria-live="polite">{controller.view?.title}</h2>
      </div>
      <Tabs value={controller.view?.type ?? availableViews[0]}>
        <TabsList>
          {availableViews.map((availableView) => (
            <TabsTrigger
              key={availableView}
              value={availableView}
              onClick={() => controller.changeView(availableView)}
              aria-label={buttons[availableView]?.hint}
            >{buttons[availableView]?.text}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
