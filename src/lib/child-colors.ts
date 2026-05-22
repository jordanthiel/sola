export const CHILD_COLOR_KEYS = [
  'blue',
  'green',
  'orange',
  'purple',
  'rose',
  'teal',
  'amber',
  'indigo',
] as const

export type ChildColorKey = (typeof CHILD_COLOR_KEYS)[number]

/** Defaults for new children — blue is omitted (nanny shifts use blue on the calendar). */
export const DEFAULT_CHILD_COLOR_KEYS = [
  'green',
  'orange',
  'purple',
  'rose',
  'teal',
  'amber',
  'indigo',
] as const satisfies readonly ChildColorKey[]

export const CHILD_COLOR_LABELS: Record<ChildColorKey, string> = {
  blue: 'Blue (same as nanny shifts)',
  green: 'Green',
  orange: 'Orange',
  purple: 'Purple',
  rose: 'Rose',
  teal: 'Teal',
  amber: 'Amber',
  indigo: 'Indigo',
}

export function pickDefaultChildColorKey(usedKeys: Iterable<string>): ChildColorKey {
  const used = new Set(
    [...usedKeys].filter((k): k is ChildColorKey => isChildColorKey(k) && k !== 'blue'),
  )
  for (const key of DEFAULT_CHILD_COLOR_KEYS) {
    if (!used.has(key)) return key
  }
  const n = used.size
  return DEFAULT_CHILD_COLOR_KEYS[n % DEFAULT_CHILD_COLOR_KEYS.length]!
}

export type ChildColorClasses = { bg: string; border: string; text: string }

export const CHILD_EVENT_COLORS: Record<ChildColorKey, ChildColorClasses> = {
  blue: {
    bg: 'bg-[#e8f0fe]',
    border: 'border-[#1a73e8]',
    text: 'text-[#174ea6]',
  },
  green: {
    bg: 'bg-[#e6f4ea]',
    border: 'border-[#34a853]',
    text: 'text-[#137333]',
  },
  orange: {
    bg: 'bg-[#fef7e0]',
    border: 'border-[#f9ab00]',
    text: 'text-[#b06000]',
  },
  purple: {
    bg: 'bg-[#f3e8fd]',
    border: 'border-[#9334e6]',
    text: 'text-[#7627bb]',
  },
  rose: {
    bg: 'bg-[#fce8e6]',
    border: 'border-[#d93025]',
    text: 'text-[#c5221f]',
  },
  teal: {
    bg: 'bg-[#e0f7fa]',
    border: 'border-[#00897b]',
    text: 'text-[#00695c]',
  },
  amber: {
    bg: 'bg-[#fff8e1]',
    border: 'border-[#f4b400]',
    text: 'text-[#e37400]',
  },
  indigo: {
    bg: 'bg-[#e8eaf6]',
    border: 'border-[#3f51b5]',
    text: 'text-[#283593]',
  },
}

export function isChildColorKey(value: string | null | undefined): value is ChildColorKey {
  return !!value && (CHILD_COLOR_KEYS as readonly string[]).includes(value)
}

export function childColorClasses(colorKey: ChildColorKey | null | undefined): ChildColorClasses {
  if (colorKey && isChildColorKey(colorKey)) {
    return CHILD_EVENT_COLORS[colorKey]
  }
  return CHILD_EVENT_COLORS.green
}
