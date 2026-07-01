export type ParsedDescriptionPart =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; href: string }

/** Parse Gusto HTML field descriptions into text and external links. */
export function parseGustoDescription(html: string): ParsedDescriptionPart[] {
  const parts: ParsedDescriptionPart[] = []
  const linkRegex = /<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index)
    const textBefore = before.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (textBefore) parts.push({ type: 'text', value: textBefore })

    const label = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (label && match[1]) parts.push({ type: 'link', label, href: match[1] })
    lastIndex = match.index + match[0].length
  }

  const remaining = html.slice(lastIndex).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (remaining) parts.push({ type: 'text', value: remaining })

  return parts
}

export const FEDERAL_EIN_HELP = {
  title: 'How to get your EIN',
  body: [
    'Your Employer Identification Number (EIN) is the 9-digit ID the IRS assigns to your household as an employer. You need one to run W-2 payroll and file employment taxes (including Schedule H for household employees).',
    'If you already employ a nanny or filed payroll taxes before, your EIN is on prior tax returns, IRS notices, or bank payroll paperwork.',
    "If you don't have an EIN yet, apply free online — it usually takes a few minutes.",
  ],
  links: [
    {
      label: 'Apply for an EIN online (IRS)',
      href: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
    },
    {
      label: 'Household employer tax basics (IRS)',
      href: 'https://www.irs.gov/businesses/small-businesses-self-employed/hiring-household-employees',
    },
  ],
  demoNote:
    'In the Gusto demo environment, you can leave EIN blank when creating your company and a test number will be generated.',
} as const

export const STATE_TAX_STEP_HELP = {
  title: 'Where these numbers come from',
  body: [
    'State tax IDs are assigned when you register as a household employer with your state. Gusto uses them to withhold and remit state unemployment, withholding, and related taxes.',
    "If you haven't registered yet, use the links below each field to register with your state agency first — then enter the account or registration number from your confirmation letter or online portal.",
  ],
} as const

type SupplementalHelp = { title?: string; body: string; links?: { label: string; href: string }[] }

/** Extra household-employer context for common state tax fields. */
export function supplementalStateTaxHelp(label: string, state: string): SupplementalHelp | null {
  const normalized = label.toLowerCase()

  if (state === 'TX' && normalized.includes('twc')) {
    return {
      body: 'Texas Workforce Commission (TWC) assigns this number when you register as an employer. Look for it on TWC mail or in your TWC employer portal. New employers can register through TWC before their first payroll.',
      links: [
        {
          label: 'Texas employer registration (Gusto guide)',
          href: 'https://support.gusto.com/article/106733888100000/Texas-registration-and-tax-info',
        },
      ],
    }
  }

  if (normalized.includes('withholding') && (normalized.includes('number') || normalized.includes('account'))) {
    return {
      body: `Your ${state} withholding account number comes from your state revenue or tax department after you register to withhold income tax from wages. Check registration confirmation mail or your state employer portal.`,
    }
  }

  if (normalized.includes('unemployment') && normalized.includes('rate')) {
    return {
      body: 'Your state unemployment insurance (SUI) rate is assigned by the state workforce agency — often on a rate notice after you register. If you have not received a rate yet, choose the new-employer option when available.',
      links: [
        {
          label: 'How to find your SUI rate (Gusto)',
          href: 'https://support.gusto.com/article/106622236100000/State-unemployment-insurance-(SUI)-tax',
        },
      ],
    }
  }

  if (normalized.includes('deposit schedule')) {
    return {
      body: 'Your deposit schedule tells how often you must send withheld taxes to the state. It is usually on your state registration letter — using the wrong schedule can cause rejected payments.',
    }
  }

  return null
}
