export function householdMemberDisplayName(
  member: {
    user_id: string
    profiles: { display_name: string | null } | null
  },
  options?: { currentUserId?: string; currentUserEmail?: string | null },
): string {
  const name = member.profiles?.display_name?.trim()
  if (name) return name

  if (options?.currentUserId === member.user_id) {
    const email = options.currentUserEmail?.trim()
    if (email) return email.split('@')[0]
    return 'You'
  }

  return 'Member'
}
