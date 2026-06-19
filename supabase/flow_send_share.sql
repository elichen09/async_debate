-- ============================================================================
-- debate.fish — Share the Send doc with flow collaborators (run once)
--
-- The Send doc lives on the FOLDER row when a flow is in a folder. flow_folders
-- was owner-only, so collaborators on a shared flow couldn't read / edit / stream
-- that folder's send_html — the Send doc didn't follow the share. This lets anyone
-- with access to a flow in a folder reach that folder's row (read + update), while
-- only the owner may create / rename / delete folders.
--
-- (Ungrouped flows keep their Send doc on the flow row, which collaborators can
-- already access, so this only affects folder-grouped flows.)
-- ============================================================================

-- True if the caller owns the folder, OR collaborates on any flow inside it.
-- SECURITY DEFINER so it bypasses RLS internally (no recursion with the policies).
create or replace function public.has_folder_access(p_folder_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.flow_folders f
                  where f.id = p_folder_id and f.owner_id = auth.uid())
      or exists (select 1 from public.flows fl
                  join public.flow_collaborators c on c.flow_id = fl.id
                  where fl.folder_id = p_folder_id and c.user_id = auth.uid());
$$;
grant execute on function public.has_folder_access(uuid) to anon, authenticated;

-- Replace the single owner-only policy with per-action policies.
drop policy if exists flow_folders_all    on public.flow_folders;
drop policy if exists flow_folders_select on public.flow_folders;
drop policy if exists flow_folders_insert on public.flow_folders;
drop policy if exists flow_folders_update on public.flow_folders;
drop policy if exists flow_folders_delete on public.flow_folders;

-- Owner or a collaborator on one of the folder's flows can read the row...
create policy flow_folders_select on public.flow_folders for select to authenticated
  using (public.has_folder_access(id));
-- ...and update it (so the shared Send doc syncs both ways).
create policy flow_folders_update on public.flow_folders for update to authenticated
  using (public.has_folder_access(id)) with check (public.has_folder_access(id));
-- Only the owner creates / deletes folders.
create policy flow_folders_insert on public.flow_folders for insert to authenticated
  with check (owner_id = auth.uid());
create policy flow_folders_delete on public.flow_folders for delete to authenticated
  using (owner_id = auth.uid());
