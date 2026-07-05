-- Dashboard datasets: one row per dataset ('ops', 'revenue'), full payload
-- as JSON. Access restricted to authenticated sessions only — the shared
-- dashboard login. The publishable key alone (anon role) can read nothing,
-- which is what makes the dashboard password real access control.
-- Run this in the Supabase SQL editor (already applied to the live project).

create table public.datasets (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.datasets enable row level security;

create policy "authenticated can read" on public.datasets
  for select to authenticated using (true);

create policy "authenticated can insert" on public.datasets
  for insert to authenticated with check (true);

create policy "authenticated can update" on public.datasets
  for update to authenticated using (true);
