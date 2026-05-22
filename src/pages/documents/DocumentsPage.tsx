import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useDocuments } from '@/hooks/useExtendedFeatures'
import type { DocumentCategory } from '@/types/features'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/PageHeader'
import { selectCn } from '@/lib/utils'

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'tax', label: 'Tax' },
  { value: 'handbook', label: 'Handbook' },
  { value: 'medical', label: 'Medical' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
]

export function DocumentsPage() {
  const { user } = useAuth()
  const { activeHousehold, isParent } = useHousehold()
  const { data: docs, isLoading } = useDocuments()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<DocumentCategory>('other')
  const [file, setFile] = useState<File | null>(null)

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !title.trim()) throw new Error('Title and file required')
      const path = `${activeHousehold!.id}/${crypto.randomUUID()}-${file.name}`
      const { error: upErr } = await supabase.storage
        .from('household-documents')
        .upload(path, file)
      if (upErr) throw upErr
      const { error } = await supabase.from('documents').insert({
        household_id: activeHousehold!.id,
        title: title.trim(),
        storage_path: path,
        category,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: user!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      setTitle('')
      setFile(null)
      toast.success('Document uploaded')
    },
    onError: () => toast.error('Upload failed'),
  })

  const remove = useMutation({
    mutationFn: async (doc: { id: string; storage_path: string }) => {
      await supabase.storage.from('household-documents').remove([doc.storage_path])
      const { error } = await supabase.from('documents').delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document removed')
    },
  })

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage
      .from('household-documents')
      .createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) {
      toast.error('Download failed')
      return
    }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = name
    a.click()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Contracts, tax forms, handbooks, and other household files"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upload document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                className={selectCn}
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>File</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={() => upload.mutate()} disabled={!file || !title || upload.isPending}>
            <Upload className="mr-2 h-4 w-4" />
            {upload.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Loading...</p>
      ) : !docs?.length ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No documents yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
                  {d.category}
                  {d.file_size ? ` · ${Math.round(d.file_size / 1024)} KB` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => download(d.storage_path, d.title)}>
                  <Download className="h-4 w-4" />
                </Button>
                {isParent && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove.mutate({ id: d.id, storage_path: d.storage_path })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
