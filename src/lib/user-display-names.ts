import { nannyDisplayName } from '@/lib/nanny'
import type { HouseholdNanny } from '@/types/household-nanny'

/** Names embedded in feed text as @[Name](userId). */
export function mentionNamesFromText(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of text.matchAll(/@\[([^\]]+)\]\(([a-f0-9-]{36})\)/g)) {
    const name = m[1]?.trim()
    if (name) map[m[2]] = name
  }
  return map
}

export function nannyNamesByUserId(
  nannies: Pick<HouseholdNanny, 'user_id' | 'first_name' | 'last_name'>[],
): Record<string, Pick<HouseholdNanny, 'first_name' | 'last_name'>> {
  return Object.fromEntries(
    nannies
      .filter((n): n is HouseholdNanny & { user_id: string } => !!n.user_id)
      .map((n) => [n.user_id, n]),
  )
}

export function resolveUserDisplayName(
  userId: string,
  sources: {
    profileMap?: Record<string, { display_name: string | null } | null | undefined>
    nannyByUserId?: Record<string, Pick<HouseholdNanny, 'first_name' | 'last_name'>>
    mentionNames?: Record<string, string>
  },
): string | null {
  const fromProfile = sources.profileMap?.[userId]?.display_name?.trim()
  if (fromProfile) return fromProfile

  const fromMention = sources.mentionNames?.[userId]?.trim()
  if (fromMention) return fromMention

  const nanny = sources.nannyByUserId?.[userId]
  if (nanny) return nannyDisplayName(nanny)

  return null
}
