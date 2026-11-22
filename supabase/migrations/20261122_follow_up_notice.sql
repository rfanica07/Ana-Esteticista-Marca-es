begin;
create unique index if not exists one_follow_up_notice on public.notification_events(reminder_day) where notification_kind='follow_up';

create or replace function private.follow_up_notice_due(p_at timestamptz)
returns boolean language sql stable set search_path='' as $$
 select extract(isodow from (p_at at time zone 'Europe/Lisbon')) not in(2,6)
 and (p_at at time zone 'Europe/Lisbon')::time >= time '13:30'
 and (p_at at time zone 'Europe/Lisbon')::time < time '14:00'
$$;
revoke all on function private.follow_up_notice_due(timestamptz) from public,anon,authenticated;

create or replace function private.queue_follow_up_notice(p_at timestamptz default now())
returns void language plpgsql security definer set search_path='' as $$
declare target_day date; first_booking uuid;
begin
 if not private.follow_up_notice_due(p_at)
 or extract(minute from (p_at at time zone 'Europe/Lisbon'))<>30 then return;end if;
 target_day:=(p_at at time zone 'Europe/Lisbon')::date+1;
 select id into first_booking from public.bookings where status='confirmed'
 and (starts_at at time zone 'Europe/Lisbon')::date=target_day order by starts_at limit 1;
 if first_booking is null then return;end if;
 insert into public.notification_events(booking_id,notification_kind,reminder_day)
 values(first_booking,'follow_up',target_day)
 on conflict(reminder_day) where notification_kind='follow_up' do nothing;
end $$;
revoke all on function private.queue_follow_up_notice(timestamptz) from public,anon,authenticated;

create or replace function private.retry_notification_events()
returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
 for item in select e.id from public.notification_events e join public.bookings b on b.id=e.booking_id
 where e.delivered_at is null and e.created_at<now()-interval '2 minutes'
 and (e.processing_at is null or e.processing_at<now()-interval '2 minutes')
 and ((e.notification_kind='request' and e.created_at>now()-interval '24 hours' and b.status='pending' and b.starts_at>now()
 and exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id))
 or (e.notification_kind='daily_agenda' and e.reminder_day=(now() at time zone 'Europe/Lisbon')::date
 and exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id))
 or (e.notification_kind='follow_up' and private.follow_up_notice_due(now())
 and e.reminder_day=(now() at time zone 'Europe/Lisbon')::date+1
 and exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id))
 or (e.notification_kind='client_status' and e.created_at>now()-interval '24 hours' and e.booking_status=b.status and e.recipient_id=b.customer_id
 and exists(select 1 from public.push_subscriptions s where s.user_id=e.recipient_id)))
 order by e.created_at limit 20 loop perform private.dispatch_notification(item.id);end loop;
end $$;
-- Running every five minutes keeps the send time at 13:30 in Lisbon in both winter and summer.
select cron.schedule('ana-follow-up-notice','*/5 * * * *','select private.queue_follow_up_notice()');
commit;
