import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useChildren } from '@/hooks/useHouseholdData'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

export function ChildrenPage() {
  const { activeHousehold, isParent } = useHousehold()
  const { data: children, isLoading } = useChildren()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)

  const addChild = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('children').insert({
        household_id: activeHousehold!.id,
        name,
        date_of_birth: dob || null,
        notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children'] })
      setName('')
      setDob('')
      setNotes('')
      setShowForm(false)
    },
  })

  const removeChild = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('children').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['children'] }),
  })

  if (!isParent) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Children</h1>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <ul className="space-y-2">
            {children?.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-6">
                  <p className="font-medium">{c.name}</p>
                  {c.date_of_birth && (
                    <p className="text-sm text-[var(--color-muted-foreground)]">DOB: {c.date_of_birth}</p>
                  )}
                  {c.notes && <p className="mt-2 text-sm">{c.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Children</h1>
          <p className="text-[var(--color-muted-foreground)]">Kids in your household</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Add child'}</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New child</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Date of birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={() => addChild.mutate()} disabled={!name || addChild.isPending}>
              Save
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {children?.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-start justify-between pt-6">
                <div>
                  <p className="font-medium">{c.name}</p>
                  {c.date_of_birth && (
                    <p className="text-sm text-[var(--color-muted-foreground)]">DOB: {c.date_of_birth}</p>
                  )}
                  {c.notes && <p className="mt-2 text-sm">{c.notes}</p>}
                </div>
                <Button size="sm" variant="destructive" onClick={() => removeChild.mutate(c.id)}>
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
