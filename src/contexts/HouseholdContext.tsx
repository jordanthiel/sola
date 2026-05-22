import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMyHouseholds } from '@/lib/household-membership'
import type { Household, HouseholdMember, MemberRole } from '@/types/database'
import { isNannyAccount } from '@/types/account'

const STORAGE_KEY = 'nanny_active_household'

interface HouseholdContextValue {
  households: Household[]
  membership: HouseholdMember | null
  activeHousehold: Household | null
  role: MemberRole | null
  isParent: boolean
  isNanny: boolean
  loading: boolean
  hasHouseholdAccess: boolean
  setActiveHouseholdId: (id: string) => void
  refreshHouseholds: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, accountKind, sessionContext } = useAuth()
  const [households, setHouseholds] = useState<Household[]>([])
  const [memberships, setMemberships] = useState<HouseholdMember[]>([])
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  )
  const [loading, setLoading] = useState(true)

  const refreshHouseholds = useCallback(async () => {
    if (!user) {
      setHouseholds([])
      setMemberships([])
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { households: hh, memberships: memberRows } = await fetchMyHouseholds(user.id)
      setHouseholds(hh)
      setMemberships(memberRows)

      const validIds = new Set(hh.map((h) => h.id))
      const sessionHouseholdId = sessionContext?.household_id ?? null

      setActiveId((prev) => {
        if (prev && validIds.has(prev)) return prev
        if (sessionHouseholdId && validIds.has(sessionHouseholdId)) return sessionHouseholdId
        const next = hh[0]?.id ?? sessionHouseholdId ?? null
        if (next) localStorage.setItem(STORAGE_KEY, next)
        else localStorage.removeItem(STORAGE_KEY)
        return next
      })
    } catch (err) {
      console.warn('Failed to load households:', err)
      setHouseholds([])
      setMemberships([])
    } finally {
      setLoading(false)
    }
  }, [user, sessionContext?.household_id])

  useEffect(() => {
    void refreshHouseholds()
  }, [refreshHouseholds])

  const setActiveHouseholdId = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const activeHousehold = households.find((h) => h.id === activeId) ?? households[0] ?? null
  const membership =
    memberships.find((m) => m.household_id === (activeHousehold?.id ?? activeId)) ??
    memberships[0] ??
    null

  const roleFromSession = sessionContext?.member_role ?? null
  const role = membership?.role ?? roleFromSession
  const isParent = role === 'owner' || role === 'parent'
  const isNanny = isNannyAccount(accountKind) || role === 'nanny'
  const hasHouseholdAccess =
    households.length > 0 ||
    memberships.length > 0 ||
    sessionContext?.has_household_access === true

  const value = useMemo(
    () => ({
      households,
      membership,
      activeHousehold,
      role,
      isParent,
      isNanny,
      loading,
      hasHouseholdAccess,
      setActiveHouseholdId,
      refreshHouseholds,
    }),
    [
      households,
      membership,
      activeHousehold,
      role,
      isParent,
      isNanny,
      loading,
      hasHouseholdAccess,
      setActiveHouseholdId,
      refreshHouseholds,
    ],
  )

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
  return ctx
}
