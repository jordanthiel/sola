import type { ReactNode } from 'react'

export function SettingsSubsection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 border-t pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}
