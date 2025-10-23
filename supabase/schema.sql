-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- Profiles store per-user settings/roles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_profiles_updated_at();

create index if not exists profiles_role_idx on public.profiles(role);

-- Subjects group the exam dashboards
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Exams belong to a subject
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
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
  user_id uuid not null references auth.users(id) on delete cascade,
  duration integer not null,
  started_at timestamptz not null default now()
);

create index if not exists subjects_user_id_idx on public.subjects(user_id);
create index if not exists exams_user_id_idx on public.exams(user_id);
create index if not exists focus_entries_user_id_idx on public.focus_entries(user_id);

-- Auto-assign the authenticated user's id when records are created
create or replace function public.set_current_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists subjects_set_current_user on public.subjects;
create trigger subjects_set_current_user
before insert on public.subjects
for each row execute procedure public.set_current_user();

drop trigger if exists exams_set_current_user on public.exams;
create trigger exams_set_current_user
before insert on public.exams
for each row execute procedure public.set_current_user();

drop trigger if exists focus_entries_set_current_user on public.focus_entries;
create trigger focus_entries_set_current_user
before insert on public.focus_entries
for each row execute procedure public.set_current_user();

-- Example RLS configuration (optional)
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.exams enable row level security;
alter table public.focus_entries enable row level security;

create policy "Profiles are viewable by owner"
on public.profiles
for select
using (id = auth.uid());

create policy "Profiles are updatable by owner"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Subjects are viewable by owner"
on public.subjects
for select
using (user_id = auth.uid());

create policy "Subjects are managed by owner"
on public.subjects
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Exams are viewable by owner"
on public.exams
for select
using (user_id = auth.uid());

create policy "Exams are managed by owner"
on public.exams
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Focus entries are viewable by owner"
on public.focus_entries
for select
using (user_id = auth.uid());

create policy "Focus entries are managed by owner"
on public.focus_entries
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Announcements broadcast to all users, authored by admins
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists announcements_created_at_idx on public.announcements(created_at desc);

alter table public.announcements enable row level security;

create policy "Announcements are readable by everyone"
on public.announcements
for select
using (true);

create policy "Announcements can be inserted by admins"
on public.announcements
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "Announcements can be deleted by admins"
on public.announcements
for delete
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "Announcements can be updated by admins"
on public.announcements
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);
