import { getNannyInviteStatus, isNannyClaimed, nannyDisplayName } from '@/lib/nanny'
import type { HouseholdNanny } from '@/types/household-nanny'

export const GETTING_STARTED_TASK_IDS = [
  'invite_nanny',
  'create_event',
  'publish_message',
  'upload_agreement',
] as const

export type GettingStartedTaskId = (typeof GETTING_STARTED_TASK_IDS)[number]

const STORAGE_PREFIX = 'sova_getting_started_dismissed_'

export type GettingStartedTask = {
  id: GettingStartedTaskId
  title: string
  description: string
  to: string
}

export type GettingStartedContext = {
  householdId: string
  primaryNanny: HouseholdNanny | null
  activityCount: number
  feedPostCount: number
  documentCount: number
}

export function getDismissedGettingStartedTasks(householdId: string): Set<GettingStartedTaskId> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${householdId}`)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is GettingStartedTaskId => isGettingStartedTaskId(id)))
  } catch {
    return new Set()
  }
}

export function dismissGettingStartedTask(householdId: string, taskId: GettingStartedTaskId) {
  const dismissed = getDismissedGettingStartedTasks(householdId)
  dismissed.add(taskId)
  localStorage.setItem(`${STORAGE_PREFIX}${householdId}`, JSON.stringify([...dismissed]))
}

function isGettingStartedTaskId(value: unknown): value is GettingStartedTaskId {
  return typeof value === 'string' && GETTING_STARTED_TASK_IDS.includes(value as GettingStartedTaskId)
}

export function isGettingStartedTaskComplete(
  taskId: GettingStartedTaskId,
  ctx: GettingStartedContext,
): boolean {
  switch (taskId) {
    case 'invite_nanny': {
      const nanny = ctx.primaryNanny
      if (!nanny) return false
      if (isNannyClaimed(nanny)) return true
      return getNannyInviteStatus(nanny) === 'pending'
    }
    case 'create_event':
      return ctx.activityCount > 0
    case 'publish_message':
      return ctx.feedPostCount > 0
    case 'upload_agreement':
      return ctx.documentCount > 0
  }
}

export function buildGettingStartedTasks(ctx: GettingStartedContext): GettingStartedTask[] {
  const nannyName = ctx.primaryNanny ? nannyDisplayName(ctx.primaryNanny) : 'your nanny'
  const nannyId = ctx.primaryNanny?.id

  const defs: Omit<GettingStartedTask, 'id'>[] = [
    {
      title: `Send invite to ${nannyName} to join`,
      description: 'They can view their schedule, log hours, and see family updates.',
      to: nannyId ? `/settings/nannies/${nannyId}` : '/settings',
    },
    {
      title: 'Create your first event',
      description: 'Add a shift, time off block, or kids\' plan on the shared calendar.',
      to: '/schedule',
    },
    {
      title: 'Publish your first message',
      description: 'Share an update with your nanny and co-parents on the feed.',
      to: '/feed',
    },
    {
      title: 'Upload your nanny employment agreement',
      description: 'Keep contracts and tax forms in one place for easy reference.',
      to: '/documents',
    },
  ]

  return GETTING_STARTED_TASK_IDS.map((id, index) => ({
    id,
    ...defs[index],
  }))
}

export function visibleGettingStartedTasks(
  ctx: GettingStartedContext,
  dismissed: Set<GettingStartedTaskId>,
): GettingStartedTask[] {
  return buildGettingStartedTasks(ctx).filter(
    (task) => !dismissed.has(task.id) && !isGettingStartedTaskComplete(task.id, ctx),
  )
}
