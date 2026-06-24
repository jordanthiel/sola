import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, X } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useNannies } from '@/hooks/useHouseholdData'
import { isNannyActive, nannyDisplayName } from '@/lib/nanny'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function NannyPreviewBanner() {
  const navigate = useNavigate()
  const { isNannyPreview, nannyPreviewId, setNannyPreviewId } = useHousehold()
  const { data: nannies } = useNannies()

  const previewNanny = useMemo(
    () => nannies?.find((n) => n.id === nannyPreviewId) ?? null,
    [nannies, nannyPreviewId],
  )

  if (!isNannyPreview) return null

  function exitPreview() {
    setNannyPreviewId(null)
    navigate('/settings')
  }

  return (
    <div className="border-b border-sky-200/80 bg-sky-50 px-4 py-3 text-sm text-sky-950 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          Viewing as <strong>{previewNanny ? nannyDisplayName(previewNanny) : 'your nanny'}</strong> —
          you are seeing the nanny dashboard and navigation.
        </p>
        <Button variant="outline" size="sm" className="shrink-0 bg-white" onClick={exitPreview}>
          <X className="mr-1.5 h-4 w-4" />
          Exit nanny view
        </Button>
      </div>
    </div>
  )
}

export function NannyPreviewSwitcher({ compact }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { isFamilyManager, isNannyPreview, setNannyPreviewId } = useHousehold()
  const { data: nannies } = useNannies()

  const activeNannies = useMemo(
    () => (nannies ?? []).filter((n) => isNannyActive(n)),
    [nannies],
  )

  if (!isFamilyManager || isNannyPreview || activeNannies.length === 0) return null

  function startPreview(id: string) {
    setNannyPreviewId(id)
    navigate('/')
  }

  if (activeNannies.length === 1) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={compact ? 'w-full justify-start text-xs' : 'w-full justify-start'}
        onClick={() => startPreview(activeNannies[0]!.id)}
      >
        <Eye className="mr-2 h-4 w-4" />
        View as nanny
      </Button>
    )
  }

  return (
    <Select onValueChange={(id) => startPreview(id)}>
      <SelectTrigger className={compact ? 'h-8 w-full text-xs' : 'w-full'}>
        <SelectValue placeholder="View as nanny…" />
      </SelectTrigger>
      <SelectContent>
        {activeNannies.map((n) => (
          <SelectItem key={n.id} value={n.id}>
            {nannyDisplayName(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function useStartNannyPreview() {
  const navigate = useNavigate()
  const { setNannyPreviewId } = useHousehold()

  return (nannyId: string) => {
    setNannyPreviewId(nannyId)
    navigate('/')
  }
}
