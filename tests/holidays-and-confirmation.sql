begin;
do $$
declare staff_id uuid;client_id uuid;b public.bookings;blocked boolean;holiday date;service text;slots integer;
begin
 if private.easter_sunday(2026)<>'2026-04-05'::date or private.easter_sunday(2027)<>'2027-03-28'::date or private.easter_sunday(2028)<>'2028-04-16'::date then raise exception 'Easter incorrect';end if;
 if private.holiday_name('2026-06-04')<>'Corpo de Deus' or private.holiday_name('2027-05-27')<>'Corpo de Deus' or private.holiday_name('2027-09-14')<>'Feriado municipal da Moita' then raise exception 'Movable holiday incorrect';end if;
 if private.closed_day_reason('2026-11-25') is null or private.closed_day_reason('2026-11-29') is null or private.closed_day_reason('2026-11-26') is not null then raise exception 'Weekly closure incorrect';end if;
 select id into service from public.services where minutes=10 limit 1;
 for holiday in select day::date from generate_series(current_date,current_date+180,interval '1 day') day where private.closed_day_reason(day::date) is not null loop
  select count(*) into slots from public.available_slots(service,holiday);if slots<>0 then raise exception 'Closed day has available slots: %',holiday;end if;
 end loop;
 select user_id into staff_id from public.staff limit 1;
 select id into client_id from auth.users u where not exists(select 1 from public.staff s where s.user_id=u.id) limit 1;
 select * into b from public.bookings where status='confirmed' and starts_at>now() and private.closed_day_reason((starts_at at time zone 'Europe/Lisbon')::date) is null order by starts_at limit 1;
 if b.id is null then raise exception 'Need future normal-day booking';end if;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 update public.bookings set follow_up_sent_at=null,customer_confirmed_at=null where id=b.id;
 perform public.confirm_customer_booking(b.id);
 if not exists(select 1 from public.bookings where id=b.id and follow_up_sent_at is not null and customer_confirmed_at is not null) then raise exception 'Direct confirmation without sent marker failed';end if;
 perform public.confirm_customer_booking(b.id);
 select day::date into holiday from generate_series(current_date+1,current_date+180,interval '1 day') day where private.holiday_name(day::date) is not null and extract(isodow from day) not in(3,7) limit 1;
 select count(*) into slots from public.reschedule_slots(b.id,holiday);if slots<>0 then raise exception 'Reschedule offers holiday';end if;
 blocked:=false;
 begin perform public.reschedule_booking(b.id,holiday,'10:00');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Reschedule accepted holiday';end if;
 blocked:=false;
 begin insert into public.bookings(customer_id,service_id,customer_name,phone,starts_at,ends_at,status,booking_source) values(b.customer_id,service,b.customer_name,b.phone,(holiday+time '09:00') at time zone 'Europe/Lisbon',(holiday+time '09:10') at time zone 'Europe/Lisbon','confirmed',b.booking_source);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Direct write bypassed holiday closure';end if;
 perform set_config('request.jwt.claim.sub',client_id::text,true);blocked:=false;
 begin perform public.confirm_customer_booking(b.id);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Client can confirm as staff';end if;
end;$$;
select 'PASS: 180-day closed dates return no slots, Easter and Moita, direct confirmation without sent marker, repeat confirmation, reschedule/insert holiday blocked, client denied. Rolled back.' as result;
rollback;
