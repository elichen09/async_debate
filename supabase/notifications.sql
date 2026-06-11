-- ============================================================================
-- Grasshopper: round cleanup (run once in the Supabase SQL editor)
--
-- Deletes rounds (+ speeches + storage audio) that have been idle 48h.
-- No email system — just the cron deletion job.
-- ============================================================================

create extension if not exists pg_cron;

-- Used by the deletion warning re-arm logic when a new speech lands.
alter table public.rounds
  add column if not exists deletion_warning_sent boolean not null default false;

-- Deletes rounds (+ their speeches and storage audio) that have been idle 48h.
do $$ begin
  perform cron.unschedule('gh-delete-expired-rounds');
exception when others then null;
end $$;
select cron.schedule('gh-delete-expired-rounds', '30 * * * *', $del$
  with expired as (
    select rd.id
      from public.rounds rd
     where rd.status = 'active'
       and coalesce((select max(s.submitted_at) from public.speeches s where s.round_id = rd.id),
                    rd.created_at) < now() - interval '48 hours'
  ),
  gone_speeches as (
    delete from public.speeches s using expired e where s.round_id = e.id returning s.id
  )
  delete from public.rounds rd using expired e where rd.id = e.id;
$del$);
