-- ============================================================================
-- debate.fish — Folder aff/neg font colors (run once in the Supabase SQL editor)
--
-- Two hex-color columns on flow_folders: every flow in a folder is tinted by
-- its side (aff flows one color, neg flows the other), set from the workspace's
-- ⋯ menu → "Aff & neg colors". Null = the theme's default depth colors.
--
-- No policy changes needed: the folder owner already has full CRUD on their
-- folder rows (flow_folders_all in flows.sql), the master's update policy comes
-- from flow_access.sql, and flow_folders is already in the realtime publication
-- so color changes stream to open workspaces like Send-doc edits do.
-- ============================================================================

alter table public.flow_folders add column if not exists aff_color text;
alter table public.flow_folders add column if not exists neg_color text;
