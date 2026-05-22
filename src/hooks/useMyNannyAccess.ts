import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyHouseholdNanny } from '@/hooks/useHouseholdData'
import { isNannyActive } from '@/lib/nanny'

/** Active vs deactivated nanny profile for the current household. */
export function useMyNannyAccess() {
  const { isNanny } = useHousehold()
  const { data: myNanny, isFetched, isLoading } = useMyHouseholdNanny()
  const isDeactivated = isNanny && !!myNanny && !isNannyActive(myNanny)
  const isActiveNanny = isNanny && !!myNanny && isNannyActive(myNanny)

  return {
    myNanny,
    isDeactivated,
    isActiveNanny,
    isLoading: isNanny && (isLoading || !isFetched),
  }
}
