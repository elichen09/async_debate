-- ============================================================================
-- debate.fish — Send doc persistence + block grouping (run once in the SQL editor)
--
-- 1) A shared, persisted "Send doc": lives on the FOLDER when a flow is in one (so
--    every flow in that folder opens the same Send doc), else on the FLOW itself.
--    Both stream via Realtime so building the doc from one flow shows in the others.
-- 2) Block grouping: flow_snippets.parent_id nests "---AT: X" sub-blocks under
--    their parent block (e.g. "AT: Neg util") in the Extensions library.
-- ============================================================================

alter table public.flows        add column if not exists send_html text not null default '';
alter table public.flow_folders add column if not exists send_html text not null default '';

-- Stream Send doc edits stored on the folder row between a folder's flows.
do $$ begin
  alter publication supabase_realtime add table public.flow_folders;
exception when duplicate_object then null;
end $$;
alter table public.flow_folders replica identity full;

-- Parent block id for grouped sub-blocks (no FK: a deleted parent just leaves its
-- children ungrouped, which the UI renders as top-level).
alter table public.flow_snippets add column if not exists parent_id uuid;
