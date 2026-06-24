# Gusto Embedded integration

Soola uses [Gusto Embedded](https://embedded.gusto.com/developers) for compliant payroll (withholding, ACH, filings). Soola remains the source of truth for schedules, hours, and pay period closes; Gusto processes official pay runs.

## Partner setup (required)

1. Create an organization at [dev.gusto.com](https://dev.gusto.com/organizations).
2. Create an **Application** under Applications → note `client_id` and `client_secret`.
3. Set redirect URI(s) per Gusto’s OAuth requirements (even for API-only flows).
4. Add credentials to `supabase/functions/.env`:

```env
GUSTO_CLIENT_ID=your_client_id
GUSTO_CLIENT_SECRET=your_client_secret
GUSTO_ENV=demo
GUSTO_API_VERSION=2026-02-01
GUSTO_WEBHOOK_VERIFICATION_TOKEN=optional_shared_secret
```

5. Deploy Edge Functions: `gusto-api`, `gusto-webhook`.
6. Register webhook URL in Gusto developer portal:
   - `https://<project-ref>.supabase.co/functions/v1/gusto-webhook`
   - Subscribe to: `company.approved`, `payroll.paid`, `payroll.failed` (and `form.updated` as needed).

For production, set `GUSTO_ENV=production` and use production API credentials.

## Household employer validation (action item)

Gusto’s **consumer** nanny/household product is separate from **Embedded**. Before marketing “nanny payroll in Soola,” obtain written confirmation from your Gusto Embedded TAM that:

- A family with one W-2 household employee (nanny) is valid as a `partner_managed_company`.
- Schedule H / household employer tax treatment is supported for your integration.

Until confirmed, treat Embedded as general small-employer payroll and use demo sandbox only.

## In-app flow

### Settings → Gusto payroll

1. Parent accepts Gusto Embedded ToS and creates a partner-managed company.
2. Parent accepts terms via API (`accept_terms`).
3. Complete Gusto onboarding at **Settings → Continue company setup** (`/settings/gusto`, calls `POST /v1/companies/{uuid}/flows`). Individual steps open from the checklist after **Refresh status** (`sync_onboarding`).
4. **Demo only:** use “Demo: approve company” after `finish_onboarding` (calls `PUT /companies/{uuid}/approve`).
5. Production: wait for `company.approved` webhook.

### Per nanny

- **Link nanny to Gusto** on Payroll (creates Gusto employee).
- Pay reporting must be **All on the books** when Gusto is approved.

### Payroll page

1. Close pay period in Soola (unchanged).
2. **Create Gusto payroll** → maps closed snapshot to off-cycle payroll.
3. **Refresh Gusto preview** → official net pay and debits.
4. **Submit to Gusto** → ACH and tax remittance per Gusto timelines.

## Snapshot mapping

See `supabase/functions/_shared/gusto-payroll-map.ts`:

| Soola snapshot | Gusto |
|----------------|-------|
| `regularMinutes` | Hourly line “Regular” |
| `overtimeMinutes` | Hourly line “Overtime” |
| `lineItemsTotalCents` | Fixed compensation |
| `advanceDeductionCents` | Post-tax deduction “Advance repayment” |

## QA / pilot checklist (production keys)

Gusto requires before production API access:

- [ ] End-to-end demo for Gusto Embedded Solutions (onboarding → pay run → paid).
- [ ] Support/CX contact documented for payroll failures.
- [ ] Webhook signature verification enabled (`GUSTO_WEBHOOK_VERIFICATION_TOKEN`).
- [ ] Limited beta (pilot) with real households.
- [ ] Legal: family = employer of record; Soola = software; Gusto = payroll per [Embedded ToS](https://flows.gusto.com/terms).

## Security

- OAuth tokens live in `gusto_companies` — **no client SELECT** on token columns; parents use `gusto_companies_public` view.
- All Gusto API calls go through `gusto-api` Edge Function with parent auth check.
- Do not store SSN or bank numbers in `pay_period_closes.snapshot`.
