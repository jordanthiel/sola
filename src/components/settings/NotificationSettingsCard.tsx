import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from '@/hooks/useExtendedFeatures'
import { useDebouncedAutoSave } from '@/hooks/useDebouncedAutoSave'
import type { NotificationCategories } from '@/types/features'
import { AutoSaveStatus } from '@/components/settings/AutoSaveStatus'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

const CATEGORY_LABELS: Record<keyof NotificationCategories, string> = {
  schedule: 'Schedule changes',
  time_off: 'Time off',
  payroll: 'Earnings',
  feed: 'Household feed',
  incidents: 'Incidents',
  plans: "Kids' plans",
  invites: 'Invites',
  general: 'General',
}

export function NotificationSettingsCard() {
  const { data: prefs, isLoading } = useNotificationPreferences()
  const save = useSaveNotificationPreferences()
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [categories, setCategories] = useState<NotificationCategories | null>(null)

  useEffect(() => {
    if (prefs) {
      setEmailEnabled(prefs.email_enabled)
      setInAppEnabled(prefs.in_app_enabled)
      setCategories(prefs.categories)
    }
  }, [prefs])

  const hasChanges = useMemo(() => {
    if (!prefs || !categories) return false
    return (
      emailEnabled !== prefs.email_enabled ||
      inAppEnabled !== prefs.in_app_enabled ||
      JSON.stringify(categories) !== JSON.stringify(prefs.categories)
    )
  }, [categories, emailEnabled, inAppEnabled, prefs])

  useDebouncedAutoSave(
    () => {
      if (!hasChanges || !categories || save.isPending) return
      save.mutate(
        { email_enabled: emailEnabled, in_app_enabled: inAppEnabled, categories },
        { onError: () => toast.error('Failed to save notification preferences') },
      )
    },
    [hasChanges, emailEnabled, inAppEnabled, categories],
    { ready: !isLoading && !!prefs && !!categories, enabled: hasChanges },
  )

  if (!categories) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Notifications</CardTitle>
            <CardDescription>
              Control in-app and email alerts. Email requires RESEND_API_KEY on your Supabase project.
            </CardDescription>
          </div>
          <AutoSaveStatus isPending={save.isPending} isError={save.isError} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inAppEnabled}
            onChange={(e) => setInAppEnabled(e.target.checked)}
          />
          In-app notifications
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
          />
          Email notifications
        </label>
        <div className="space-y-2 border-t pt-4">
          <Label>Categories</Label>
          {(Object.keys(CATEGORY_LABELS) as (keyof NotificationCategories)[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={categories[key]}
                onChange={(e) =>
                  setCategories({ ...categories, [key]: e.target.checked })
                }
              />
              {CATEGORY_LABELS[key]}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
