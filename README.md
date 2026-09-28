# Attendly

An attendance management front end built from the development guide’s recommended stack: Next.js, React, TypeScript, Tailwind CSS, and Supabase Auth.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Without Supabase credentials, choose **Explore the preview** on the sign-in screen. The sample dashboard is editable and stores its preview data in this browser only.

The Attendly Supabase project is connected for local development through `.env.local` (ignored by Git). To use another project, copy `.env.example` to `.env.local` and add its project URL and publishable key.

Run the SQL migrations in `supabase/migrations/` in timestamp order when setting up a fresh Supabase project. The connected Attendly project already has these migrations applied. They create student profiles, semesters, subjects, dated attendance records, weekday timetable entries, account settings, ownership policies, and the transactional workspace save function.

In Supabase **Authentication → URL Configuration**, allow these local callback URLs: `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/recovery-callback`. For Vercel, set the Site URL to the deployed app and allow the matching two callback URLs on that domain. Add the same two `NEXT_PUBLIC_SUPABASE_*` variables to Vercel’s environment settings before deploying.

Local preview data remains in this browser only. Signed-in accounts load and save their records through authenticated Next.js route handlers and Supabase Row Level Security. The browser only receives the publishable key; no service-role key is used.

```bash
pnpm build
pnpm start
```

## Attendance rules

- Overall attendance is `sum(periods attended) / sum(periods conducted) × 100`.
- Each subject is calculated from its own attended and conducted period totals.
- The required floors start at 80% overall and 75% for each subject; a user can raise them.
- Each attendance record stores its date, subject, periods conducted, periods attended, and optional note. The day of the week is derived from the saved date.
- The separate timetable stores subject assignments in seven numbered class-hour slots from Monday through Friday; it does not create attendance records.

## Current scope

Supabase Auth uses cookie-backed sessions for local and Vercel compatibility. Email recovery links are exchanged server-side before the new password form is unlocked. Authenticated attendance, subjects, semesters, timetable entries, and settings are stored in normalized PostgreSQL tables under per-user Row Level Security. Workspace writes go through one invoker-security database function so a failed save cannot leave a partial set of tables.

The public attendance calculator works without signing in. Dashboard sections include subjects, class history, attendance calendar, weekly timetable, planning, reports, semesters, and settings. Reports can be exported as CSV.
