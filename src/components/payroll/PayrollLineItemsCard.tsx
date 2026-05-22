import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { usePayrollLineItems } from '@/hooks/useExtendedFeatures'
import type { PayrollLineItemType } from '@/types/features'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { selectCn } from '@/lib/utils'

export function PayrollLineItemsCard({
  householdNannyId,
  periodStart,
  disabled,
}: {
  householdNannyId: string
  periodStart: string
  disabled?: boolean
}) {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const { data: items } = usePayrollLineItems(householdNannyId, periodStart)
  const qc = useQueryClient()

  const [itemType, setItemType] = useState<PayrollLineItemType>('bonus')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [miles, setMiles] = useState('')
  const [ratePerMile, setRatePerMile] = useState('0.67')

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payroll_line_items').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: householdNannyId,
        pay_period_start: periodStart,
        item_type: itemType,
        amount_cents:
          itemType === 'mileage' ? 0 : Math.round(parseFloat(amount) * 100),
        description: description || null,
        miles: itemType === 'mileage' ? parseFloat(miles) : null,
        rate_per_mile_cents:
          itemType === 'mileage' ? Math.round(parseFloat(ratePerMile) * 100) : null,
        created_by: user!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll_line_items'] })
      setAmount('')
      setDescription('')
      setMiles('')
      toast.success('Line item added')
    },
    onError: () => toast.error('Failed to add'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payroll_line_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll_line_items'] }),
  })

  function itemAmount(li: { item_type: string; amount_cents: number; miles?: number | null; rate_per_mile_cents?: number | null }) {
    if (li.item_type === 'mileage' && li.miles && li.rate_per_mile_cents) {
      return Math.round(Number(li.miles) * li.rate_per_mile_cents)
    }
    return li.amount_cents
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bonuses & reimbursements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items?.length ? (
          <ul className="divide-y text-sm">
            {items.map((li) => (
              <li key={li.id} className="flex justify-between py-2">
                <span>
                  {li.item_type}: {li.description ?? '—'}
                  {li.item_type === 'mileage' && li.miles
                    ? ` (${li.miles} mi)`
                    : ''}
                </span>
                <span className="flex items-center gap-2">
                  {formatCurrency(itemAmount(li))}
                  {!disabled && (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(li.id)}>
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">No line items this period.</p>
        )}

        {!disabled && (
          <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className={selectCn}
                value={itemType}
                onChange={(e) => setItemType(e.target.value as PayrollLineItemType)}
              >
                <option value="bonus">Bonus</option>
                <option value="mileage">Mileage</option>
                <option value="reimbursement">Reimbursement</option>
              </select>
            </div>
            {itemType === 'mileage' ? (
              <>
                <div className="space-y-2">
                  <Label>Miles</Label>
                  <Input type="number" step="0.1" value={miles} onChange={(e) => setMiles(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Rate per mile ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={ratePerMile}
                    onChange={(e) => setRatePerMile(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button
              onClick={() => add.mutate()}
              disabled={
                add.isPending ||
                (itemType === 'mileage' ? !miles : !amount)
              }
            >
              Add line item
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
