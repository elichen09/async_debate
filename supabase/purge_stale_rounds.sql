-- ============================================================================
-- debate.fish — Purge stale rounds (run once to create; call on a schedule)
--
-- Deletes every round whose most recent activity is older than a cutoff (default
-- 48h), along with its speeches and chat messages — DB rows only; the audio files
-- in storage are left in place. "Last activity" = the round's newest speech
-- (speeches.submitted_at), or the round's created_at if it has no speeches yet —
-- matching how the app already computes staleness.
--
-- SECURITY DEFINER so it runs with the owner's rights (bypassing RLS); only the
-- owner (and whoever you grant it to) can call it.
-- ============================================================================

create or replace function public.purge_stale_rounds(p_max_age interval default interval '48 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - p_max_age;
  v_ids    uuid[];
begin
  -- Rounds with no activity since the cutoff.
  select array_agg(r.id)
    into v_ids
  from public.rounds r
  left join lateral (
    select max(s.submitted_at) as last_speech
    from public.speeches s
    where s.round_id = r.id
  ) act on true
  where coalesce(act.last_speech, r.created_at) < v_cutoff;

  if v_ids is null then
    return 0;
  end if;

  -- Detach any tournament match from the round being removed (keep the bracket
  -- slot; just clear its round link). round_id is nullable — matches exist before
  -- a round is assigned.
  update public.tournament_matches set round_id = null where round_id = any(v_ids);

  -- Child rows, then the rounds themselves. (If other tables reference rounds(id)
  -- with ON DELETE CASCADE, those go automatically with the final delete.) Audio
  -- files in the storage bucket are intentionally left untouched.
  delete from public.speeches       where round_id = any(v_ids);
  delete from public.round_messages where round_id = any(v_ids);
  delete from public.rounds         where id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

-- Run it on demand (returns how many rounds were deleted):
--   select public.purge_stale_rounds();              -- 48h default
--   select public.purge_stale_rounds(interval '7 days');

-- Or schedule it hourly with pg_cron (enable the extension first in Database →
-- Extensions):
--   select cron.schedule('purge-stale-rounds', '0 * * * *',
--                        $$ select public.purge_stale_rounds(); $$);
