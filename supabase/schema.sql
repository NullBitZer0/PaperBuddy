-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- Subjects group the exam dashboards
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Exams belong to a subject
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  paper text not null,
  mcq numeric default 0,
  essay numeric default 0,
  total numeric default 0,
  completion numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Maintain updated_at automatically
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_set_updated_at on public.exams;
create trigger trigger_set_updated_at
before update on public.exams
for each row execute procedure public.set_updated_at();

-- Logged focus sessions generated from the Pomodoro timer
create table if not exists public.focus_entries (
  id uuid primary key default gen_random_uuid(),
  duration integer not null,
  started_at timestamptz not null default now()
);

-- Example RLS configuration (optional)
-- Row Level Security can be enabled when you introduce authentication.
-- alter table public.subjects enable row level security;
-- alter table public.exams enable row level security;
-- alter table public.focus_entries enable row level security;
