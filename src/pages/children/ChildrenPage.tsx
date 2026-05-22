import { useState } from 'react'
import { format, parseISO, subYears } from 'date-fns'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useExtendedChildren } from '@/hooks/useExtendedFeatures'
import { pickDefaultChildColorKey, type ChildColorKey } from '@/lib/child-colors'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChildCareCard } from '@/components/children/ChildCareCard'
import { ChildColorDot } from '@/components/children/ChildColorDot'
import { ChildColorPicker } from '@/components/children/ChildColorPicker'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
export function ChildrenPage() {
  const { activeHousehold, isParent } = useHousehold()
  const { data: children, isLoading } = useExtendedChildren()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [notes, setNotes] = useState('')
  const [newChildColor, setNewChildColor] = useState<ChildColorKey>(() =>
    pickDefaultChildColorKey([]),
  )
  const [showForm, setShowForm] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const addChild = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('children').insert({
        household_id: activeHousehold!.id,
        name,
        date_of_birth: dob || null,
        notes: notes || null,
        color_key: newChildColor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children'] })
      setName('')
      setDob('')
      setNotes('')
      setNewChildColor(pickDefaultChildColorKey(children?.map((c) => c.color_key) ?? []))
      setShowForm(false)
      toast.success('Child added')
    },
    onError: () => toast.error('Failed to add child'),
  })

  const updateColor = useMutation({
    mutationFn: async ({ id, color_key }: { id: string; color_key: ChildColorKey }) => {
      const { error } = await supabase.from('children').update({ color_key }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children'] })
      toast.success('Color updated')
    },
    onError: () => toast.error('Failed to update color'),
  })

  const removeChild = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('children').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setConfirmRemoveId(null)
      qc.invalidateQueries({ queryKey: ['children'] })
      toast.success('Child removed')
    },
    onError: () => toast.error('Failed to remove child'),
  })

  function openAddForm() {
    setShowForm((open) => {
      if (!open) {
        setNewChildColor(pickDefaultChildColorKey(children?.map((c) => c.color_key) ?? []))
      }
      return !open
    })
  }

  function formatDob(dobVal: string) {
    try {
      return format(parseISO(dobVal + 'T12:00:00'), 'MMMM d, yyyy')
    } catch {
      return dobVal
    }
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading...</p>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Children"
        subtitle="Profiles, care sheets, allergies, and emergency contacts"
        action={
          isParent ? (
            <Button onClick={openAddForm}>{showForm ? 'Cancel' : 'Add child'}</Button>
          ) : undefined
        }
      />

      {isParent && showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New child</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <div className="flex items-center gap-2">
                <ChildColorPicker value={newChildColor} onChange={setNewChildColor} />
                <Input
                  className="flex-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date of birth</Label>
              <DatePicker
                value={dob}
                onChange={setDob}
                captionLayout="dropdown"
                reverseYears
                max={format(new Date(), 'yyyy-MM-dd')}
                min={format(subYears(new Date(), 25), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={() => addChild.mutate()} disabled={!name || addChild.isPending}>
              {addChild.isPending ? 'Saving...' : 'Save'}
            </Button>
          </CardContent>
        </Card>
      )}

      {!children?.length ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No children added yet.</p>
      ) : (
        <div className="space-y-4">
          {children.map((c) => (
            <div key={c.id}>
              <Card>
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {isParent ? (
                      <ChildColorPicker
                        value={c.color_key}
                        disabled={updateColor.isPending}
                        className="mt-1.5"
                        onChange={(color_key) => {
                          if (color_key !== c.color_key) {
                            updateColor.mutate({ id: c.id, color_key })
                          }
                        }}
                      />
                    ) : (
                      <ChildColorDot colorKey={c.color_key} className="mt-1.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      {c.date_of_birth && (
                        <p className="text-sm text-[var(--color-muted-foreground)]">
                          Born {formatDob(c.date_of_birth)}
                        </p>
                      )}
                      {c.notes && <p className="mt-2 text-sm">{c.notes}</p>}
                      {(c.allergies || c.medications || c.routines) && (
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          Care sheet on file
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      {expandedId === c.id ? 'Hide care sheet' : 'Care sheet'}
                    </Button>
                    {isParent &&
                      (confirmRemoveId === c.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeChild.mutate(c.id)}
                            disabled={removeChild.isPending}
                          >
                            Yes
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmRemoveId(null)}>
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setConfirmRemoveId(c.id)}>
                          Remove
                        </Button>
                      ))}
                  </div>
                </CardContent>
              </Card>
              {expandedId === c.id && (
                <div className="mt-2">
                  <ChildCareCard child={c} readOnly={!isParent} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
