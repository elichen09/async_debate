-- ============================================================================
-- debate.fish — Argument status marks on flow points (run once in SQL editor)
--
-- Adds a per-point status (dropped / extended / turn / answered / conceded) used
-- by the flow outline. Nullable text; synced via the existing flow_cells realtime
-- publication (no new policies needed — flow_cells RLS already covers it).
-- ============================================================================

alter table public.flow_cells add column if not exists status text;
