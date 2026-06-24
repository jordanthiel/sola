# Sova Home

A multi-household nanny management app for families. Parents manage schedules, payroll, and invites; nannies log hours, time off, and child activities.

## Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4
- **Backend:** Supabase (Auth, Postgres, Row Level Security)

## Features

- Multi-household tenancy with role-based access (`owner`, `parent`, `nanny`)
- Schedule planning (past and upcoming shifts)
- Payroll preview: scheduled vs actual hours, bonuses, mileage, pay period close, pay stub PDF
- **Gusto Embedded** (optional): compliant pay runs, withholding, and ACH after period close — see [docs/GUSTO_EMBEDDED.md](docs/GUSTO_EMBEDDED.md)
- Payment advance tracking
- Sick / PTO requests and balances
- Children care sheets (allergies, meds, routines) and emergency contacts
- Kids' plans (one-off and recurring), multi-child plans
- Documents hub (contracts, tax forms, etc.)
- Household feed with @mentions
- Incident log with notifications
- In-app notifications with per-category settings
- Email invites (parent + nanny claim links via Resend)
- CSV export (shifts and payroll summary)
- Nanny dashboard (multi-household, PTO, payroll preview, mentions)

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local DB)
- A Supabase project ([supabase.com](https://supabase.com))

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Add your Supabase **Project URL** and **anon public key** from the Supabase dashboard (Settings → API).

### 3. Run database migrations

**Hosted Supabase:**

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

**Local Supabase:**

```bash
npx supabase start
npx supabase db reset
```

Apply all files in [`supabase/migrations/`](supabase/migrations/) (through `00017_storage_documents.sql`).

### 4. Email edge function (optional)

**Local** (with `supabase start` running):

```bash
# Put RESEND_API_KEY in supabase/functions/.env (see supabase/functions/.env.example)
npx supabase functions serve send-email
```

Do not pass `--env-file` unless that file also includes `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from `supabase status` — otherwise auth to the function fails. Restart after changing `supabase/config.toml`.

**Hosted:**

```bash
npx supabase functions deploy send-email
npx supabase secrets set RESEND_API_KEY=re_xxxx EMAIL_FROM="Sova Home <hello@sova.baby>"
```

Invites send email when Resend is configured.

### 5. Gusto Embedded payroll (optional)

```bash
# Credentials in supabase/functions/.env — see docs/GUSTO_EMBEDDED.md
npx supabase functions serve gusto-api gusto-webhook
# Hosted:
npx supabase functions deploy gusto-api gusto-webhook
npx supabase secrets set GUSTO_CLIENT_ID=xxx GUSTO_CLIENT_SECRET=xxx GUSTO_ENV=demo
```

Parents enable payroll under **Settings → Gusto payroll**, complete Gusto onboarding, then submit closed pay periods from the **Payroll** page.

### 6. Start the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Usage flow

1. **Sign up** as a parent and **create a household** (onboarding wizard).
2. **Invite your nanny** in Settings → email sends automatically when Resend is configured.
3. Nanny **signs up** (or signs in) and opens the invite link to join.
4. Configure **employment settings** (hourly rate, OT multiplier, pay period) in Settings.
5. Add **children**, build the **schedule**, and start logging **hours** and **activities**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Security

- All tables use Row Level Security; data is scoped by `household_id`.
- Only the Supabase **anon** key belongs in the frontend (`.env`).
- Never commit `.env` or expose the service role key.

## Regenerating types

After schema changes:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

## License

Private / personal use.
