import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { usePtoBalances } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import { invalidateTimeOffQueries } from '@/lib/invalidate-time-off'
import { formatPtoHours } from '@/lib/pto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function BalanceRow({ label, accrued, used }: { label: string; accrued: number; used: number }) {
  const remaining = accrued - used
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">{label}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[var(--color-muted-foreground)]">Allocated</dt>
          <dd className="font-medium">{formatPtoHours(accrued)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-foreground)]">Used</dt>
          <dd className="font-medium">{formatPtoHours(used)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-foreground)]">Remaining</dt>
          <dd className="font-medium">{formatPtoHours(remaining)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function NannyPtoSettings({ householdNannyId }: { householdNannyId: string }) {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const { data: balances, isLoading } = usePtoBalances()
  const balance = balances?.find((b) => b.household_nanny_id === householdNannyId)

  const [error, setError] = useState('')
  const [sickAllocation, setSickAllocation] = useState('')
  const [ptoAllocation, setPtoAllocation] = useState('')
  const [addSickHours, setAddSickHours] = useState('')
  const [addPtoHours, setAddPtoHours] = useState('')

  const sickAccrued = balance?.sick_hours_accrued ?? 0
  const ptoAccrued = balance?.pto_hours_accrued ?? 0
  const sickUsed = balance?.sick_hours_used ?? 0
  const ptoUsed = balance?.pto_hours_used ?? 0

  const saveBalance = useMutation({
    mutationFn: async (patch: {
      sick_hours_accrued?: number
      pto_hours_accrued?: number
    }) => {
      if (balance) {
        const { error: updateError } = await supabase
          .from('pto_balances')
          .update(patch)
          .eq('id', balance.id)
        if (updateError) throw updateError
        return
      }
      const { error: insertError } = await supabase.from('pto_balances').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: householdNannyId,
        sick_hours_accrued: patch.sick_hours_accrued ?? 0,
        pto_hours_accrued: patch.pto_hours_accrued ?? 0,
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setError('')
      void invalidateTimeOffQueries(qc)
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const setAllocations = () => {
    if (!sickAllocation && !ptoAllocation) {
      setError('Enter at least one allocation value.')
      return
    }
    const patch: { sick_hours_accrued?: number; pto_hours_accrued?: number } = {}
    if (sickAllocation) {
      const sick = parseFloat(sickAllocation)
      if (Number.isNaN(sick) || sick < 0) {
        setError('Enter valid sick allocation hours (0 or greater).')
        return
      }
      patch.sick_hours_accrued = sick
    }
    if (ptoAllocation) {
      const pto = parseFloat(ptoAllocation)
      if (Number.isNaN(pto) || pto < 0) {
        setError('Enter valid PTO allocation hours (0 or greater).')
        return
      }
      patch.pto_hours_accrued = pto
    }
    saveBalance.mutate(patch)
    setSickAllocation('')
    setPtoAllocation('')
  }

  const addHours = (kind: 'sick' | 'pto') => {
    const raw = kind === 'sick' ? addSickHours : addPtoHours
    const hours = parseFloat(raw)
    if (Number.isNaN(hours) || hours <= 0) {
      setError('Enter a positive number of hours to add.')
      return
    }
    if (kind === 'sick') {
      saveBalance.mutate({ sick_hours_accrued: sickAccrued + hours })
      setAddSickHours('')
    } else {
      saveBalance.mutate({ pto_hours_accrued: ptoAccrued + hours })
      setAddPtoHours('')
    }
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading balances...</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Used hours update automatically when you approve sick or PTO requests on the Time off page.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <BalanceRow label="Sick leave" accrued={sickAccrued} used={sickUsed} />
        <BalanceRow label="PTO" accrued={ptoAccrued} used={ptoUsed} />
      </div>

      <div className="space-y-3 rounded-md bg-[var(--color-muted)]/40 p-3">
        <p className="text-sm font-medium">Set allocations</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Sets total allocated hours. Used hours stay as-is.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sick-alloc">Sick hours allocated</Label>
            <Input
              id="sick-alloc"
              type="number"
              min="0"
              step="0.5"
              placeholder={String(sickAccrued)}
              value={sickAllocation}
              onChange={(e) => setSickAllocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pto-alloc">PTO hours allocated</Label>
            <Input
              id="pto-alloc"
              type="number"
              min="0"
              step="0.5"
              placeholder={String(ptoAccrued)}
              value={ptoAllocation}
              onChange={(e) => setPtoAllocation(e.target.value)}
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!sickAllocation && !ptoAllocation}
          onClick={setAllocations}
        >
          Save allocations
        </Button>
      </div>

      <div className="space-y-3 rounded-md bg-[var(--color-muted)]/40 p-3">
        <p className="text-sm font-medium">Add hours</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Increases allocated hours (rollover, mid-year grant, etc.). Remaining sick:{' '}
          {formatPtoHours(sickAccrued - sickUsed)} · Remaining PTO:{' '}
          {formatPtoHours(ptoAccrued - ptoUsed)}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="add-sick">Add sick hours</Label>
            <Input
              id="add-sick"
              type="number"
              min="0.5"
              step="0.5"
              className="w-28"
              value={addSickHours}
              onChange={(e) => setAddSickHours(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" disabled={!addSickHours} onClick={() => addHours('sick')}>
            Add sick
          </Button>
          <div className="space-y-2">
            <Label htmlFor="add-pto">Add PTO hours</Label>
            <Input
              id="add-pto"
              type="number"
              min="0.5"
              step="0.5"
              className="w-28"
              value={addPtoHours}
              onChange={(e) => setAddPtoHours(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={!addPtoHours} onClick={() => addHours('pto')}>
            Add PTO
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
