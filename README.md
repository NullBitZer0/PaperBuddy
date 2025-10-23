# Marks Analyze Dashboard

A responsive React + TypeScript dashboard inspired by the provided UI reference. The layout is built with Tailwind CSS and lightweight shadcn-style components.

## Prerequisites
- Bun `>=1.1.0` (https://bun.sh)
- Node-compatible tooling for optional editor integrations

## Install
```sh
bun install
```

## Development
```sh
bun run dev
```

## Build & Preview
```sh
bun run build
bun run preview
```

## Tech Stack
- React 18 + Vite 5
- TypeScript
- Tailwind CSS with shadcn-inspired UI primitives
- Lucide icons for the sidebar and metrics
- Local storage persistence for paper records
- Multi-subject dashboards with isolated paper archives

## Manage Papers
- Use the Book icon in the sidebar to open the paper library overlay.
- Add new entries from the dashboard card, then edit or delete them inline; all changes persist in local storage.
- Add subjects (e.g., Maths, Biology) from the subject switcher and swap between them to view dedicated analytics per subject.

## Focus Timer & Analytics
- Use the bell icon to run the built-in Pomodoro timer; completed focus sessions automatically log study time.
- Open the analytics (chart) icon to review day/week/month focus totals. Day view shows a completion ring, while week/month swap to a trend line to visualise momentum.

## Supabase Setup
1. Create a Supabase project (https://supabase.com/), then run the SQL in `supabase/schema.sql` to provision the required tables.
2. In the project settings, copy the `Project URL` and `anon` public API key. **Keep these secret.**
3. Add a `.env` (ignored by git) with:
   ```sh
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Restart the dev server (`bun run dev`) so Vite picks up the new environment variables.

> **Note:** Row Level Security is commented inside `supabase/schema.sql`. Enable it and write policies once you introduce authentication.
