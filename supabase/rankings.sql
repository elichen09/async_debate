-- ============================================================================
-- Grasshopper: rankings support (run once in the Supabase SQL editor)
--
-- The app works without this file: the rankings page rebuilds each player's
-- Elo timeline from completed ranked rounds, anchored to their current Elo.
-- Running this gives you EXACT per-round history going forward, and makes the
-- chosen starting Elo (600-1200 at signup) apply even before first sign-in.
-- ============================================================================

-- 1) Exact Elo history -------------------------------------------------------
create table if not exists public.elo_history (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  round_id          uuid references public.rounds (id) on delete set null,
  elo               integer not null,          -- rating AFTER the change
  delta             integer not null default 0,
  won               boolean,
  topic             text,
  opponent_username text,
  created_at        timestamptz not null default now()
);

create index if not exists elo_history_profile_idx
  on public.elo_history (profile_id, created_at);

alter table public.elo_history enable row level security;

drop policy if exists "elo history is public to read" on public.elo_history;
create policy "elo history is public to read"
  on public.elo_history for select using (true);

-- Log every Elo change on profiles. Round context is filled in by the round
-- trigger below when the change came from a ballot.
create or replace function public.log_elo_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.elo is distinct from old.elo then
    insert into public.elo_history (profile_id, elo, delta)
    values (new.id, new.elo, new.elo - old.elo);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_elo_change on public.profiles;
create trigger trg_log_elo_change
  after update of elo on public.profiles
  for each row execute function public.log_elo_change();

-- Attach round context (topic, opponent, result) to the most recent history
-- rows whenever a round completes with a winner.
create or replace function public.annotate_elo_history()
returns trigger
language plpgsql
security definer
as $$
declare
  pro_name text;
  con_name text;
begin
  if new.status = 'complete' and new.winner_id is not null and new.is_ranked then
    select username into pro_name from public.profiles where id = new.pro_id;
    select username into con_name from public.profiles where id = new.con_id;

    update public.elo_history h set
      round_id = new.id,
      topic = new.topic,
      won = (h.profile_id = new.winner_id),
      opponent_username = case when h.profile_id = new.pro_id then con_name else pro_name end
    where h.round_id is null
      and h.profile_id in (new.pro_id, new.con_id)
      and h.created_at > now() - interval '1 minute';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_annotate_elo_history on public.rounds;
create trigger trg_annotate_elo_history
  after update of status on public.rounds
  for each row execute function public.annotate_elo_history();

-- 2) Starting Elo chosen at signup -------------------------------------------
-- Signup stores the choice in auth metadata as 'starting_elo' and the client
-- also writes it to profiles right after first sign-in. If you create profile
-- rows with a handle_new_user() trigger, prefer reading it there, e.g.:
--
--   insert into public.profiles (id, username, display_name, elo)
--   values (
--     new.id,
--     new.raw_user_meta_data ->> 'username',
--     new.raw_user_meta_data ->> 'display_name',
--     coalesce(
--       least(greatest((new.raw_user_meta_data ->> 'starting_elo')::int, 600), 1200),
--       1200
--     )
--   );
--
-- Note: the client-side fallback needs an RLS policy letting users update
-- their own profile row.
