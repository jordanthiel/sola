import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronLeft, Eye } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useHouseholdNannies } from '@/hooks/useHouseholdData'
import { isNannyActive, nannyDisplayName } from '@/lib/nanny'
import { PageHeader } from '@/components/layout/PageHeader'
import { useStartNannyPreview } from '@/components/layout/NannyPreviewControls'
import { NannyProfileSection } from '@/components/settings/NannyProfileSection'
import { NannySettingsSection } from '@/components/settings/NannySettingsSection'
import { DeactivateNannySection } from '@/components/settings/DeactivateNannySection'
import { Button } from '@/components/ui/button'

export function NannyPage() {
  const { nannyId } = useParams<{ nannyId: string }>()
  const { isFamilyManager } = useHousehold()
  const startNannyPreview = useStartNannyPreview()
  const { data: nannies, isLoading } = useHouseholdNannies({ includeDeactivated: true })
  const nanny = nannies?.find((n) => n.id === nannyId)
  const active = nanny ? isNannyActive(nanny) : false

  if (!isFamilyManager) {
    return <Navigate to="/settings" replace />
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading...</p>
  }

  if (!nanny) {
    return <Navigate to="/settings" replace />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={nannyDisplayName(nanny)}
        subtitle={
          active
            ? 'Schedule, pay, time off, and profile'
            : 'Deactivated — historical records only'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {active && (
              <Button variant="default" size="sm" onClick={() => startNannyPreview(nanny.id)}>
                <Eye className="mr-1 h-4 w-4" />
                View as nanny
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        }
      />
      <NannyProfileSection nanny={nanny} />
      {active ? (
        <NannySettingsSection householdNannyId={nanny.id} nanny={nanny} />
      ) : (
        <>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Work settings cannot be edited while this nanny is deactivated.
          </p>
          <DeactivateNannySection nanny={nanny} />
        </>
      )}
    </div>
  )
}
