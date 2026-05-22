import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  FEDERAL_HOLIDAY_DEFINITIONS,
  type FederalHolidayKey,
} from '@/lib/federal-holidays'
import { resolveHolidayEnabled } from '@/lib/holiday-settings'
import { formatSupabaseError } from '@/lib/errors'
import { useHouseholdHolidays, useSetHouseholdHoliday } from '@/hooks/useHouseholdHolidays'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function HouseholdHolidaySettings() {
  const { data: overrides, isLoading } = useHouseholdHolidays()
  const setHoliday = useSetHouseholdHoliday()

  const enabledByKey = useMemo(() => {
    const rows = overrides ?? []
    return Object.fromEntries(
      FEDERAL_HOLIDAY_DEFINITIONS.map((def) => [
        def.key,
        resolveHolidayEnabled(def.key, rows),
      ]),
    ) as Record<FederalHolidayKey, boolean>
  }, [overrides])

  async function toggle(key: FederalHolidayKey, next: boolean) {
    try {
      await setHoliday.mutateAsync({ holidayKey: key, enabled: next })
    } catch (err) {
      toast.error(formatSupabaseError(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Nanny holidays</CardTitle>
        <CardDescription>
          Choose which U.S. federal holidays your nanny has off. Enabled holidays appear on the{' '}
          <Link to="/schedule" className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline">
            schedule
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Loading...</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {FEDERAL_HOLIDAY_DEFINITIONS.map((def) => {
              const enabled = enabledByKey[def.key]
              const busy = setHoliday.isPending && setHoliday.variables?.holidayKey === def.key
              return (
                <li
                  key={def.key}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <Label htmlFor={`holiday-${def.key}`} className="font-medium">
                      {def.name}
                    </Label>
                    <p className="text-sm text-[var(--color-muted-foreground)]">{def.rule}</p>
                  </div>
                  <button
                    id={`holiday-${def.key}`}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={busy}
                    onClick={() => void toggle(def.key, !enabled)}
                    className={cn(
                      'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                      enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted)]',
                      busy && 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
                        enabled && 'translate-x-5',
                      )}
                    />
                    <span className="sr-only">{enabled ? 'On' : 'Off'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
          All federal holidays are on by default until you turn one off.
        </p>
      </CardContent>
    </Card>
  )
}
