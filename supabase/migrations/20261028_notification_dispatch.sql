-- Server-only webhook credential stays inside Vault.
create extension if not exists pg_net;
create extension if not exists pg_cron;
do $$ begin
 if not exists(select 1 from vault.secrets where name='ana_notification_dispatch') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'ana_notification_dispatch');
 end if;
end $$;

create or replace function public.verify_notification_dispatch(p_secret text)
returns boolean language sql security definer set search_path='' as $$
 select p_secret is not null and exists(
 select 1 from vault.decrypted_secrets where name='ana_notification_dispatch' and decrypted_secret=p_secret)
$$;
revoke all on function public.verify_notification_dispatch(text) from public, anon, authenticated;
grant execute on function public.verify_notification_dispatch(text) to service_role;

alter table public.notification_events add column if not exists processing_at timestamptz;
create table if not exists public.notification_deliveries(
 event_id uuid not null references public.notification_events(id) on delete cascade,
 endpoint text not null,
 delivered_at timestamptz not null default now(),
 primary key(event_id,endpoint)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon,authenticated;
grant all on public.notification_deliveries to service_role;

create or replace function public.claim_notification(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.notification_events set processing_at=now()
 where id=p_id and delivered_at is null and (processing_at is null or processing_at<now()-interval '2 minutes');
 return found;
end $$;
revoke all on function public.claim_notification(uuid) from public,anon,authenticated;
grant execute on function public.claim_notification(uuid) to service_role;

create or replace function private.dispatch_notification(p_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='ana_notification_dispatch';
 if secret is null then return null; end if;
 return net.http_post(
 url:='https://ozvfedllkbzhdgznwvpu.supabase.co/functions/v1/notify',
 headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',secret),
 body:=jsonb_build_object('type','INSERT','table','notification_events','schema','public','record',jsonb_build_object('id',p_id)),
 timeout_milliseconds:=10000);
end $$;
revoke all on function private.dispatch_notification(uuid) from public,anon,authenticated;

create or replace function private.send_notification_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.dispatch_notification(new.id);
 return new;
exception when others then
 -- The durable event remains queued even if network enqueue fails.
 return new;
end $$;
revoke all on function private.send_notification_event() from public,anon,authenticated;
create trigger dispatch_notification_event after insert on public.notification_events
for each row execute function private.send_notification_event();

create or replace function private.retry_notification_events()
returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if not exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id) then return; end if;
 for item in
  select e.id from public.notification_events e join public.bookings b on b.id=e.booking_id
  where e.delivered_at is null and e.created_at<now()-interval '2 minutes'
  and e.created_at>now()-interval '24 hours' and b.status='pending' and b.starts_at>now()
  and (e.processing_at is null or e.processing_at<now()-interval '2 minutes')
  order by e.created_at limit 20
 loop perform private.dispatch_notification(item.id); end loop;
end $$;
revoke all on function private.retry_notification_events() from public,anon,authenticated;
select cron.schedule('ana-retry-notifications','*/2 * * * *','select private.retry_notification_events()');

create index if not exists notification_events_pending_idx on public.notification_events(created_at) where delivered_at is null;
create index if not exists notification_events_booking_idx on public.notification_events(booking_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
