begin;
do $$
declare client_id uuid:=gen_random_uuid();service text;day date;slot_time text;booking uuid;
begin
 insert into auth.users(id,email) values(client_id,'booking-privacy-test@example.invalid');
 select id into service from public.services order by minutes limit 1;
 select d::date into day from generate_series(current_date+1,current_date+7,interval '1 day') d where extract(isodow from d) in(1,2,4,5,6) limit 1;
 select slot into slot_time from public.available_slots(service,day) limit 1;
 perform set_config('request.jwt.claim.sub',client_id::text,true);
 execute 'set local role authenticated';
 begin
  perform public.request_booking_accepted(service,day,slot_time,'Teste privacidade','912345678',false,'2026-11-20');
  raise exception 'Booking accepted without privacy acceptance';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.request_booking(service,day,slot_time,'Teste privacidade','912345678');
  raise exception 'Legacy booking bypass allowed';
 exception when insufficient_privilege then null;end;
 booking:=public.request_booking_accepted(service,day,slot_time,'Teste privacidade','912345678',true,'2026-11-20');
 if not exists(select 1 from public.bookings where id=booking and privacy_notice_version='2026-11-20' and privacy_accepted_at is not null) then raise exception 'Acceptance receipt missing';end if;
 execute 'reset role';
end $$;
rollback;
