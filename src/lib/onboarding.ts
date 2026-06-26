export const PRODUCT_TOUR_STORAGE_KEY = 'sova_show_product_tour'

export const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'child', label: 'Children' },
  { id: 'nanny', label: 'Nanny' },
  { id: 'schedule', label: 'Hours' },
  { id: 'events', label: 'Plans' },
  { id: 'tour', label: 'Tour' },
] as const

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id']

export function householdNeedsOnboarding(
  household: { onboarding_completed_at: string | null } | null | undefined,
): boolean {
  return !!household && household.onboarding_completed_at == null
}

export function startProductTour() {
  sessionStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, '1')
}

export function clearProductTour() {
  sessionStorage.removeItem(PRODUCT_TOUR_STORAGE_KEY)
}

export function shouldShowProductTour(): boolean {
  return sessionStorage.getItem(PRODUCT_TOUR_STORAGE_KEY) === '1'
}
