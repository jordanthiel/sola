import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, selectCn } from '@/lib/utils'

export type ChildOption = { id: string; name: string }

function selectionLabel(children: ChildOption[], selectedIds: string[]): string {
  if (!children.length) return 'No children in household'
  if (selectedIds.length === 0) return 'Select children…'
  if (selectedIds.length === children.length) return 'All children'
  if (selectedIds.length === 1) {
    return children.find((c) => c.id === selectedIds[0])?.name ?? '1 child'
  }
  const names = children
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => c.name)
  if (names.join(', ').length <= 40) return names.join(', ')
  return `${selectedIds.length} children`
}

export function ChildrenMultiSelect({
  id,
  children: childOptions,
  value,
  onChange,
  disabled,
}: {
  id?: string
  children: ChildOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const allIds = childOptions.map((c) => c.id)
  const allSelected =
    childOptions.length > 0 && value.length === childOptions.length

  function toggleAll() {
    onChange(allSelected ? [] : allIds)
  }

  function toggleChild(childId: string) {
    if (value.includes(childId)) {
      onChange(value.filter((id) => id !== childId))
    } else {
      onChange([...value, childId])
    }
  }

  const label = selectionLabel(childOptions, value)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled || childOptions.length === 0}
          className={cn(
            selectCn,
            'items-center justify-between gap-2 text-left font-normal',
            value.length === 0 && 'text-[var(--color-muted-foreground)]',
          )}
          aria-haspopup="listbox"
          aria-expanded={undefined}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent role="listbox" aria-multiselectable>
        <button
          type="button"
          role="option"
          aria-selected={allSelected}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--color-accent)]"
          onClick={toggleAll}
        >
          <SelectionMark checked={allSelected} />
          <span className="font-medium">All children</span>
        </button>
        {childOptions.length > 0 && (
          <div className="my-1 border-t border-[var(--color-border)]" aria-hidden />
        )}
        {childOptions.map((child) => {
          const checked = value.includes(child.id)
          return (
            <button
              key={child.id}
              type="button"
              role="option"
              aria-selected={checked}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--color-accent)]"
              onClick={() => toggleChild(child.id)}
            >
              <SelectionMark checked={checked} />
              <span>{child.name}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function SelectionMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border',
        checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'border-[var(--color-input)] bg-[var(--color-card)]',
      )}
      aria-hidden
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  )
}
