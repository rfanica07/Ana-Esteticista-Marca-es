begin;
do $$
declare b uuid; staff_id uuid; blocked boolean:=false;
begin
 select user_id into staff_id from public.staff limit 1;
 select id into b from public.bookings where status='confirmed' and starts_at>now() limit 1;
 if b is null or staff_id is null then raise exception 'Test requires a future booking and staff account';end if;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 update public.bookings set follow_up_sent_at=null,customer_confirmed_at=null where id=b;
 begin perform public.confirm_customer_booking(b); exception when others then blocked:=true;end;
 if not blocked then raise exception 'Confirmation allowed before reminder';end if;
 perform public.mark_follow_up_sent(b);
 if (select customer_confirmed_at is not null from public.bookings where id=b) then raise exception 'Reminder confirmed automatically';end if;
 perform public.confirm_customer_booking(b);
 if (select customer_confirmed_at is null from public.bookings where id=b) then raise exception 'Explicit confirmation not saved';end if;
 update public.bookings set status='cancelled' where id=b;
 if (select customer_confirmed_at is not null from public.bookings where id=b) then raise exception 'Cancelled confirmation not cleared';end if;
 perform set_config('request.jwt.claim.sub','',true);blocked:=false;
 begin perform public.confirm_customer_booking(b);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Unauthorized confirmation permitted';end if;
end;$$;
select 'PASS: reminder required; manual confirmation; reset; staff isolation. Changes rolled back.' as result;
rollback;
