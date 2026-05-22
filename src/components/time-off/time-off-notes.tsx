export function TimeOffRequestNotes({ notes }: { notes: string | null }) {
  if (!notes?.trim()) return null
  return <p className="text-sm text-[var(--color-muted-foreground)]">{notes}</p>
}

export function TimeOffReviewNotesDisplay({ notes }: { notes: string | null }) {
  if (!notes?.trim()) return null
  return (
    <p className="text-sm text-[var(--color-muted-foreground)]">
      <span className="font-medium text-[var(--color-foreground)]">Decision note:</span> {notes}
    </p>
  )
}
