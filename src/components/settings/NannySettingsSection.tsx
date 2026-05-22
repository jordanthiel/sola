import { DefaultScheduleEditor } from '@/components/settings/DefaultScheduleEditor'
import { DeactivateNannySubsection } from '@/components/settings/DeactivateNannySection'
import { NannyEmploymentSettings } from '@/components/settings/NannyEmploymentSettings'
import { NannyPtoSettings } from '@/components/settings/NannyPtoSettings'
import { SettingsSubsection } from '@/components/settings/SettingsSubsection'
import { isNannyActive } from '@/lib/nanny'
import type { HouseholdNanny } from '@/types/household-nanny'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function NannySettingsSection({
  householdNannyId,
  nanny,
}: {
  householdNannyId: string
  nanny: HouseholdNanny
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Work settings</CardTitle>
        <CardDescription>Default schedule, pay, and time off</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SettingsSubsection
          title="Default schedule"
          description="Recurring weekly days and hours. Override individual days on the schedule page."
        >
          <DefaultScheduleEditor householdNannyId={householdNannyId} />
        </SettingsSubsection>

        <SettingsSubsection
          title="Pay & employment"
          description="Hourly rate, overtime rules, and pay period."
        >
          <NannyEmploymentSettings householdNannyId={householdNannyId} />
        </SettingsSubsection>

        <SettingsSubsection
          title="Time off"
          description="Sick leave and PTO allocations."
        >
          <NannyPtoSettings householdNannyId={householdNannyId} />
        </SettingsSubsection>

        {isNannyActive(nanny) && <DeactivateNannySubsection nanny={nanny} />}
      </CardContent>
    </Card>
  )
}
