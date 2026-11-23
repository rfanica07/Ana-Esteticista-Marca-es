begin;
do $$
declare staff_id uuid; client_id uuid; service_id text; target_day date; target_time text; first_id uuid; second_id uuid; blocked boolean:=false;
begin
 select user_id into staff_id from public.staff limit 1;
 select id into client_id from auth.users where lower(email)='rfanica07@gmail.com' and email_confirmed_at is not null;
 if staff_id is null or client_id is null then raise exception 'Required test accounts missing';end if;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 select s.id,d::date,a.slot into service_id,target_day,target_time from public.services s cross join generate_series(current_date+1,current_date+30,interval '1 day') d cross join lateral public.available_slots(s.id,d::date) a limit 1;
 if service_id is null then raise exception 'No test slot available';end if;
 first_id:=public.create_staff_booking_for_account(service_id,target_day,target_time,'Notification test','900111222','rfanica07@gmail.com');
 if (select customer_id<>client_id from public.bookings where id=first_id) then raise exception 'Wrong booking recipient';end if;
 if (select count(*) from public.notification_events where booking_id=first_id and notification_kind='client_status' and recipient_id=client_id and booking_status='confirmed')<>1 then raise exception 'Missing or duplicate creation notice';end if;
 perform public.set_booking_status(first_id,'cancelled');
 if (select count(*) from public.notification_events where booking_id=first_id and notification_kind='client_status' and recipient_id=client_id and booking_status='cancelled')<>1 then raise exception 'Missing cancellation notice';end if;
 second_id:=public.create_staff_booking(service_id,target_day,target_time,'Notification test','900111222');
 if (select customer_id<>client_id from public.bookings where id=second_id) then raise exception 'Saved contact account not reused';end if;
 if (select count(*) from public.notification_events where booking_id=second_id and recipient_id=client_id)<>1 then raise exception 'Missing repeat booking notice';end if;
 perform set_config('request.jwt.claim.sub',client_id::text,true);
 begin perform public.link_contact_account('900111222','rfanica07@gmail.com');exception when others then blocked:=true;end;
 if not blocked then raise exception 'Client can change contact ownership';end if;
end;$$;
select 'PASS: manual creation, cancellation, saved contact identity, staff isolation; all changes rolled back.' as result;
rollback;
