alter table public.notification_events alter column booking_id drop not null;
alter table public.notification_events add constraint notification_test_has_recipient check((notification_kind='device_test' and recipient_id is not null) or (notification_kind<>'device_test' and booking_id is not null));
create or replace function public.send_device_push_test() returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Entre primeiro na sua conta.' using errcode='42501';end if;
 if not exists(select 1 from public.push_subscriptions where user_id=uid) then raise exception 'Ative ou repare primeiro as notificações neste telemóvel.';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select id into result from public.notification_events where recipient_id=uid and notification_kind='device_test' and created_at>now()-interval '1 minute' order by created_at desc limit 1;
 if result is not null then return result;end if;
 insert into public.notification_events(notification_kind,recipient_id) values('device_test',uid) returning id into result;return result;
end;$$;
create or replace function public.device_push_test_status(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.notification_events;
begin
 select * into e from public.notification_events where id=p_id and notification_kind='device_test' and recipient_id=auth.uid();
 if not found then raise exception 'Teste não encontrado para esta conta.' using errcode='42501';end if;
 return jsonb_build_object('accepted',(select count(*) from public.notification_deliveries where event_id=e.id),'completed',e.delivered_at is not null,'registered_devices',(select count(*) from public.push_subscriptions where user_id=auth.uid()));
end;$$;
revoke all on function public.send_device_push_test(),public.device_push_test_status(uuid) from public,anon,authenticated;
grant execute on function public.send_device_push_test(),public.device_push_test_status(uuid) to authenticated;
create or replace function private.retry_notification_events() returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
 for item in select e.id from public.notification_events e left join public.bookings b on b.id=e.booking_id
 where e.delivered_at is null and e.created_at<now()-interval '2 minutes'
 and (e.processing_at is null or e.processing_at<now()-interval '2 minutes')
 and ((e.notification_kind='request' and e.created_at>now()-interval '24 hours' and b.status='pending' and b.starts_at>now()
 and exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id))
 or (e.notification_kind='daily_agenda' and e.reminder_day=(now() at time zone 'Europe/Lisbon')::date
 and exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id))
 or (e.notification_kind='follow_up' and private.follow_up_notice_due(now()) and e.reminder_day=(now() at time zone 'Europe/Lisbon')::date+1
 and exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id))
 or (e.notification_kind='client_status' and e.created_at>now()-interval '24 hours' and e.booking_status=b.status and e.recipient_id=b.customer_id
 and exists(select 1 from public.push_subscriptions s where s.user_id=e.recipient_id))
 or (e.notification_kind='device_test' and e.created_at>now()-interval '10 minutes'
 and exists(select 1 from public.push_subscriptions s where s.user_id=e.recipient_id)))
 order by e.created_at limit 20 loop perform private.dispatch_notification(item.id);end loop;
end;$$;
revoke all on function private.retry_notification_events() from public,anon,authenticated;
