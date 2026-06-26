import { useCallback, useMemo, useState } from 'react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useChildActivities, useNannies } from '@/hooks/useHouseholdData'
import { useDocuments, useFeedPosts } from '@/hooks/useExtendedFeatures'
import {
  dismissGettingStartedTask,
  getDismissedGettingStartedTasks,
  visibleGettingStartedTasks,
  type GettingStartedTask,
  type GettingStartedTaskId,
} from '@/lib/getting-started-tasks'

export function useGettingStartedTasks() {
  const { activeHousehold, isParent } = useHousehold()
  const { data: nannies } = useNannies()
  const { data: activities } = useChildActivities()
  const { data: posts } = useFeedPosts()
  const { data: documents } = useDocuments()

  const householdId = activeHousehold?.id
  const onboardingComplete = !!activeHousehold?.onboarding_completed_at

  const [dismissedRevision, setDismissedRevision] = useState(0)

  const dismissed = useMemo((): Set<GettingStartedTaskId> => {
    void dismissedRevision
    return householdId ? getDismissedGettingStartedTasks(householdId) : new Set()
  }, [householdId, dismissedRevision])

  const tasks: GettingStartedTask[] = useMemo(() => {
    if (!householdId || !isParent || !onboardingComplete) return []

    return visibleGettingStartedTasks(
      {
        householdId,
        primaryNanny: nannies?.[0] ?? null,
        activityCount: activities?.length ?? 0,
        feedPostCount: posts?.length ?? 0,
        documentCount: documents?.length ?? 0,
      },
      dismissed,
    )
  }, [
    householdId,
    isParent,
    onboardingComplete,
    nannies,
    activities?.length,
    posts?.length,
    documents?.length,
    dismissed,
  ])

  const dismiss = useCallback(
    (taskId: GettingStartedTask['id']) => {
      if (!householdId) return
      dismissGettingStartedTask(householdId, taskId)
      setDismissedRevision((n) => n + 1)
    },
    [householdId],
  )

  return {
    tasks,
    dismiss,
    showCard: tasks.length > 0,
  }
}
