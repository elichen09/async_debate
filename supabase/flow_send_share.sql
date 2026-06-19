-- ============================================================================
-- debate.fish — Share the Send doc with flow collaborators (run once)
--
-- The Send doc lives on the FOLDER row when a flow is in a folder. flow_folders
-- was owner-only, so collaborators on a shared flow couldn't read / edit / stream
-- that folder's send_html — the Send doc didn't follow the share. This lets anyone
-- with access to a flow in a folder reach that folder's row (read + update), while
-- only the owner may create / rename / delete folders.
--
-- IMPORTANT: ownership is checked INLINE (owner_id = auth.uid()) in each policy,
-- NOT via a function that re-queries flow_folders. A STABLE/SECURITY DEFINER
-- function can't see the just-inserted row during INSERT ... RETURNING, which made
-- "create folder" fail its .select() with a row-level-security error. The helper
-- below only handles the collaborator case, which queries OTHER tables.
--
-- (Ungrouped flows keep their Send doc on the flow row, which collaborators can
-- already access, so this only affects folder-grouped flows.)
-- ============================================================================

-- True if the caller collaborates on any flow inside this folder. SECURITY DEFINER
-- so it bypasses RLS internally; it only touches flows + flow_collaborators (never
-- flow_folders), so it's safe to use in flow_folders policies.
create or replace function public.has_folder_collab(p_folder_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.flows fl
    join public.flow_collaborators c on c.flow_id = fl.id
    where fl.folder_id = p_folder_id and c.user_id = auth.uid()
  );
$$;
grant execute on function public.has_folder_collab(uuid) to anon, authenticated;

-- Drop existing policies FIRST (a previous run may have created ones that depend
-- on the old has_folder_access function), then the old function, then recreate.
drop policy if exists flow_folders_all    on public.flow_folders;
drop policy if exists flow_folders_select on public.flow_folders;
drop policy if exists flow_folders_insert on public.flow_folders;
drop policy if exists flow_folders_update on public.flow_folders;
drop policy if exists flow_folders_delete on public.flow_folders;

-- (Old name from a previous version of this migration — now unreferenced.)
drop function if exists public.has_folder_access(uuid);

-- Owner (checked inline) or a collaborator on one of the folder's flows can read...
create policy flow_folders_select on public.flow_folders for select to authenticated
  using (owner_id = auth.uid() or public.has_folder_collab(id));
-- ...and update it (so the shared Send doc syncs both ways).
create policy flow_folders_update on public.flow_folders for update to authenticated
  using (owner_id = auth.uid() or public.has_folder_collab(id))
  with check (owner_id = auth.uid() or public.has_folder_collab(id));
-- Only the owner creates / deletes folders.
create policy flow_folders_insert on public.flow_folders for insert to authenticated
  with check (owner_id = auth.uid());
create policy flow_folders_delete on public.flow_folders for delete to authenticated
  using (owner_id = auth.uid());
