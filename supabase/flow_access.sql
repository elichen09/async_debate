-- ============================================================================
-- debate.fish — Flow access list + master account (run once in the SQL editor)
--
-- Moves the /flow allowlist out of lib/flowAccess.ts and into a table, so the
-- master account can grant/revoke access from /flow/admin without a redeploy.
-- Also gives the master account read (and update) access to everyone's flows,
-- via ADDITIVE policies — nothing here drops or rewrites the policies from
-- flows.sql / flow_send_share.sql, it only ORs new permissive ones alongside.
--
-- The master email is also hard-coded in lib/flowAccess.ts (MASTER_EMAIL);
-- change it in both places if it ever moves.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Master check (SECURITY DEFINER for symmetry with the other flow helpers).
-- ---------------------------------------------------------------------------
create or replace function public.is_flow_master()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') = 'elichen314@gmail.com';
$$;

grant execute on function public.is_flow_master() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The allowlist. One row per allowed email (stored lowercase).
-- ---------------------------------------------------------------------------
create table if not exists public.flow_access (
  email      text primary key,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.flow_access enable row level security;

-- Anyone signed in can look up their own row (that's the gate check); the
-- master sees and manages the whole list.
drop policy if exists flow_access_select on public.flow_access;
create policy flow_access_select on public.flow_access for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or public.is_flow_master());
drop policy if exists flow_access_insert on public.flow_access;
create policy flow_access_insert on public.flow_access for insert to authenticated
  with check (public.is_flow_master());
drop policy if exists flow_access_delete on public.flow_access;
create policy flow_access_delete on public.flow_access for delete to authenticated
  using (public.is_flow_master());

-- Seed with the list that used to live in lib/flowAccess.ts.
insert into public.flow_access (email) values
  ('elichen314@gmail.com'),
  ('bchen2010@gmail.com'),
  ('rahulranilinc@gmail.com'),
  ('gary.r.ayal@gmail.com'),
  ('ethanisebbin@gmail.com'),
  ('28shangl@abschools.org'),
  ('melamnirmal@gmail.com'),
  ('christopherlawrence1022@gmail.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Master visibility into everyone's flows. Permissive policies OR together,
-- so these extend the owner/collaborator rules without touching them.
-- Read + update (so the master can open a flow and help), but no delete —
-- destroying someone's work stays owner-only.
-- ---------------------------------------------------------------------------
drop policy if exists flows_master_select on public.flows;
create policy flows_master_select on public.flows for select to authenticated
  using (public.is_flow_master());
drop policy if exists flows_master_update on public.flows;
create policy flows_master_update on public.flows for update to authenticated
  using (public.is_flow_master()) with check (public.is_flow_master());

drop policy if exists flow_cells_master_select on public.flow_cells;
create policy flow_cells_master_select on public.flow_cells for select to authenticated
  using (public.is_flow_master());
drop policy if exists flow_cells_master_update on public.flow_cells;
create policy flow_cells_master_update on public.flow_cells for update to authenticated
  using (public.is_flow_master()) with check (public.is_flow_master());

drop policy if exists flow_folders_master_select on public.flow_folders;
create policy flow_folders_master_select on public.flow_folders for select to authenticated
  using (public.is_flow_master());
drop policy if exists flow_folders_master_update on public.flow_folders;
create policy flow_folders_master_update on public.flow_folders for update to authenticated
  using (public.is_flow_master()) with check (public.is_flow_master());

drop policy if exists flow_collab_master_select on public.flow_collaborators;
create policy flow_collab_master_select on public.flow_collaborators for select to authenticated
  using (public.is_flow_master());
