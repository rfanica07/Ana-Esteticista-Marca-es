begin;
alter table public.notification_events add column if not exists recipient_id uuid references auth.users(id) on delete cascade;
alter table public.notification_events add column if not exists booking_status text;
create index if not exists client_notification_inbox on public.notification_events(recipient_id,created_at desc) where notification_kind='client_status';
grant select on public.notification_events to authenticated;
create policy client_read_notifications on public.notification_events for select to authenticated
 using(recipient_id=(select auth.uid()) and notification_kind='client_status');
-- A subscription is private to its authenticated owner, for staff and clients alike.
create policy own_push on public.push_subscriptions for all to authenticated
 using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()) and subscription->>'endpoint'=endpoint);
create or replace function private.queue_client_status_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status in('confirmed','declined','cancelled') and new.customer_id is not null then
  insert into public.notification_events(booking_id,notification_kind,recipient_id,booking_status)
  values(new.id,'client_status',new.customer_id,new.status);
 end if;
 return new;
end $$;
revoke all on function private.queue_client_status_notification() from public,anon,authenticated;
create trigger client_status_notification after update of status on public.bookings for each row execute function private.queue_client_status_notification();
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
 or (e.notification_kind='client_status' and e.created_at>now()-interval '24 hours' and e.booking_status=b.status and e.recipient_id=b.customer_id
 and exists(select 1 from public.push_subscriptions s where s.user_id=e.recipient_id)))
 order by e.created_at limit 20 loop perform private.dispatch_notification(item.id);end loop;
end $$;
commit;
