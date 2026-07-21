# Household payments

Soola owns schedules, hours, advances, and pay period closes. Payment compliance is tiered:

| Tier | Capability |
|------|------------|
| **Free** | Finalize period → **Mark as paid** (record amount/date; no money movement or tax filing) |
| **Paid** (`household_payroll` feature gate) | NannyKeeper employer/employee setup, tax preview, payroll run, optional ACH, W-2 / Schedule H |

Decision history: [HOUSEHOLD_PAYMENTS_OPTIONS.md](./HOUSEHOLD_PAYMENTS_OPTIONS.md).

## Free tier — mark as paid

1. Close the pay period on **Earnings**.
2. Enter the amount you paid (defaults to Soola net) and click **Mark period paid**.
3. Clears `pay_period_closes.paid_at` / `paid_amount_cents` if you undo.

This does **not** withhold taxes, file forms, or move money.

## Paid tier — NannyKeeper

### Partner setup

1. Create an API key at [nannykeeper.com/developers/keys](https://www.nannykeeper.com/developers/keys).
2. Use a **Professional** (multi-employer) plan for production multi-household apps.
3. Set secrets:

```env
NANNYKEEPER_API_KEY=nk_live_your_key
```

4. Deploy `nannykeeper-api` and grant users the `household_payroll` feature gate.

### In-app flow

1. **Settings → Household payroll** — create employer (name, email, state).
2. **Earnings** — link each nanny (email). Complete SSN/bank in NannyKeeper’s employee portal when provided.
3. Finalize the pay period in Soola (must be **All on the books**).
4. **Preview taxes** → **Run payroll** → optional **Initiate direct deposit**.
5. Year-end: generate W-2 / Schedule H from Settings.

### Snapshot mapping

| Soola snapshot | NannyKeeper |
|----------------|-------------|
| `regularMinutes` | `regular_hours` |
| `overtimeMinutes` | `overtime_hours` |
| overnight + vacation + holiday pay + line items | `other_earnings` (dollars) |
| advance repayments | Stay in Soola (post-tax); not sent as wages |

### Data model

- `nk_employers` — household ↔ NannyKeeper employer id  
- `nk_employees` — nanny ↔ NannyKeeper employee id  
- `payroll_runs` — provider `nannykeeper`, `external_payroll_id`, preview/run status  

### Security

- API key is server-only (`NANNYKEEPER_API_KEY`).
- All NannyKeeper calls go through the `nannykeeper-api` edge function with parent auth + feature gate.
- Do not store SSN or bank numbers in `pay_period_closes.snapshot`.
