import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { useGettingStartedTasks } from '@/hooks/useGettingStartedTasks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function GettingStartedCard() {
  const { tasks, dismiss, showCard } = useGettingStartedTasks()

  if (!showCard) return null

  return (
    <Card className="border-[var(--color-primary)]/20 bg-[var(--color-primary)]/[0.03]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Get started</CardTitle>
        <CardDescription>
          A few quick steps to get the most out of Sova Home. Tasks disappear when you complete them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3"
          >
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{task.title}</p>
              <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">{task.description}</p>
              <Button variant="link" className="mt-1 h-auto px-0 py-0 text-sm" asChild>
                <Link to={task.to}>Go →</Link>
              </Button>
            </div>
            <button
              type="button"
              onClick={() => dismiss(task.id)}
              className="shrink-0 rounded-lg p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              aria-label={`Dismiss: ${task.title}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <p className="flex items-center gap-1.5 pt-1 text-xs text-[var(--color-muted-foreground)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed tasks are removed automatically
        </p>
      </CardContent>
    </Card>
  )
}
