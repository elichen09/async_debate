-- ============================================================================
-- Grasshopper: email notifications (run once in the Supabase SQL editor)
--
-- Sends an email when:
--   1. someone challenges you to a round
--   2. your opponent submits a speech (incl. "all speeches in")
--   3. your round is about to be deleted (24h+ with no activity, ~24h left)
--
-- BEFORE RUNNING, do these once:
--   a. Create a free account at https://resend.com, verify your sending
--      domain, and create an API key.
--   b. Store the key in Supabase Vault (replace re_xxxx):
--        select vault.create_secret('re_xxxx', 'resend_api_key');
--   c. Edit the TWO config functions just below: your site URL and your
--      verified from-address.
-- ============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- One warning email per idle stretch; re-armed whenever a speech lands.
alter table public.rounds
  add column if not exists deletion_warning_sent boolean not null default false;

-- 0) Config — EDIT THESE TWO ---------------------------------------------------

create or replace function public.gh_site_url()
returns text language sql immutable
as $$ select 'https://YOUR-SITE-URL.com' $$;

create or replace function public.gh_from_address()
returns text language sql immutable
as $$ select 'Grasshopper <notifications@YOUR-VERIFIED-DOMAIN.com>' $$;

-- 1) Plumbing -------------------------------------------------------------------

create or replace function public.gh_html_escape(t text)
returns text language sql immutable
as $$ select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;

-- Consistent email shell so every notification looks the same.
create or replace function public.gh_email_html(heading text, body text, cta_label text, cta_url text)
returns text language sql immutable
as $$
  select '<div style="font-family:Georgia,''Times New Roman'',serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">'
      || '<p style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#3e7a3e;margin:0 0 18px;">Grasshopper</p>'
      || '<h1 style="font-size:24px;margin:0 0 14px;line-height:1.2;">' || heading || '</h1>'
      || '<div style="font-size:15px;line-height:1.6;color:#444;">' || body || '</div>'
      || case when cta_url is not null then
           '<p style="margin:26px 0 0;"><a href="' || cta_url
        || '" style="background:#3e7a3e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;display:inline-block;">'
        || coalesce(cta_label, 'Open Grasshopper') || ' &rarr;</a></p>'
         else '' end
      || '<p style="margin:30px 0 0;font-size:12px;color:#999;">You''re receiving this because you have a Grasshopper account.</p>'
      || '</div>'
$$;

create or replace function public.email_for(uid uuid)
returns text language sql security definer set search_path = public
as $$ select email from auth.users where id = uid $$;

-- Fire-and-forget send via Resend. Failures are swallowed so a broken email
-- setup can never block a speech upload or a challenge insert.
create or replace function public.send_notification_email(to_email text, subject text, body_html text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  api_key text;
begin
  if to_email is null then return; end if;
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then return; end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', public.gh_from_address(),
      'to', jsonb_build_array(to_email),
      'subject', subject,
      'html', body_html
    )
  );
exception when others then
  null;
end;
$$;

-- These would otherwise be callable by any logged-in user through PostgREST
-- (email harvesting / spam from your domain). Lock them down — triggers and
-- cron still work because trigger functions bypass the EXECUTE check.
revoke execute on function public.email_for(uuid) from anon, authenticated;
revoke execute on function public.send_notification_email(text, text, text) from anon, authenticated;

-- 2) Someone challenges you ------------------------------------------------------

create or replace function public.notify_challenge()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  opponent_id uuid;
  challenger_name text;
begin
  if new.status = 'pending' and new.challenger_id is not null then
    opponent_id := case when new.challenger_id = new.pro_id then new.con_id else new.pro_id end;
    select coalesce(nullif(display_name, ''), username) into challenger_name
      from public.profiles where id = new.challenger_id;

    perform public.send_notification_email(
      public.email_for(opponent_id),
      coalesce(challenger_name, 'Someone') || ' challenged you to a debate',
      public.gh_email_html(
        'You''ve been challenged',
        '<p><b>' || public.gh_html_escape(coalesce(challenger_name, 'Someone')) || '</b> wants to debate you'
          || case when new.is_ranked then ' in a ranked round' else '' end || ':</p>'
          || '<p style="font-style:italic;">&ldquo;' || public.gh_html_escape(new.topic) || '&rdquo;</p>',
        'Accept or decline',
        public.gh_site_url() || '/dashboard'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_challenge on public.rounds;
create trigger trg_notify_challenge
  after insert on public.rounds
  for each row execute function public.notify_challenge();

-- 3) Opponent submits a speech ---------------------------------------------------

create or replace function public.notify_speech()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  r record;
  recipient_id uuid;
  speaker_name text;
  subj text; heading text; body text; cta text;
begin
  select * into r from public.rounds where id = new.round_id;
  if r.id is null or r.pro_id is null or r.con_id is null then return new; end if;

  -- Fresh activity: re-arm the deletion warning for this round.
  update public.rounds set deletion_warning_sent = false
    where id = new.round_id and deletion_warning_sent;

  recipient_id := case when new.speaker_id = r.pro_id then r.con_id else r.pro_id end;
  select coalesce(nullif(display_name, ''), username) into speaker_name
    from public.profiles where id = new.speaker_id;
  speaker_name := coalesce(speaker_name, 'Your opponent');

  if new.speech_number >= 8 then
    subj    := 'All speeches are in';
    heading := 'All speeches are in';
    body    := '<p><b>' || public.gh_html_escape(speaker_name) || '</b> submitted the final speech on &ldquo;'
            || public.gh_html_escape(r.topic) || '&rdquo;.'
            || case when r.is_ranked then ' The round now awaits a judge.' else '' end || '</p>';
    cta     := 'View the round';
  else
    subj    := speaker_name || ' submitted a speech — your turn';
    heading := 'Your turn to speak';
    body    := '<p><b>' || public.gh_html_escape(speaker_name) || '</b> submitted speech ' || new.speech_number
            || ' of 8 on &ldquo;' || public.gh_html_escape(r.topic) || '&rdquo;. It''s your turn.</p>';
    cta     := 'Record your speech';
  end if;

  perform public.send_notification_email(
    public.email_for(recipient_id), subj,
    public.gh_email_html(heading, body, cta, public.gh_site_url() || '/round/' || r.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_speech on public.speeches;
create trigger trg_notify_speech
  after insert on public.speeches
  for each row execute function public.notify_speech();

-- 4) Round about to be deleted ----------------------------------------------------
-- The dashboard warns the debater who owes the next speech once a round has
-- been idle 24h, counting down to 48h. This emails that same player once per
-- idle stretch (the flag re-arms whenever a new speech lands).

create or replace function public.warn_expiring_rounds()
returns void language plpgsql security definer set search_path = public
as $$
declare
  r record;
  owes_id uuid;
  hours_left int;
begin
  for r in
    select rd.*,
           coalesce((select max(s.submitted_at) from public.speeches s where s.round_id = rd.id),
                    rd.created_at) as last_activity
      from public.rounds rd
     where rd.status = 'active'
       and rd.deletion_warning_sent = false
  loop
    if r.last_activity < now() - interval '24 hours' then
      -- Same turn logic as the dashboard: odd speech = first speaker's turn.
      owes_id := case
        when r.con_goes_first then
          case when coalesce(r.current_speech, 1) % 2 = 1 then r.con_id else r.pro_id end
        else
          case when coalesce(r.current_speech, 1) % 2 = 1 then r.pro_id else r.con_id end
      end;
      hours_left := greatest(0, 48 - floor(extract(epoch from (now() - r.last_activity)) / 3600)::int);

      perform public.send_notification_email(
        public.email_for(owes_id),
        'Your debate round expires in about ' || hours_left || ' hours',
        public.gh_email_html(
          'Your speech is overdue',
          '<p>Your round on &ldquo;' || public.gh_html_escape(r.topic)
            || '&rdquo; has had no activity for over a day. If you don''t submit your speech '
            || 'within about <b>' || hours_left || ' hours</b>, the round will be deleted.</p>',
          'Submit your speech',
          public.gh_site_url() || '/round/' || r.id
        )
      );
      update public.rounds set deletion_warning_sent = true where id = r.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.warn_expiring_rounds() from anon, authenticated;

-- Check hourly.
do $$ begin
  perform cron.unschedule('gh-warn-expiring-rounds');
exception when others then null;
end $$;
select cron.schedule('gh-warn-expiring-rounds', '0 * * * *', $$select public.warn_expiring_rounds()$$);

-- ---------------------------------------------------------------------------------
-- NOTE: nothing currently deletes idle rounds — the dashboard's "48h left"
-- countdown is a promise the backend doesn't keep yet. If you want idle rounds
-- actually deleted at 48h, uncomment this block (it runs in the same hourly job
-- chain). Speech audio in storage is removed too.
--
-- do $$ begin
--   perform cron.unschedule('gh-delete-expired-rounds');
-- exception when others then null;
-- end $$;
-- select cron.schedule('gh-delete-expired-rounds', '30 * * * *', $del$
--   with expired as (
--     select rd.id
--       from public.rounds rd
--      where rd.status = 'active'
--        and coalesce((select max(s.submitted_at) from public.speeches s where s.round_id = rd.id),
--                     rd.created_at) < now() - interval '48 hours'
--   ),
--   gone_files as (
--     delete from storage.objects o
--      using public.speeches s, expired e
--      where s.round_id = e.id and o.bucket_id = 'speeches' and o.name = s.storage_path
--     returning o.id
--   ),
--   gone_speeches as (
--     delete from public.speeches s using expired e where s.round_id = e.id returning s.id
--   )
--   delete from public.rounds rd using expired e where rd.id = e.id;
-- $del$);
