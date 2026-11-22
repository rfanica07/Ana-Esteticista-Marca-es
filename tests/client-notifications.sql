begin;
do $$
declare client_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();booking uuid:=gen_random_uuid();service text;events integer;
begin
 insert into auth.users(id,email) values(client_id,'notify-test@example.invalid'),(other_id,'notify-other@example.invalid');
 select id into service from public.services limit 1;
 insert into public.bookings(id,customer_id,service_id,customer_name,phone,starts_at,ends_at,status)
 values(booking,client_id,service,'Teste notificações','900000000',now()+interval '100 days',now()+interval '100 days 1 hour','pending');
 update public.bookings set status='confirmed' where id=booking;
 update public.bookings set status='confirmed' where id=booking;
 select count(*) into events from public.notification_events where booking_id=booking and notification_kind='client_status' and recipient_id=client_id and booking_status='confirmed';
 if events<>1 then raise exception 'Expected one confirmation, got %',events;end if;
 perform set_config('request.jwt.claim.sub',client_id::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.notification_events where booking_id=booking)<>1 then raise exception 'Client inbox isolation failed';end if;
 insert into public.push_subscriptions(endpoint,user_id,subscription) values('https://push.example.invalid/test',client_id,'{"endpoint":"https://push.example.invalid/test"}');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.notification_events where booking_id=booking) then raise exception 'Other client sees notification';end if;
 if exists(select 1 from public.push_subscriptions where user_id=client_id) then raise exception 'Other client sees push subscription';end if;
 execute 'reset role';
 if not (select relrowsecurity from pg_class where oid='public.notification_events'::regclass) then raise exception 'RLS must be enabled';end if;
end $$;
rollback;
