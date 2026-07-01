type AutoSaveStatusProps = {
  isPending?: boolean
  isError?: boolean
}

export function AutoSaveStatus({ isPending, isError }: AutoSaveStatusProps) {
  if (isPending) {
    return <p className="text-xs text-[var(--color-muted-foreground)]">Saving…</p>
  }
  if (isError) {
    return <p className="text-xs text-red-600">Couldn&apos;t save — try again</p>
  }
  return null
}
