import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { selectCn } from '@/lib/utils'
import {
  formatTaxRateHint,
  isRequirementApplicable,
  normalizeStateTaxFieldValue,
  parseStateTaxRequirements,
  type GustoTaxRequirement,
  type StateTaxValues,
} from '@/lib/gusto-state-tax'
import { supplementalStateTaxHelp } from '@/lib/gusto-field-help'
import {
  GustoRequirementDescription,
  SupplementalFieldHelp,
} from '@/components/settings/PayrollHelpCallout'

function RequirementField({
  requirement,
  value,
  onChange,
}: {
  requirement: GustoTaxRequirement
  value: string | boolean | number | null | undefined
  onChange: (value: string | boolean | number | null) => void
}) {
  const meta = requirement.metadata
  const type = meta?.type ?? 'text'

  if (type === 'radio' && meta?.options?.length) {
    return (
      <div className="space-y-2">
        {meta.options.map((option) => (
          <label key={String(option.value)} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              className="mt-1"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    )
  }

  if (type === 'select' && meta?.options?.length) {
    return (
      <select
        className={selectCn}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {meta.options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (type === 'tax_rate' || type === 'percent') {
    return (
      <>
        <Input
          inputMode="decimal"
          value={value == null ? '' : String(value)}
          placeholder="0.05"
          onChange={(e) => onChange(e.target.value)}
        />
        {formatTaxRateHint(meta) && (
          <p className="text-xs text-[var(--color-muted-foreground)]">{formatTaxRateHint(meta)}</p>
        )}
      </>
    )
  }

  const placeholder =
    type === 'account_number' && meta?.mask ? `Format: ${meta.mask}` : meta?.prefix ? `Prefix ${meta.prefix}` : undefined

  return (
    <Input
      value={value == null ? '' : String(value)}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function GustoStateTaxForm({
  state,
  requirements,
  values,
  onChange,
}: {
  state: string
  requirements: unknown
  values: StateTaxValues
  onChange: (next: StateTaxValues) => void
}) {
  const data = parseStateTaxRequirements(requirements)
  if (!data?.requirement_sets?.length) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No state tax fields are available for {state} yet. Finish adding your nanny first, then refresh this step.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-medium">{state} state taxes</p>
      {data.requirement_sets.map((set) => {
        const visibleRequirements = (set.requirements ?? []).filter(
          (req) => req.editable !== false && isRequirementApplicable(req, values),
        )
        if (visibleRequirements.length === 0) return null

        return (
          <div key={`${set.key}-${set.effective_from ?? 'default'}`} className="space-y-4 rounded-lg border p-4">
            <div>
              <h4 className="text-sm font-semibold">{set.label}</h4>
              {set.effective_from && (
                <p className="text-xs text-[var(--color-muted-foreground)]">Effective {set.effective_from}</p>
              )}
            </div>
            <div className="space-y-4">
              {visibleRequirements.map((req) => {
                const supplemental = supplementalStateTaxHelp(req.label, state)
                return (
                  <div key={req.key} className="space-y-2">
                    <Label>{req.label}</Label>
                    {req.description && <GustoRequirementDescription html={req.description} />}
                    {supplemental && (
                      <SupplementalFieldHelp body={supplemental.body} links={supplemental.links} />
                    )}
                    <RequirementField
                      requirement={req}
                      value={values[req.key]}
                      onChange={(next) =>
                        onChange({
                          ...values,
                          [req.key]: normalizeStateTaxFieldValue(req, next),
                        })
                      }
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
