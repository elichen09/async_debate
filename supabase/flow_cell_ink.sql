-- ============================================================================
-- debate.fish — Manual point color on flow points (run once in SQL editor)
--
-- Adds a per-point color override for the flow outline. Points normally
-- alternate between the two side colors by indent depth; `ink` pins a point to
-- color 0 or color 1 regardless of depth (null = automatic). Synced via the
-- existing flow_cells realtime publication (no new policies needed —
-- flow_cells RLS already covers it).
-- ============================================================================

alter table public.flow_cells add column if not exists ink smallint;
