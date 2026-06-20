-- ============================================================================
-- debate.fish — Disable the idle-round cleanup (run once in the SQL editor)
--
-- Stops the cron job(s) that delete rounds idle for 48h. Rounds are no longer
-- auto-deleted by inactivity. The purge function itself is left in place (it just
-- never runs); drop it too if you want — see the bottom.
-- ============================================================================

-- Unschedule whichever cleanup job(s) exist (ignore if a name isn't scheduled).
do $$ begin
  perform cron.unschedule('gh-delete-expired-rounds');
exception when others then null;
end $$;

do $$ begin
  perform cron.unschedule('purge-stale-rounds');
exception when others then null;
end $$;

-- Verify nothing round-cleanup-related is still scheduled:
--   select jobname, schedule, command from cron.job;

-- Optional: also remove the function entirely (only if you don't plan to run it
-- manually). Leaving it is harmless since nothing calls it now.
--   drop function if exists public.purge_stale_rounds(interval);
