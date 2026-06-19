-- ============================================================================
-- debate.fish — Extensions library: block folders + grouping
-- (run once in the Supabase SQL editor, after flows.sql)
--
-- Adds personal (collapsible) folders for organizing blocks (extensions) via a
-- new flow_snippets.folder_id, and reuses the existing flow_snippets.parent_id
-- to nest one block under another. (sort_order is reserved for future ordering.)
-- ============================================================================

-- Personal folders for organizing blocks (owner-only).
create table if not exists public.flow_snippet_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'Folder',
  sort_order double precision not null default 0,   -- manual order among folders
  created_at timestamptz not null default now()
);

-- A block can live in a folder and carries a manual sort position. folder_id has
-- NO foreign key on purpose: deleting a folder just leaves its blocks ungrouped
-- (the client clears folder_id), matching how parent_id is handled.
alter table public.flow_snippets add column if not exists folder_id  uuid;
alter table public.flow_snippets add column if not exists sort_order double precision not null default 0;

create index if not exists flow_snippets_folder_idx        on public.flow_snippets(folder_id);
create index if not exists flow_snippet_folders_owner_idx  on public.flow_snippet_folders(owner_id);

-- RLS: folders are private to their owner.
alter table public.flow_snippet_folders enable row level security;
drop policy if exists flow_snippet_folders_all on public.flow_snippet_folders;
create policy flow_snippet_folders_all on public.flow_snippet_folders for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
