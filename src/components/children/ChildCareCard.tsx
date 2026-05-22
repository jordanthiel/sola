import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEmergencyContacts } from '@/hooks/useExtendedFeatures'
import type { ExtendedChild } from '@/types/features'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ChildCareCard({
  child,
  readOnly,
}: {
  child: ExtendedChild
  readOnly?: boolean
}) {
  const qc = useQueryClient()
  const { data: contacts } = useEmergencyContacts(child.id)
  const [allergies, setAllergies] = useState(child.allergies ?? '')
  const [medications, setMedications] = useState(child.medications ?? '')
  const [routines, setRoutines] = useState(child.routines ?? '')
  const [ecName, setEcName] = useState('')
  const [ecPhone, setEcPhone] = useState('')
  const [ecRel, setEcRel] = useState('')
  const [ecPickup, setEcPickup] = useState(false)

  const saveCare = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('children')
        .update({ allergies, medications, routines })
        .eq('id', child.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children'] })
      toast.success('Care sheet saved')
    },
    onError: () => toast.error('Failed to save'),
  })

  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('child_emergency_contacts').insert({
        child_id: child.id,
        name: ecName,
        phone: ecPhone || null,
        relationship: ecRel || null,
        is_authorized_pickup: ecPickup,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emergency_contacts', child.id] })
      setEcName('')
      setEcPhone('')
      setEcRel('')
      setEcPickup(false)
      toast.success('Contact added')
    },
    onError: () => toast.error('Failed to add contact'),
  })

  const removeContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('child_emergency_contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergency_contacts', child.id] }),
  })

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">{child.name} — care sheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Allergies</Label>
            {readOnly ? (
              <p className="text-sm whitespace-pre-wrap">{allergies || '—'}</p>
            ) : (
              <Textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} rows={3} />
            )}
          </div>
          <div className="space-y-2">
            <Label>Medications</Label>
            {readOnly ? (
              <p className="text-sm whitespace-pre-wrap">{medications || '—'}</p>
            ) : (
              <Textarea value={medications} onChange={(e) => setMedications(e.target.value)} rows={3} />
            )}
          </div>
          <div className="space-y-2">
            <Label>Daily routines</Label>
            {readOnly ? (
              <p className="text-sm whitespace-pre-wrap">{routines || '—'}</p>
            ) : (
              <Textarea value={routines} onChange={(e) => setRoutines(e.target.value)} rows={3} />
            )}
          </div>
        </div>
        {!readOnly && (
          <Button onClick={() => saveCare.mutate()} disabled={saveCare.isPending}>
            Save care sheet
          </Button>
        )}

        <div className="border-t pt-4">
          <p className="mb-3 text-sm font-medium">Emergency contacts</p>
          {contacts?.length ? (
            <ul className="mb-4 space-y-2">
              {contacts.map((c) => (
                <li key={c.id} className="flex justify-between text-sm">
                  <span>
                    {c.name}
                    {c.relationship ? ` (${c.relationship})` : ''} — {c.phone ?? 'no phone'}
                    {c.is_authorized_pickup && ' · Authorized pickup'}
                  </span>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => removeContact.mutate(c.id)}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">No contacts yet.</p>
          )}
          {!readOnly && (
            <div className="grid gap-2 md:grid-cols-4">
              <Input placeholder="Name" value={ecName} onChange={(e) => setEcName(e.target.value)} />
              <Input placeholder="Phone" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} />
              <Input
                placeholder="Relationship"
                value={ecRel}
                onChange={(e) => setEcRel(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={ecPickup}
                    onChange={(e) => setEcPickup(e.target.checked)}
                  />
                  Pickup OK
                </label>
                <Button
                  size="sm"
                  onClick={() => addContact.mutate()}
                  disabled={!ecName || addContact.isPending}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
