# Household payments: options after Gusto

Decision brief for replacing (or simplifying) Gusto Embedded with a household-native payments approach.

> **Decision (implemented):** Free tier = Option A (mark as paid). Paid tier = Option C (NannyKeeper full payroll). See [HOUSEHOLD_PAYMENTS.md](./HOUSEHOLD_PAYMENTS.md).

## Current state (what we already own)

Soola is already the source of truth for **gross pay**. Gusto is an optional, feature-gated layer (`gusto_payroll`) mounted on top.

| Concern | Owner today | Key files |
|--------|-------------|-----------|
| Hours, OT, overnight, holiday, vacation | Soola | `src/lib/payroll.ts`, schedule/time-off |
| Advances / repayments / line items | Soola | `src/lib/advances.ts`, `payroll-extended.ts` |
| Pay reporting (over/under books) | Soola | `src/lib/pay-reporting.ts` |
| Period close + immutable snapshot | Soola | `pay_period_closes`, `PayrollPage.tsx` |
| Local pay stub PDF | Soola | `src/lib/pay-stub-pdf.ts` |
| Employer/employee tax onboarding | Gusto | `GustoSetupWizard`, `gusto-onboarding.ts` |
| Official net / tax preview | Gusto | `GustoPayrollActions`, `gusto-api` |
| ACH + tax remittance + filings | Gusto | `submit_payroll`, `gusto-webhook` |

**Important product risk already documented in `docs/GUSTO_EMBEDDED.md`:** Gusto Embedded is small-employer payroll. Household / Schedule H treatment for a one-nanny family is **not confirmed** with Gusto. That alone is a strong reason to leave Embedded.

### Gusto surface to remove (when we decide)

Frontend: `GustoSettingsPage`, `GustoSetupWizard`, `GustoStateTaxForm`, `GustoPayrollActions`, `GustoEmployeeSetupPanel`, `GustoNannyPayrollSetup`, `src/lib/gusto-*.ts`, Settings/App route mounts.

Backend: `supabase/functions/gusto-api`, `gusto-webhook`, `_shared/gusto*.ts`.

Data: `gusto_companies`, `gusto_employees`, `gusto_webhook_events`, `payroll_runs` (Gusto-specific), feature gate `gusto_payroll`. Core `pay_period_closes` stays.

Coupling is low: `payroll.ts` / period close do **not** import Gusto. Components mostly self-hide behind the feature gate.

---

## What “custom household payments” actually needs

Families need different depth depending on product ambition:

1. **Gross ledger** — already done in Soola.
2. **Tax calculation** — FICA, FUTA, state UI, income tax, SDI/PFL; Schedule H / household rules (not Form 941 business payroll).
3. **Money movement** — ACH/DD, or mark-as-paid for Venmo/Zelle/check.
4. **Compliance artifacts** — W-2, Schedule H, quarterly checklists (who *files* them is a separate product choice).
5. **Onboarding** — employer EIN/SSN posture, employee W-4/SSN/bank (minimize storing PII in Soola).

Soola should keep owning (1). The open question is who owns (2)–(5).

---

## Option A — Soola-only + mark as paid (no tax engine)

**Idea:** Strip Gusto. Keep period close / stub PDF. Parent marks a close as paid (manual ACH/Venmo/check). Tax notes stay free-text.

| Pros | Cons |
|------|------|
| Fastest strip-out; no vendor | No real withholding math |
| Matches many under-the-table / CPA-assisted families | Weak “payroll product” story |
| Zero ACH / KYC complexity | Liability if we imply tax compliance we don’t deliver |

**Fit:** Good interim after Gusto removal; not a long-term compliant payroll story.

---

## Option B — NannyKeeper for calculations only (recommended first step)

**Idea:** After period close, call NannyKeeper `POST /api/v1/calculate` (and `/threshold`) with state + wages derived from the Soola snapshot. Show employer/employee tax breakdown and true net estimate in Payroll UI. Payment remains mark-as-paid (or later ACH).

| Pros | Cons |
|------|------|
| Purpose-built for **household** employers (Schedule H mental model) | Free tier = no YTD; mid-year SS/FUTA caps can drift |
| Free tier: 50 calc/day — enough to spike | Still no automatic IRS/state filing |
| Tiny integration vs Gusto wizard | Paid plan needed for accurate ongoing YTD |
| Aligns with existing “Soola owns hours” architecture | |

**API shape (public):**
- `POST /calculate` — state, annual_wages, pay_frequency, filing_status
- `GET /threshold` — whether wages trigger household employer obligations
- All 50 states + DC; FICA, FUTA, SUI, income tax, SDI/PFL/local where applicable

**Fit:** Best near-term replacement for “what do we owe this period?” without rebuilding Gusto-scale onboarding.

---

## Option C — NannyKeeper full payroll (calc + run + docs + optional ACH)

**Idea:** Map household → NannyKeeper `employer`, nanny → `employee`. On period close:

1. `POST /payroll/preview` with period + employee earnings from Soola snapshot  
2. Parent approves → `POST /payroll/run` (YTD tracked in NK)  
3. Optional `POST /ach/transfer` for DD  
4. Year-end: `documents/w2`, `documents/schedule-h`

| Pros | Cons |
|------|------|
| Household-native end-to-end API | Vendor maturity / SLA vs Gusto/Check |
| Schedule H + W-2 generation | Professional tier for multi-employer product (`$25/mo + $6/employer`; attribution or white-label via sales) |
| ACH available (Plus+) without reinventing money movement | Their model leans “we calculate + generate; family often remits/files” — confirm filing depth for your ToS |
| Employee SSN/bank via their secure portal (less PII in Soola) | Need legal review of “Powered by NannyKeeper” / resale terms |
| Pricing is household-scale, not SMB Embedded | Onboarding UX still to build (lighter than Gusto wizard) |

**Fit:** Strong primary long-term partner if diligence (security, ACH reliability, state coverage, white-label) passes.

---

## Option D — Another embedded payroll provider (Check HQ, keep Gusto, etc.)

**Idea:** Swap Gusto Embedded for Check (or stay on Gusto) as full Payroll-as-a-Service: withhold, file, ACH.

| Pros | Cons |
|------|------|
| Battle-tested money movement + filings | Same **household employer** fit risk as Gusto Embedded |
| Richer enterprise APIs / components | Heavier partner sales cycle and pricing |
| | Overkill for 1–2 nanny households; Schedule H still the hard question |

**Fit:** Only if a TAM confirms household/Schedule H support **in writing**. Do not assume Check/Gusto “small business payroll” = nanny payroll.

---

## Option E — Fully custom tax + payments stack

**Idea:** Maintain federal/state tax tables in-house; Stripe Treasury / Dwolla / Lead Bank for ACH; generate W-2/Schedule H ourselves.

| Pros | Cons |
|------|------|
| Maximum product control | Tax engine + filings is a multi-year compliance product |
| No “Powered by” attribution | Money transmitter / payroll sponsor licensing complexity |
| | Highest ongoing maintenance (rate changes every year / every state) |

**Fit:** Not recommended unless payroll becomes the core business and you hire compliance/tax eng.

---

## Recommendation

### Recommended path: **B → C**, strip Gusto now

1. **Strip Gusto** (UI, edge functions, secrets, feature gate). Keep `pay_period_closes` and local stubs. Add simple **Mark period paid** if missing for non-ACH flows.
2. **Integrate NannyKeeper calculate (+ threshold)** behind a new feature gate (e.g. `household_tax_estimate`). Map closed-period gross → per-paycheck / annualized inputs; store estimate JSON on the close or a thin `tax_estimates` table. Do **not** store SSN/bank in Soola snapshots.
3. **Pilot NannyKeeper payroll/run + documents** for a small set of “all on the books” households (Professional multi-employer). Keep Soola as hours/gross SoT; NK as tax/YTD/docs (and ACH if desired).
4. **Defer Check/Gusto-class Embedded** unless household Schedule H support is contractually confirmed.

### Why NannyKeeper over rebuilding Gusto-shaped Embedded

- Your docs already flag Gusto Embedded ≠ household nanny product.
- NannyKeeper’s API is explicitly **household employer** (Schedule H, nanny thresholds, state UI quirks).
- Soola’s hard problems (scheduling, OT, overnight, advances, split reporting) stay in-house; NK only fills the tax/compliance gap you never wanted to own.
- Cost and onboarding complexity are closer to a family SaaS than Embedded SMB payroll.

### Explicit non-goals for v1 after strip

- Do not re-implement the 11-step Gusto company wizard.
- Do not put full-service “we file your taxes for you” in marketing until the filing partner and ToS are clear.
- Do not block period close on a tax vendor being configured.

---

## Suggested target architecture

```
Schedules / time / advances  →  calculatePayroll()  →  pay_period_closes.snapshot
                                                         │
                         ┌───────────────────────────────┼──────────────────────────┐
                         ▼                               ▼                          ▼
                 Local pay stub PDF              NannyKeeper calculate/preview   Mark paid / ACH
                 (gross + notes)                 (net, employer tax, YTD)        (optional)
                                                         │
                                                         ▼
                                              W-2 / Schedule H (year-end)
```

Reuse the existing bridge pattern: today `payroll_runs` links a close to a Gusto UUID. Replace with a vendor-neutral `household_payroll_runs` (provider, external_id, net/tax cents, preview payload, status).

---

## Diligence checklist before committing to NannyKeeper for production ACH

- [ ] Written confirmation of Professional / white-label terms for a multi-household consumer app
- [ ] ACH failure / return handling and support SLAs
- [ ] Whether they remit/file or only generate payment vouchers + forms
- [ ] Data processing agreement + where SSN/bank live
- [ ] Sandbox parity for `payroll/preview` → `payroll/run` → `ach/transfer`
- [ ] Behavior with Soola’s `pay_reporting_mode` (only `all_over` should hit compliant payroll)

---

## Proposed implementation slices (after decision)

| Slice | Scope |
|-------|--------|
| 1. Strip Gusto | Remove components, routes, edge functions, docs; leave DB tables orphaned or drop in a follow-up migration |
| 2. Mark paid | Parent marks `pay_period_closes.paid_at` / amount without a payroll vendor |
| 3. NK calculate | Edge function + Payroll UI tax breakdown from closed snapshot |
| 4. NK employers/employees | Link household/nanny; employee portal for SSN/bank |
| 5. NK run + ACH | Preview/approve/run; optional DD; webhook or poll for status |
| 6. Year-end docs | W-2 + Schedule H download in Settings |

---

## References

- Current Gusto design: [`docs/GUSTO_EMBEDDED.md`](./GUSTO_EMBEDDED.md)
- NannyKeeper developers: https://www.nannykeeper.com/developers  
- NannyKeeper OpenAPI paths of interest: `/calculate`, `/threshold`, `/payroll/preview`, `/payroll/run`, `/employers`, `/employees`, `/ach/transfer`, `/documents/w2`, `/documents/schedule-h`
- Check HQ (Embedded alternative): https://docs.checkhq.com/docs/overview
