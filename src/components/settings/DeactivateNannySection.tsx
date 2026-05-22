import { useState } from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { isNannyActive, nannyDisplayName } from '@/lib/nanny'
import type { HouseholdNanny } from '@/types/household-nanny'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingsSubsection } from '@/components/settings/SettingsSubsection'

function DeactivateNannyDialog({
  nanny,
  open,
  onOpenChange,
}: {
  nanny: HouseholdNanny
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const deactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('deactivate_household_nanny', {
        p_household_nanny_id: nanny.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      onOpenChange(false)
      await qc.invalidateQueries({ queryKey: ['household_nannies'] })
      toast.success(`${nannyDisplayName(nanny)} was deactivated`)
      navigate('/settings')
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {nannyDisplayName(nanny)}?</DialogTitle>
          <DialogDescription>
            They will immediately lose access to this household in the app. They will no longer appear in payroll or
            schedule pickers. You can still view their history on this page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deactivate.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => deactivate.mutate()} disabled={deactivate.isPending}>
            {deactivate.isPending ? 'Deactivating...' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Last subsection inside Work settings — same rhythm as schedule, pay, PTO. */
export function DeactivateNannySubsection({ nanny }: { nanny: HouseholdNanny }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <SettingsSubsection
        title="Remove from household"
        description="Stops app access and payroll for this nanny. Schedules, pay records, and documents stay in your history."
      >
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Deactivate nanny
        </Button>
      </SettingsSubsection>
      <DeactivateNannyDialog nanny={nanny} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Standalone card when the nanny is already deactivated (no work settings card). */
export function DeactivateNannySection({ nanny }: { nanny: HouseholdNanny }) {
  if (isNannyActive(nanny)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Household access</CardTitle>
        <CardDescription>Platform and payroll status</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Deactivated
          {nanny.deactivated_at && ` on ${format(new Date(nanny.deactivated_at), 'MMM d, yyyy')}`}. They can no longer
          view the schedule or family areas, but can still sign in to review historical pay periods and download exports.
          Past schedules and pay records remain on this page for parents.
        </p>
      </CardContent>
    </Card>
  )
}
