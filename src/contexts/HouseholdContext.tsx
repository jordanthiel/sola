import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Household, HouseholdMember, MemberRole } from '@/types/database'

const STORAGE_KEY = 'nanny_active_household'

interface HouseholdContextValue {
  households: Household[]
  membership: HouseholdMember | null
  activeHousehold: Household | null
  role: MemberRole | null
  isParent: boolean
  isNanny: boolean
  loading: boolean
  setActiveHouseholdId: (id: string) => void
  refreshHouseholds: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
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

    const { data: members } = await supabase
      .from('household_members')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (!members?.length) {
      setHouseholds([])
      setMemberships([])
      setLoading(false)
      return
    }

    const ids = members.map((m) => m.household_id)
    const { data: hh } = await supabase.from('households').select('*').in('id', ids)

    setMemberships(members)
    setHouseholds(hh ?? [])

    const validIds = new Set((hh ?? []).map((h) => h.id))
    setActiveId((prev) => {
      if (prev && validIds.has(prev)) {
        return prev
      }
      const next = hh?.[0]?.id ?? null
      if (next) {
        localStorage.setItem(STORAGE_KEY, next)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
      return next
    })

    setLoading(false)
  }, [user])

  useEffect(() => {
    setLoading(true)
    refreshHouseholds()
  }, [refreshHouseholds])

  const setActiveHouseholdId = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const activeHousehold = households.find((h) => h.id === activeId) ?? households[0] ?? null
  const membership =
    memberships.find((m) => m.household_id === (activeHousehold?.id ?? activeId)) ?? null
  const role = membership?.role ?? null
  const isParent = role === 'owner' || role === 'parent'
  const isNanny = role === 'nanny'

  const value = useMemo(
    () => ({
      households,
      membership,
      activeHousehold,
      role,
      isParent,
      isNanny,
      loading,
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
