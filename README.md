# NannyCare

A multi-household nanny management app for families. Parents manage schedules, payroll, and invites; nannies log hours, time off, and child activities.

## Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4
- **Backend:** Supabase (Auth, Postgres, Row Level Security)

## Features

- Multi-household tenancy with role-based access (`owner`, `parent`, `nanny`)
- Schedule planning (past and upcoming shifts)
- Time tracking (manual entry + clock in/out)
- Overtime and payroll preview by pay period
- Payment advance tracking
- Sick / PTO requests and balances
- Children profiles and activity log
- CSV export for time entries
- Email invites for nannies

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

Migration file: [`supabase/migrations/00001_initial_schema.sql`](supabase/migrations/00001_initial_schema.sql)

### 4. Start the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Usage flow

1. **Sign up** as a parent and **create a household** (onboarding wizard).
2. **Invite your nanny** in Settings → enter their email and share the invite link.
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
