import type { ReactNode } from 'react'
import { parseGustoDescription } from '@/lib/gusto-field-help'

export function PayrollHelpCallout({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 ${className ?? ''}`}
    >
      {title && <p className="font-medium">{title}</p>}
      <div className="space-y-2 text-blue-900/90">{children}</div>
    </div>
  )
}

export function PayrollHelpLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[var(--color-primary)] underline underline-offset-2"
    >
      {children}
    </a>
  )
}

export function GustoRequirementDescription({ html }: { html: string }) {
  const parts = parseGustoDescription(html)
  if (parts.length === 0) return null

  return (
    <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
      {parts.map((part, index) =>
        part.type === 'text' ? (
          <span key={index}>
            {part.value}
            {index < parts.length - 1 ? ' ' : ''}
          </span>
        ) : (
          <span key={index}>
            {index > 0 ? ' ' : ''}
            <PayrollHelpLink href={part.href}>{part.label}</PayrollHelpLink>
          </span>
        ),
      )}
    </p>
  )
}

export function SupplementalFieldHelp({
  body,
  links,
}: {
  body: string
  links?: { label: string; href: string }[]
}) {
  return (
    <div className="space-y-1 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/20 px-3 py-2">
      <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">{body}</p>
      {links?.map((link) => (
        <p key={link.href} className="text-xs">
          <PayrollHelpLink href={link.href}>{link.label}</PayrollHelpLink>
        </p>
      ))}
    </div>
  )
}
