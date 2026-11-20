begin;
alter table public.notification_events add column if not exists notification_kind text not null default 'request';
alter table public.notification_events add column if not exists reminder_day date;
create unique index if not exists one_daily_agenda_notice on public.notification_events(reminder_day) where notification_kind='daily_agenda';

create or replace function private.queue_daily_agenda()
returns void language plpgsql security definer set search_path='' as $$
declare local_now timestamp; first_booking uuid;
begin
 local_now:=now() at time zone 'Europe/Lisbon';
 if extract(hour from local_now)<>8 then return; end if;
 if not exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id) then return; end if;
 select id into first_booking from public.bookings where status='confirmed'
 and (starts_at at time zone 'Europe/Lisbon')::date=local_now::date order by starts_at limit 1;
 if first_booking is null then return; end if;
 insert into public.notification_events(booking_id,notification_kind,reminder_day)
 values(first_booking,'daily_agenda',local_now::date)
 on conflict(reminder_day) where notification_kind='daily_agenda' do nothing;
end $$;
revoke all on function private.queue_daily_agenda() from public,anon,authenticated;
select cron.schedule('ana-daily-agenda','*/5 * * * *','select private.queue_daily_agenda()');

create or replace function public.create_staff_booking_with_reminder(
 p_service text,p_day date,p_time text,p_name text,p_phone text,p_reminder boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking uuid;
begin
 booking:=public.create_staff_booking(p_service,p_day,p_time,p_name,p_phone);
 update public.bookings set whatsapp_reminder_consent=coalesce(p_reminder,false),
 reminder_consent_at=case when p_reminder then now() end where id=booking;
 return booking;
end $$;
revoke all on function public.create_staff_booking_with_reminder(text,date,text,text,text,boolean) from public,anon;
grant execute on function public.create_staff_booking_with_reminder(text,date,text,text,text,boolean) to authenticated;
commit;