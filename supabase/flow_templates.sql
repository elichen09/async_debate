-- ============================================================================
-- debate.fish — Flow templates (run once in the Supabase SQL editor)
--
-- A template is a saved copy of a flow's outline (its points as JSON) that can
-- seed new flows: "Save as template" in a flow's tools menu, "From template"
-- in the sidebar. Private to their owner, like snippets. Fetched on demand —
-- no realtime needed.
-- ============================================================================

create table if not exists public.flow_templates (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null default 'Template',
  side       text check (side in ('aff', 'neg')),
  points     jsonb not null default '[]'::jsonb,   -- [{content, depth, highlighted, status, ink}]
  created_at timestamptz not null default now()
);

create index if not exists flow_templates_owner_idx on public.flow_templates(owner_id);

alter table public.flow_templates enable row level security;
drop policy if exists flow_templates_all on public.flow_templates;
create policy flow_templates_all on public.flow_templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
