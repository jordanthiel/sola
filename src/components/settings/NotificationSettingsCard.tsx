import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from '@/hooks/useExtendedFeatures'
import type { NotificationCategories } from '@/types/features'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const CATEGORY_LABELS: Record<keyof NotificationCategories, string> = {
  schedule: 'Schedule changes',
  time_off: 'Time off',
  payroll: 'Payroll',
  feed: 'Household feed',
  incidents: 'Incidents',
  plans: "Kids' plans",
  invites: 'Invites',
  general: 'General',
}

export function NotificationSettingsCard() {
  const { data: prefs } = useNotificationPreferences()
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

  if (!categories) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notifications</CardTitle>
        <CardDescription>
          Control in-app and email alerts. Email requires RESEND_API_KEY on your Supabase project.
        </CardDescription>
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
        <Button
          onClick={() =>
            save.mutate(
              { email_enabled: emailEnabled, in_app_enabled: inAppEnabled, categories },
              {
                onSuccess: () => toast.success('Preferences saved'),
                onError: () => toast.error('Failed to save'),
              },
            )
          }
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving...' : 'Save preferences'}
        </Button>
      </CardContent>
    </Card>
  )
}
