-- ============================================================================
-- debate.fish — Collaborative flow sheets (run once in the Supabase SQL editor)
--
-- A "flow" is a standalone shared prep doc: an 8-column grid of argument cards
-- (one column per PF speech), a shared speech-writing area, and per-flow
-- collaborators invited by username. Backed by Supabase Realtime — partners see
-- edits on blur (last-write-wins), mirroring the round_messages chat pattern.
--
-- After running this, enable Realtime on `public.flows` and `public.flow_cells`
-- (the ALTER PUBLICATION lines at the bottom do this; the dashboard toggle works
-- too). Personal snippets + collaborator lists are fetched on load, not streamed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.flows (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null default 'Untitled',
  side        text check (side in ('aff', 'neg')),
  speech_body text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.flow_collaborators (
  flow_id  uuid not null references public.flows(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (flow_id, user_id)
);

create table if not exists public.flow_cells (
  id          uuid primary key default gen_random_uuid(),
  flow_id     uuid not null references public.flows(id) on delete cascade,
  col         smallint not null default 0,            -- unused by the outline; kept for back-compat
  row_index   double precision not null default 0,    -- global vertical order; fractional inserts never renumber
  depth       int not null default 0,                 -- outline indent level (0-based)
  highlighted boolean not null default false,
  content     text not null default '',
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);
-- Upgrade older flow_cells in place:
alter table public.flow_cells alter column row_index type double precision;
alter table public.flow_cells add column if not exists depth int not null default 0;
alter table public.flow_cells add column if not exists highlighted boolean not null default false;

create table if not exists public.flow_snippets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  label      text not null default 'Snippet',
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- Personal folders for organizing flows (owner-only). A flow's folder is set by
-- whoever owns it; collaborators see shared flows ungrouped.
create table if not exists public.flow_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'Folder',
  created_at timestamptz not null default now()
);

alter table public.flows
  add column if not exists folder_id uuid references public.flow_folders(id) on delete set null;

create index if not exists flows_owner_idx       on public.flows(owner_id);
create index if not exists flows_folder_idx       on public.flows(folder_id);
create index if not exists flow_folders_owner_idx on public.flow_folders(owner_id);
create index if not exists flow_cells_flow_idx    on public.flow_cells(flow_id);
create index if not exists flow_collab_user_idx   on public.flow_collaborators(user_id);
create index if not exists flow_snippets_owner_idx on public.flow_snippets(owner_id);

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so they bypass RLS internally and don't
-- recurse: the flows policy reads flow_collaborators and vice-versa).
-- ---------------------------------------------------------------------------
create or replace function public.has_flow_access(p_flow_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.flows f
                  where f.id = p_flow_id and f.owner_id = auth.uid())
      or exists (select 1 from public.flow_collaborators c
                  where c.flow_id = p_flow_id and c.user_id = auth.uid());
$$;

create or replace function public.owns_flow(p_flow_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.flows f
                  where f.id = p_flow_id and f.owner_id = auth.uid());
$$;

-- For the flows table's OWN policies, ownership is checked inline
-- (owner_id = auth.uid()) — NOT via has_flow_access(), which re-queries flows
-- and, being STABLE, can't see the just-inserted row during INSERT ... RETURNING
-- (that makes .select() after insert fail RLS). Only the collaborator case needs
-- a subquery, and it hits a different table (flow_collaborators).
create or replace function public.is_flow_collaborator(p_flow_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.flow_collaborators c
                  where c.flow_id = p_flow_id and c.user_id = auth.uid());
$$;

grant execute on function public.has_flow_access(uuid)      to anon, authenticated;
grant execute on function public.owns_flow(uuid)            to anon, authenticated;
grant execute on function public.is_flow_collaborator(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at bump
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists flows_touch on public.flows;
create trigger flows_touch before update on public.flows
  for each row execute function public.touch_updated_at();

drop trigger if exists flow_cells_touch on public.flow_cells;
create trigger flow_cells_touch before update on public.flow_cells
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.flows              enable row level security;
alter table public.flow_collaborators enable row level security;
alter table public.flow_cells         enable row level security;
alter table public.flow_snippets      enable row level security;

-- flows: owner or collaborator can read/update; owner alone creates/deletes.
-- Ownership is checked inline so INSERT ... RETURNING (.select() after insert)
-- can see the new row; see is_flow_collaborator note above.
drop policy if exists flows_select on public.flows;
create policy flows_select on public.flows for select to authenticated
  using (owner_id = auth.uid() or public.is_flow_collaborator(id));
drop policy if exists flows_insert on public.flows;
create policy flows_insert on public.flows for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists flows_update on public.flows;
create policy flows_update on public.flows for update to authenticated
  using (owner_id = auth.uid() or public.is_flow_collaborator(id))
  with check (owner_id = auth.uid() or public.is_flow_collaborator(id));
drop policy if exists flows_delete on public.flows;
create policy flows_delete on public.flows for delete to authenticated
  using (owner_id = auth.uid());

-- collaborators: anyone with access can see the list; owner manages it; a
-- collaborator may remove themselves.
drop policy if exists flow_collab_select on public.flow_collaborators;
create policy flow_collab_select on public.flow_collaborators for select
  using (public.has_flow_access(flow_id));
drop policy if exists flow_collab_insert on public.flow_collaborators;
create policy flow_collab_insert on public.flow_collaborators for insert
  with check (public.owns_flow(flow_id));
drop policy if exists flow_collab_delete on public.flow_collaborators;
create policy flow_collab_delete on public.flow_collaborators for delete
  using (public.owns_flow(flow_id) or user_id = auth.uid());

-- cells: full CRUD for anyone with flow access.
drop policy if exists flow_cells_select on public.flow_cells;
create policy flow_cells_select on public.flow_cells for select
  using (public.has_flow_access(flow_id));
drop policy if exists flow_cells_insert on public.flow_cells;
create policy flow_cells_insert on public.flow_cells for insert
  with check (public.has_flow_access(flow_id));
drop policy if exists flow_cells_update on public.flow_cells;
create policy flow_cells_update on public.flow_cells for update
  using (public.has_flow_access(flow_id)) with check (public.has_flow_access(flow_id));
drop policy if exists flow_cells_delete on public.flow_cells;
create policy flow_cells_delete on public.flow_cells for delete
  using (public.has_flow_access(flow_id));

-- snippets: private to their owner.
drop policy if exists flow_snippets_all on public.flow_snippets;
create policy flow_snippets_all on public.flow_snippets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- folders: private to their owner.
alter table public.flow_folders enable row level security;
drop policy if exists flow_folders_all on public.flow_folders;
create policy flow_folders_all on public.flow_folders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime — stream cell + speech_body changes to collaborators.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.flow_cells;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.flows;
exception when duplicate_object then null;
end $$;

-- DELETE events only carry the primary key by default, so the flow_id filter
-- and RLS can't authorize them and the partner never sees a card removed.
-- REPLICA IDENTITY FULL puts the whole old row in the delete payload.
alter table public.flow_cells replica identity full;
alter table public.flows      replica identity full;
