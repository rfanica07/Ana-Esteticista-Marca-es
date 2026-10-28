begin;
do $$
declare staff_id uuid:=gen_random_uuid(); client_id uuid:=gen_random_uuid(); service_id text; day date; slot_time text; booking uuid; denied boolean:=false; manual_count integer;
begin
 insert into auth.users(id,email) values(staff_id,'ana-test-staff@example.invalid'),(client_id,'ana-test-client@example.invalid');
 insert into public.staff values(staff_id);
 select id into service_id from public.services order by minutes limit 1;
 select d::date into day from generate_series(current_date+1,current_date+7,interval '1 day') d where extract(isodow from d) in(1,2,4,5,6) limit 1;
 select slot into slot_time from public.available_slots(service_id,day) limit 1;
 perform set_config('request.jwt.claim.sub',client_id::text,true);
 begin
  perform public.create_staff_booking(service_id,day,slot_time,'Teste','900000000');
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'Non-staff gained access'; end if;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 booking:=public.create_staff_booking(service_id,day,slot_time,'Teste','900000000');
 if not exists(select 1 from public.bookings where id=booking and status='confirmed' and booking_source='manual' and customer_id=staff_id) then raise exception 'Manual booking incorrect'; end if;
 if exists(select 1 from public.notification_events where booking_id=booking) then raise exception 'Manual notification generated'; end if;
 if exists(select 1 from public.available_slots(service_id,day) where slot=slot_time) then raise exception 'Reserved slot still available'; end if;
 perform public.set_booking_status(booking,'cancelled');
 if not exists(select 1 from public.available_slots(service_id,day) where slot=slot_time) then raise exception 'Cancelled slot not released'; end if;
 perform set_config('request.jwt.claim.sub',client_id::text,true);
 booking:=public.request_booking(service_id,day,slot_time,'Teste','900000000');
 if not exists(select 1 from public.notification_events where booking_id=booking) then raise exception 'Client event missing'; end if;
 if not exists(select 1 from net.http_request_queue where convert_from(body,'UTF8')::jsonb->'record'->>'id'=(select id::text from public.notification_events where booking_id=booking)) then raise exception 'Dispatch not queued'; end if;
end $$;
rollback;