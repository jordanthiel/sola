import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMembers, useMyHouseholdNanny, useNannies } from '@/hooks/useHouseholdData'
import { householdMemberDisplayName } from '@/lib/member-display'
import { nannyDisplayName } from '@/lib/nanny'
import type { PlanAttendeeValue } from '@/lib/plan-attendee'
import { Label } from '@/components/ui/label'
import { selectCn } from '@/lib/utils'

export function PlanAttendeeSelect({
  id = 'plan-attendee',
  value,
  onChange,
}: {
  id?: string
  value: PlanAttendeeValue
  onChange: (value: PlanAttendeeValue) => void
}) {
  const { user } = useAuth()
  const { isNanny } = useHousehold()
  const { data: members } = useMembers()
  const { data: nannies } = useNannies()
  const { data: myNanny } = useMyHouseholdNanny()

  const parentMembers =
    members?.filter((m) => m.role === 'owner' || m.role === 'parent') ?? []
  const activeNannies = nannies?.filter((n) => !n.deactivated_at) ?? []

  return (
    <fieldset className="space-y-2">
      <Label htmlFor={id}>Who&apos;s going</Label>
      <select
        id={id}
        className={selectCn}
        value={value}
        onChange={(e) => onChange(e.target.value as PlanAttendeeValue)}
      >
        <option value="">Not specified</option>
        {parentMembers.length > 0 && (
          <optgroup label="Parents">
            {parentMembers.map((m) => (
              <option key={m.user_id} value={`user:${m.user_id}`}>
                {householdMemberDisplayName(m, {
                  currentUserId: user?.id,
                  currentUserEmail: user?.email,
                })}
              </option>
            ))}
          </optgroup>
        )}
        {activeNannies.length > 0 && (
          <optgroup label="Nannies">
            {activeNannies.map((n) => (
              <option
                key={n.id}
                value={n.user_id ? `user:${n.user_id}` : `nanny:${n.id}`}
              >
                {nannyDisplayName(n)}
                {!n.user_id ? ' (not linked)' : ''}
              </option>
            ))}
          </optgroup>
        )}
        {isNanny && myNanny && !activeNannies.some((n) => n.id === myNanny.id) && (
          <option value={`nanny:${myNanny.id}`}>{nannyDisplayName(myNanny)}</option>
        )}
      </select>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Parent, nanny, or another caregiver taking the child to this event.
      </p>
    </fieldset>
  )
}
