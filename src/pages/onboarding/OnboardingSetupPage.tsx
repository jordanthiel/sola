import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { addDays, nextMonday, setHours, setMinutes, startOfDay } from 'date-fns'
import {
  Baby,
  Calendar,
  MessageSquare,
  Plus,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatSupabaseError } from '@/lib/errors'
import { pickDefaultChildColorKey, type ChildColorKey } from '@/lib/child-colors'
import { insertChildPlan } from '@/lib/child-plans-multi'
import { planAttendeeToFields } from '@/lib/plan-attendee'
import {
  householdNeedsOnboarding,
  startProductTour,
  type OnboardingStepId,
} from '@/lib/onboarding'
import { isNannyAccount } from '@/types/account'
import {
  emptyWeekDraft,
  type DayScheduleDraft,
} from '@/types/schedule-template'
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TimePicker } from '@/components/ui/time-picker'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type OnboardingChild = {
  id: string
  name: string
  color_key: ChildColorKey
}

function formatChildrenLabel(children: OnboardingChild[]): string {
  if (children.length === 0) return 'your children'
  if (children.length === 1) return children[0].name
  if (children.length === 2) return `${children[0].name} and ${children[1].name}`
  return `${children.slice(0, -1).map((c) => c.name).join(', ')}, and ${children[children.length - 1].name}`
}

type EventPreset = {
  id: string
  title: string
  activityType: 'appointment' | 'playdate' | 'other'
  daysFromNow: number
  hour: number
  minute: number
  durationMinutes: number
}

const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'checkup',
    title: 'Pediatrician checkup',
    activityType: 'appointment',
    daysFromNow: 5,
    hour: 10,
    minute: 0,
    durationMinutes: 60,
  },
  {
    id: 'storytime',
    title: 'Library story time',
    activityType: 'playdate',
    daysFromNow: 7,
    hour: 11,
    minute: 0,
    durationMinutes: 45,
  },
]

const TOUR_FEATURES = [
  {
    icon: Calendar,
    title: 'Schedule',
    description:
      'Your shared calendar shows nanny shifts, time off, kids\' plans, and holidays. Tap any day to add or edit.',
  },
  {
    icon: Wallet,
    title: 'Earnings',
    description:
      'Hours from the schedule roll into pay periods automatically. Set hourly rates and review what you owe each period.',
  },
  {
    icon: Sparkles,
    title: "Kids' plans",
    description:
      'Plan activities, classes, and appointments. Assign who is taking the kids so everyone stays in sync.',
  },
  {
    icon: MessageSquare,
    title: 'Feed',
    description:
      'Share updates, photos, and notes with your nanny and co-parents in one place.',
  },
  {
    icon: Baby,
    title: 'Children & settings',
    description:
      'Add child profiles, invite your nanny to log in, and manage household members from Settings.',
  },
]

export function OnboardingSetupPage() {
  const navigate = useNavigate()
  const { user, accountKind, loading: authLoading } = useAuth()
  const { activeHousehold, isParent, refreshHouseholds } = useHousehold()

  const [step, setStep] = useState<OnboardingStepId>('welcome')
  const [error, setError] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [nannyId, setNannyId] = useState<string | null>(null)

  const [scheduleDraft, setScheduleDraft] = useState<DayScheduleDraft[]>(() => emptyWeekDraft())
  const [hourlyRate, setHourlyRate] = useState('25')

  const [children, setChildren] = useState<OnboardingChild[]>([])
  const [childNameInput, setChildNameInput] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['checkup', 'storytime'])
  const [customEventTitle, setCustomEventTitle] = useState('')

  const hasEventSelection = selectedEvents.length > 0 || customEventTitle.trim().length > 0

  const needsOnboarding = householdNeedsOnboarding(activeHousehold)

  const addChild = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim()
      const { data, error: childError } = await supabase
        .from('children')
        .insert({
          household_id: activeHousehold!.id,
          name: trimmed,
          color_key: pickDefaultChildColorKey(children.map((c) => c.color_key)),
        })
        .select('id, name, color_key')
        .single()
      if (childError) throw childError
      return data as OnboardingChild
    },
    onSuccess: (child) => {
      setChildren((prev) => [...prev, child])
      setChildNameInput('')
      setError('')
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const removeChild = useMutation({
    mutationFn: async (childId: string) => {
      const { error: deleteError } = await supabase.from('children').delete().eq('id', childId)
      if (deleteError) throw deleteError
      return childId
    },
    onSuccess: (childId) => {
      setChildren((prev) => prev.filter((c) => c.id !== childId))
      setError('')
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  async function handleAddChild() {
    if (!childNameInput.trim() || addChild.isPending) return
    await addChild.mutateAsync(childNameInput)
  }

  async function handleContinueFromChildren() {
    try {
      if (childNameInput.trim()) {
        await addChild.mutateAsync(childNameInput)
      } else if (children.length === 0) {
        return
      }
      setError('')
      setStep('nanny')
    } catch {
      // addChild.onError sets the message
    }
  }

  const createNanny = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('create_household_nanny', {
        p_household_id: activeHousehold!.id,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_email: email.trim().toLowerCase(),
        p_phone: phone.trim() || undefined,
      })
      if (rpcError) throw rpcError
      return data as string
    },
    onSuccess: (id) => {
      setNannyId(id)
      setError('')
      setStep('schedule')
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const saveSchedule = useMutation({
    mutationFn: async () => {
      const hid = activeHousehold!.id
      const nid = nannyId!

      const rows = scheduleDraft.map((d) => ({
        household_id: hid,
        household_nanny_id: nid,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
        enabled: d.enabled,
        updated_at: new Date().toISOString(),
      }))

      const { error: templateError } = await supabase
        .from('nanny_schedule_templates')
        .upsert(rows, { onConflict: 'household_id,household_nanny_id,day_of_week' })
      if (templateError) throw templateError

      const cents = Math.round(parseFloat(hourlyRate) * 100)
      if (cents > 0) {
        const effectiveFrom = new Date().toISOString().split('T')[0]
        const { error: payError } = await supabase.from('employment_settings').insert({
          household_id: hid,
          household_nanny_id: nid,
          hourly_rate_cents: cents,
          effective_from: effectiveFrom,
        })
        if (payError) throw payError
      }

      const { error: syncError } = await supabase.rpc('ensure_schedule_from_templates', {
        p_household_id: hid,
        p_household_nanny_id: nid,
        p_weeks: 8,
      })
      if (syncError) throw syncError
    },
    onSuccess: () => {
      setError('')
      setStep('events')
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const saveEvents = useMutation({
    mutationFn: async () => {
      const hid = activeHousehold!.id
      const childIds = children.map((c) => c.id)
      const customTitle = customEventTitle.trim()
      if (!childIds.length || !nannyId || !user) return
      if (!selectedEvents.length && !customTitle) return

      const attendeeFields = planAttendeeToFields(`nanny:${nannyId}`)
      const weekStart = nextMonday(startOfDay(new Date()))

      for (const presetId of selectedEvents) {
        const preset = EVENT_PRESETS.find((p) => p.id === presetId)
        if (!preset) continue

        const eventDay = addDays(weekStart, preset.daysFromNow - 1)
        const occurredAt = setMinutes(
          setHours(eventDay, preset.hour),
          preset.minute,
        ).toISOString()

        await insertChildPlan({
          householdId: hid,
          childIds,
          loggedBy: user.id,
          activityType: preset.activityType,
          title: preset.title,
          description: null,
          occurredAt,
          durationMinutes: preset.durationMinutes,
          ...attendeeFields,
        })
      }

      if (customTitle) {
        const eventDay = addDays(weekStart, 2)
        const occurredAt = setMinutes(setHours(eventDay, 15), 0).toISOString()

        await insertChildPlan({
          householdId: hid,
          childIds,
          loggedBy: user.id,
          activityType: 'other',
          title: customTitle,
          description: null,
          occurredAt,
          durationMinutes: 60,
          ...attendeeFields,
        })
      }
    },
    onSuccess: () => {
      setError('')
      setStep('tour')
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const finishOnboarding = useMutation({
    mutationFn: async () => {
      const { error: rpcError } = await supabase.rpc('complete_household_onboarding', {
        p_household_id: activeHousehold!.id,
      })
      if (rpcError) throw rpcError
    },
    onSuccess: async () => {
      await refreshHouseholds()
      startProductTour()
      navigate('/dashboard', { replace: true })
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const toggleWeekday = useCallback((dow: number, enabled: boolean) => {
    setScheduleDraft((prev) =>
      prev.map((d) => (d.day_of_week === dow ? { ...d, enabled } : d)),
    )
  }, [])

  const updateDayTime = useCallback(
    (dow: number, field: 'start_time' | 'end_time', value: string) => {
      setScheduleDraft((prev) =>
        prev.map((d) => (d.day_of_week === dow ? { ...d, [field]: value } : d)),
      )
    },
    [],
  )

  const applyWeekdays = useCallback(() => {
    const mon = scheduleDraft.find((d) => d.day_of_week === 1)
    if (!mon) return
    setScheduleDraft((prev) =>
      prev.map((d) =>
        d.day_of_week >= 1 && d.day_of_week <= 5
          ? { ...d, enabled: mon.enabled, start_time: mon.start_time, end_time: mon.end_time }
          : d,
      ),
    )
  }, [scheduleDraft])

  if (!authLoading && isNannyAccount(accountKind)) {
    return <Navigate to="/" replace />
  }

  if (!authLoading && activeHousehold && !needsOnboarding) {
    return <Navigate to="/dashboard" replace />
  }

  if (!authLoading && !activeHousehold) {
    return <Navigate to="/onboarding" replace />
  }

  if (!isParent) {
    return <Navigate to="/dashboard" replace />
  }

  const weekdayDraft = scheduleDraft.filter((d) => d.day_of_week >= 1 && d.day_of_week <= 5)
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-muted)]/30 p-4">
      <div className="w-full max-w-2xl space-y-6">
        <OnboardingProgress currentStep={step} />

        <Card>
          {step === 'welcome' && (
            <>
              <CardHeader>
                <CardTitle>Welcome to {activeHousehold?.name}</CardTitle>
                <CardDescription>
                  Let&apos;s get your household set up in a few quick steps. You&apos;ll add your children,
                  add your nanny, set their usual hours, plan a couple of upcoming events, and learn how
                  everything fits together.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
                  <li>• Add your children&apos;s profiles</li>
                  <li>• Add your nanny — they don&apos;t need an account yet</li>
                  <li>• Set their regular weekly schedule and hourly rate</li>
                  <li>• Plan a couple of sample events on the calendar</li>
                  <li>• Take a quick tour of the app</li>
                </ul>
                <Button className="w-full" onClick={() => setStep('child')}>
                  Get started
                </Button>
              </CardContent>
            </>
          )}

          {step === 'child' && (
            <>
              <CardHeader>
                <CardTitle>Add your children</CardTitle>
                <CardDescription>
                  Start with who your nanny will be caring for. Add one or more children now — you can
                  fill in more details later from the Children page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {children.length > 0 && (
                  <ul className="divide-y rounded-lg border">
                    {children.map((child) => (
                      <li
                        key={child.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <span className="font-medium">{child.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0 text-[var(--color-muted-foreground)]"
                          disabled={removeChild.isPending}
                          onClick={() => removeChild.mutate(child.id)}
                          aria-label={`Remove ${child.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-2">
                  <Label htmlFor="onboard-child">
                    {children.length === 0 ? "Child's name" : 'Another child'}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="onboard-child"
                      value={childNameInput}
                      onChange={(e) => setChildNameInput(e.target.value)}
                      placeholder="Emma"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleAddChild()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!childNameInput.trim() || addChild.isPending}
                      onClick={() => void handleAddChild()}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('welcome')}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={
                      addChild.isPending ||
                      (children.length === 0 && !childNameInput.trim())
                    }
                    onClick={() => void handleContinueFromChildren()}
                  >
                    {addChild.isPending ? 'Adding...' : 'Continue'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 'nanny' && (
            <>
              <CardHeader>
                <CardTitle>Add your nanny</CardTitle>
                <CardDescription>
                  We&apos;ll use this to build the schedule and track pay. You can send them an invite to
                  log in later from Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="onboard-first">First name</Label>
                    <Input
                      id="onboard-first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Maria"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboard-last">Last name</Label>
                    <Input
                      id="onboard-last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Garcia"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="onboard-email">Email</Label>
                    <Input
                      id="onboard-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="maria@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboard-phone">Phone (optional)</Label>
                    <Input
                      id="onboard-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('child')}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!firstName.trim() || !lastName.trim() || !email.trim() || createNanny.isPending}
                    onClick={() => createNanny.mutate()}
                  >
                    {createNanny.isPending ? 'Adding...' : 'Continue'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 'schedule' && (
            <>
              <CardHeader>
                <CardTitle>Set nanny hours</CardTitle>
                <CardDescription>
                  Choose the days and times your nanny usually works. We&apos;ll add these to the calendar
                  for the next 8 weeks — you can always adjust individual days later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  {weekdayDraft.map((day, index) => (
                    <div
                      key={day.day_of_week}
                      className={cn(
                        'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                        day.enabled ? 'border-[var(--color-border)]' : 'border-dashed opacity-60',
                      )}
                    >
                      <label className="flex w-16 items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={day.enabled}
                          onChange={(e) => toggleWeekday(day.day_of_week, e.target.checked)}
                        />
                        {weekdayLabels[index]}
                      </label>
                      <TimePicker
                        value={day.start_time}
                        disabled={!day.enabled}
                        onChange={(v) => updateDayTime(day.day_of_week, 'start_time', v)}
                        className="h-9 w-[120px]"
                        minuteStep={15}
                      />
                      <span className="text-sm text-[var(--color-muted-foreground)]">to</span>
                      <TimePicker
                        value={day.end_time}
                        disabled={!day.enabled}
                        onChange={(v) => updateDayTime(day.day_of_week, 'end_time', v)}
                        className="h-9 w-[120px]"
                        minuteStep={15}
                      />
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={applyWeekdays}>
                  Copy Monday to all weekdays
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="onboard-rate">Hourly rate ($)</Label>
                  <Input
                    id="onboard-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="max-w-[140px]"
                  />
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Used to calculate earnings. You can change this anytime in nanny settings.
                  </p>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('nanny')}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={saveSchedule.isPending || !scheduleDraft.some((d) => d.enabled)}
                    onClick={() => saveSchedule.mutate()}
                  >
                    {saveSchedule.isPending ? 'Saving...' : 'Save & continue'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 'events' && (
            <>
              <CardHeader>
                <CardTitle>Plan a few events</CardTitle>
                <CardDescription>
                  Pick some upcoming plans for {formatChildrenLabel(children)} to see how the calendar
                  works. You can skip this and add plans later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Sample plans for next week</Label>
                  <div className="space-y-2">
                    {EVENT_PRESETS.map((preset) => (
                      <label
                        key={preset.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-[var(--color-accent)]/50"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedEvents.includes(preset.id)}
                          onChange={(e) => {
                            setSelectedEvents((prev) =>
                              e.target.checked
                                ? [...prev, preset.id]
                                : prev.filter((id) => id !== preset.id),
                            )
                          }}
                        />
                        <div>
                          <p className="font-medium">{preset.title}</p>
                          <p className="text-sm text-[var(--color-muted-foreground)]">
                            {preset.durationMinutes} min · assigned to your nanny
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onboard-custom-event">Or add your own</Label>
                  <Input
                    id="onboard-custom-event"
                    value={customEventTitle}
                    onChange={(e) => setCustomEventTitle(e.target.value)}
                    placeholder="Soccer practice, playdate at the park..."
                  />
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    We&apos;ll schedule it for next Tuesday at 3:00 PM — you can adjust it on the
                    calendar later.
                  </p>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('schedule')}>
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError('')
                      setStep('tour')
                    }}
                  >
                    Skip
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={saveEvents.isPending || !hasEventSelection}
                    onClick={() => saveEvents.mutate()}
                  >
                    {saveEvents.isPending ? 'Creating...' : 'Continue'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 'tour' && (
            <>
              <CardHeader>
                <CardTitle>How Sova Home works</CardTitle>
                <CardDescription>
                  Here&apos;s a quick overview. When you finish, we&apos;ll walk you through the app with
                  highlights on each section.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  {TOUR_FEATURES.map(({ icon: Icon, title, description }) => (
                    <div
                      key={title}
                      className="flex gap-3 rounded-lg border border-[var(--color-border)] p-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium">{title}</p>
                        <p className="text-sm text-[var(--color-muted-foreground)]">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-[var(--color-muted)]/60 p-3 text-sm text-[var(--color-muted-foreground)]">
                  <strong className="text-[var(--color-foreground)]">Tip:</strong> Use{' '}
                  <span className="font-medium">View as nanny</span> in Settings to see exactly what your
                  nanny sees — great for checking schedules and pay before inviting them.
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('events')}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={finishOnboarding.isPending}
                    onClick={() => finishOnboarding.mutate()}
                  >
                    {finishOnboarding.isPending ? 'Finishing...' : 'Finish setup & start tour'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
