begin;
do $$
declare item record; local_day date; simulated_at timestamptz; client_id uuid:=gen_random_uuid(); booking uuid:=gen_random_uuid(); service text; event_count integer;
begin
 for item in select d::date as day from generate_series(date '2026-11-22',date '2026-11-28',interval '1 day') d loop
  if private.follow_up_notice_due((item.day+time '13:30') at time zone 'Europe/Lisbon') is distinct from (extract(isodow from item.day) not in(2,6)) then
   raise exception 'Weekday exclusion failed: %',item.day;end if;
 end loop;
 if private.follow_up_notice_due('2026-11-23 13:29:00+00') or private.follow_up_notice_due('2026-11-23 14:00:00+00') then raise exception 'Window boundaries failed';end if;
 if not private.follow_up_notice_due('2026-07-06 12:30:00+00') or private.follow_up_notice_due('2026-07-06 13:30:00+00') then raise exception 'Lisbon summer time failed';end if;
 local_day:=date_trunc('week',current_date+interval '100 years')::date;
 simulated_at:=(local_day+time '13:30') at time zone 'Europe/Lisbon';
 perform private.queue_follow_up_notice(simulated_at);
 if exists(select 1 from public.notification_events where notification_kind='follow_up' and reminder_day=local_day+1) then raise exception 'Queued without appointments';end if;
 insert into auth.users(id,email) values(client_id,'followup-notice-test@example.invalid');
 select id into service from public.services order by minutes limit 1;
 insert into public.bookings(id,customer_id,service_id,customer_name,phone,starts_at,ends_at,status)
 values(booking,client_id,service,'Teste lembrete','900000000',((local_day+1)+time '09:00') at time zone 'Europe/Lisbon',((local_day+1)+time '09:10') at time zone 'Europe/Lisbon','confirmed');
 perform private.queue_follow_up_notice(simulated_at+interval '5 minutes');
 if exists(select 1 from public.notification_events where notification_kind='follow_up' and reminder_day=local_day+1) then raise exception 'Queued after scheduled minute';end if;
 perform private.queue_follow_up_notice(simulated_at);
 perform private.queue_follow_up_notice(simulated_at+interval '30 seconds');
 select count(*) into event_count from public.notification_events where notification_kind='follow_up' and reminder_day=local_day+1;
 if event_count<>1 then raise exception 'Expected exactly one notice, found %',event_count;end if;
 if has_function_privilege('authenticated','private.queue_follow_up_notice(timestamptz)','execute') then raise exception 'Client must not run scheduler';end if;
end $$;
rollback;
