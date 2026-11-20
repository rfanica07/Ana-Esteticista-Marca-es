begin;
do $$
declare old_user uuid:=gen_random_uuid(); old_staff uuid:=gen_random_uuid(); booking uuid; service text; result jsonb;
begin
 insert into auth.users(id,email,created_at) values(old_user,'retention-test@example.invalid',now()-interval '25 months'),(old_staff,'retention-staff@example.invalid',now()-interval '25 months');
 insert into public.staff(user_id) values(old_staff);
 select id into service from public.services order by minutes limit 1;
 insert into public.bookings(customer_id,service_id,customer_name,phone,starts_at,ends_at,status,booking_source,created_at)
 values(old_user,service,'Teste conservação','912345678',now()-interval '25 months',now()-interval '25 months'+interval '5 minutes','confirmed','manual',now()-interval '25 months') returning id into booking;
 update public.customer_contacts set updated_at=now()-interval '25 months' where phone='351912345678';
 result:=private.apply_data_retention(true);
 if (result->>'accounts')::integer<>1 or (result->>'bookings')::integer<>1 or (result->>'contacts')::integer<>1 then raise exception 'Unexpected retention candidates: %',result; end if;
 insert into public.data_requests(user_id,request_type,details) values(old_user,'access','Teste retenção');
 result:=private.apply_data_retention(true);
 if (result->>'accounts')::integer<>0 or (result->>'bookings')::integer<>0 then raise exception 'Pending rights request did not suspend cleanup'; end if;
 delete from public.data_requests where user_id=old_user;
 update private.retention_settings set enabled=true where singleton;
 result:=private.apply_data_retention(false);
 if exists(select 1 from auth.users where id=old_user) then raise exception 'Inactive account retained'; end if;
 if exists(select 1 from public.bookings where id=booking) then raise exception 'Old booking retained'; end if;
 if exists(select 1 from public.customer_contacts where phone='351912345678') then raise exception 'Old contact retained'; end if;
 if not exists(select 1 from auth.users where id=old_staff) then raise exception 'Staff account deleted'; end if;
end $$;
rollback;