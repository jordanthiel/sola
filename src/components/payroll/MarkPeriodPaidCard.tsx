import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { formatSupabaseError } from '@/lib/errors'
import { formatCurrency } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MarkPeriodPaidCard({
  payPeriodCloseId,
  defaultAmountCents,
  paidAt,
  paidAmountCents,
}: {
  payPeriodCloseId: string
  defaultAmountCents: number
  paidAt: string | null
  paidAmountCents: number | null
}) {
  const qc = useQueryClient()
  const [amountDollars, setAmountDollars] = useState(
    ((paidAmountCents ?? defaultAmountCents) / 100).toFixed(2),
  )

  const markPaid = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amountDollars) * 100)
      if (!Number.isFinite(cents) || cents < 0) throw new Error('Enter a valid payment amount')
      const { error } = await supabase
        .from('pay_period_closes')
        .update({
          paid_at: new Date().toISOString(),
          paid_amount_cents: cents,
        })
        .eq('id', payPeriodCloseId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Period marked as paid')
      void qc.invalidateQueries({ queryKey: ['pay_period_close'] })
      void qc.invalidateQueries({ queryKey: ['pay_period_closes'] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const clearPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('pay_period_closes')
        .update({ paid_at: null, paid_amount_cents: null })
        .eq('id', payPeriodCloseId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Payment status cleared')
      void qc.invalidateQueries({ queryKey: ['pay_period_close'] })
      void qc.invalidateQueries({ queryKey: ['pay_period_closes'] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Mark as paid</CardTitle>
        <CardDescription>
          Free tier: record that you paid this period outside Soola (Venmo, Zelle, check, cash, or your
          own bank transfer). This does not move money or file taxes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paidAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-[var(--color-muted)]/30 px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="font-medium">Paid {formatCurrency(paidAmountCents ?? 0)}</p>
                <p className="text-[var(--color-muted-foreground)]">
                  Recorded {new Date(paidAt).toLocaleString()}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearPaid.mutate()}
              disabled={clearPaid.isPending}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="paid-amount">Amount paid</Label>
              <Input
                id="paid-amount"
                type="number"
                min="0"
                step="0.01"
                className="w-40"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
              {markPaid.isPending ? 'Saving…' : 'Mark period paid'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
