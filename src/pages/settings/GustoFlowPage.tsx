import { useCallback, useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useGustoStatus } from '@/hooks/useGusto'
import { GustoFlowEmbed } from '@/components/gusto/GustoFlowEmbed'
import { PageHeader } from '@/components/layout/PageHeader'
import { parseGustoFlowSearchParams } from '@/lib/gusto-flows'
import { Button } from '@/components/ui/button'

export function GustoFlowPage() {
  const [searchParams] = useSearchParams()
  const { activeHousehold, isParent } = useHousehold()
  const { data: status, isPending, isFetching } = useGustoStatus()
  const qc = useQueryClient()

  const flowParams = useMemo(() => parseGustoFlowSearchParams(searchParams), [searchParams])

  const onFlowComplete = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['gusto-status'] })
    qc.invalidateQueries({ queryKey: ['gusto-company'] })
  }, [qc])

  if (!isParent) {
    return <Navigate to="/" replace />
  }

  if (!flowParams) {
    return <Navigate to="/settings" replace />
  }

  if (!activeHousehold) {
    return null
  }

  if (!status && isPending) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading Gusto setup…</p>
  }

  if (!status) {
    return <Navigate to="/settings" replace />
  }

  if (!status.configured || !status.company?.terms_accepted_at) {
    return <Navigate to="/settings" replace />
  }

  const returnLabel =
    flowParams.returnTo === '/payroll'
      ? 'Payroll'
      : flowParams.returnTo === '/settings'
        ? 'Settings'
        : 'Back'

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-6">
      <PageHeader
        title={flowParams.title}
        subtitle="Complete this section in Gusto. Your progress is saved as you go."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to={flowParams.returnTo}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {returnLabel}
            </Link>
          </Button>
        }
      />

      {isFetching && (
        <p className="text-xs text-[var(--color-muted-foreground)]">Refreshing payroll status…</p>
      )}

      <GustoFlowEmbed
        householdId={activeHousehold.id}
        gustoEnv={status.gustoEnv}
        flowType={flowParams.flowType}
        title={flowParams.title}
        entityType={flowParams.entityType}
        entityUuid={flowParams.entityUuid}
        onFlowComplete={onFlowComplete}
      />
    </div>
  )
}
