import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/hooks/useExtendedFeatures'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: count = 0 } = useUnreadNotificationCount()
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-lg border border-transparent p-2 transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-accent)]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-elevated)]">
            <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
            {!notifications?.length ? (
              <p className="p-4 text-sm text-[var(--color-muted-foreground)]">No notifications yet.</p>
            ) : (
              <ul>
                {notifications.slice(0, 15).map((n) => (
                  <li key={n.id} className="border-b last:border-0">
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent)] ${
                        !n.read_at ? 'bg-[var(--color-accent)]/40' : ''
                      }`}
                      onClick={() => {
                        if (!n.read_at) markRead.mutate(n.id)
                        setOpen(false)
                        if (n.link) window.location.href = n.link
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{n.title}</span>
                        {!n.read_at && <Badge variant="warning">New</Badge>}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted-foreground)]">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                        {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full" asChild>
                <Link to="/settings" onClick={() => setOpen(false)}>
                  Notification settings
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
