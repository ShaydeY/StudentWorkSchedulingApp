-- Class & Clock single-admin schema
-- Run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  color text not null default 'blue'
    check (color in ('coral', 'blue', 'green', 'purple', 'gold')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.class_blocks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  day smallint not null check (day between 0 and 4),
  start_time numeric(4,2) not null check (start_time >= 0 and start_time < 24),
  end_time numeric(4,2) not null check (end_time > start_time and end_time <= 24),
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  day smallint not null check (day between 0 and 4),
  start_time numeric(4,2) not null check (start_time >= 0 and start_time < 24),
  end_time numeric(4,2) not null check (end_time > start_time and end_time <= 24),
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  day_start numeric(4,2) not null default 8,
  day_end numeric(4,2) not null default 17,
  max_weekly_hours numeric(4,1) not null default 19,
  min_shift_hours numeric(3,1) not null default 2,
  target_coverage smallint not null default 1,
  updated_at timestamptz not null default now(),
  check (day_end > day_start),
  check (max_weekly_hours > 0),
  check (min_shift_hours >= 0.5),
  check (target_coverage between 1 and 10)
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.students enable row level security;
alter table public.class_blocks enable row level security;
alter table public.work_shifts enable row level security;
alter table public.app_settings enable row level security;

-- This is intentionally simple for the single-admin MVP. Public signup should
-- remain disabled so only the manually created admin account can authenticate.
create policy "Authenticated admin manages students"
on public.students for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admin manages class blocks"
on public.class_blocks for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admin manages work shifts"
on public.work_shifts for all
to authenticated
using (true)
with check (true);

create policy "Authenticated admin manages settings"
on public.app_settings for all
to authenticated
using (true)
with check (true);

revoke all on table public.students from anon;
revoke all on table public.class_blocks from anon;
revoke all on table public.work_shifts from anon;
revoke all on table public.app_settings from anon;

grant select, insert, update, delete on table public.students to authenticated;
grant select, insert, update, delete on table public.class_blocks to authenticated;
grant select, insert, update, delete on table public.work_shifts to authenticated;
grant select, insert, update, delete on table public.app_settings to authenticated;
