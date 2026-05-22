import { useEffect, useState } from 'react'
import type { CalendarDialogState } from '@/types/calendar-dialog'
import type { Child } from '@/types/database'
import type { ScheduleCoverageItem } from '@/lib/plan-attendee'
import type { HouseholdNanny } from '@/types/household-nanny'
import { useCalendarMutations } from '@/hooks/useCalendarMutations'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CalendarEventView } from '@/components/schedule/CalendarEventView'
import { CalendarEventForm } from '@/components/schedule/CalendarEventForm'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyHouseholdNanny } from '@/hooks/useHouseholdData'

const KIND_LABELS = {
  shift: 'Nanny shift',
  time_off: 'Time off',
  activity: "Kid's plan",
  holiday: 'Paid holiday',
} as const

export function CalendarDialog({
  state,
  onClose,
  nannies,
  childrenList,
  scheduleItems,
}: {
  state: CalendarDialogState | null
  onClose: () => void
  nannies: HouseholdNanny[] | undefined
  childrenList: Child[] | undefined
  scheduleItems?: ScheduleCoverageItem[]
}) {
  const open = state !== null
  const mutations = useCalendarMutations()
  const { data: myNanny } = useMyHouseholdNanny()

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        {state && (
          <CalendarDialogInner
            state={state}
            onClose={onClose}
            nannies={nannies}
            childrenList={childrenList}
            scheduleItems={scheduleItems}
            myNannyId={myNanny?.id}
            mutations={mutations}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CalendarDialogInner({
  state,
  onClose,
  nannies,
  childrenList,
  scheduleItems,
  myNannyId,
  mutations,
}: {
  state: CalendarDialogState
  onClose: () => void
  nannies: HouseholdNanny[] | undefined
  childrenList: Child[] | undefined
  scheduleItems?: ScheduleCoverageItem[]
  myNannyId?: string
  mutations: ReturnType<typeof useCalendarMutations>
}) {
  const { isParent, isNanny } = useHousehold()
  const [mode, setMode] = useState(state.mode)

  useEffect(() => {
    setMode(state.mode)
  }, [state])

  const event = state.mode !== 'create' ? state.event : null
  const title =
    mode === 'create'
      ? 'New event'
      : mode === 'edit' && event
        ? `Edit ${KIND_LABELS[event.kind]}`
        : event?.title ?? 'Event'

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {mode === 'create' && (
          <DialogDescription>
            Schedule a nanny shift, time off, or a planned activity for the kids.
          </DialogDescription>
        )}
      </DialogHeader>

      {mode === 'view' && event ? (
        <CalendarEventView
          event={event}
          isParent={isParent}
          isNanny={isNanny}
          onEdit={() => {
            if (event.kind === 'holiday') return
            setMode('edit')
          }}
          onReportLate={
            isNanny && event.kind === 'shift' ? () => setMode('edit') : undefined
          }
          onClose={onClose}
          mutations={mutations}
        />
      ) : (
        <CalendarEventForm
          state={
            mode === 'edit' && state.mode !== 'create'
              ? { mode: 'edit', event: state.event }
              : state.mode === 'create'
                ? state
                : { mode: 'edit', event: state.event }
          }
          nannies={nannies}
          childrenList={childrenList}
          scheduleItems={scheduleItems}
          myNannyId={myNannyId}
          mutations={mutations}
          onSaved={onClose}
          onCancel={
            mode === 'edit' && event
              ? () => setMode('view')
              : onClose
          }
        />
      )}
    </>
  )
}
