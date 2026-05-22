import { Link } from 'react-router-dom'
import { Baby } from 'lucide-react'
import { APP_NAME } from '@/lib/app'

export function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex min-h-screen">
      <div className="auth-gradient relative hidden w-[42%] flex-col justify-between p-10 text-white lg:flex">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Baby className="h-5 w-5" strokeWidth={2.25} />
          </span>
          {APP_NAME}
        </Link>
        <div className="max-w-sm space-y-4">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Household care, simplified
          </h2>
          <p className="text-base leading-relaxed text-white/80">
            Schedules, payroll, time off, and daily plans — everything your family and nanny need in
            one calm, organized place.
          </p>
        </div>
        <p className="text-sm text-white/50">Trusted by families managing home childcare</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        <div className="mb-8 w-full max-w-md lg:hidden">
          <Link to="/" className="flex items-center gap-2 font-bold text-[var(--color-primary)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)]">
              <Baby className="h-5 w-5" strokeWidth={2.25} />
            </span>
            {APP_NAME}
          </Link>
        </div>
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
