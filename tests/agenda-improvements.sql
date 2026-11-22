-- Transactional integration and authorization checks; all fixtures and queued sends roll back.
begin;
select set_config('ana.test_staff',gen_random_uuid()::text,true),set_config('ana.test_client',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('ana.test_staff')::uuid,'agenda-staff-test@example.invalid'),(current_setting('ana.test_client')::uuid,'agenda-client-test@example.invalid');
insert into public.staff(user_id) values(current_setting('ana.test_staff')::uuid);
select set_config('request.jwt.claim.sub',current_setting('ana.test_staff'),true);
set local role authenticated;
do $$
declare day date;bid uuid;block_id uuid;total integer;
begin
 day:=(now() at time zone 'Europe/Lisbon')::date+120;
 while extract(isodow from day)<>1 loop day:=day+1;end loop;
 bid:=public.create_staff_booking('verniz',day,'09:00','Teste transacional','900000001');
 begin perform public.add_agenda_block(day,'09:00',day,'10:00','Teste');raise exception 'FAIL overlapping block accepted';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 perform public.reschedule_booking(bid,day,'10:00');
 if not exists(select 1 from public.bookings where id=bid and (starts_at at time zone 'Europe/Lisbon')::time='10:00' and status='confirmed' and rescheduled_at is not null) then raise exception 'FAIL reschedule';end if;
 if exists(select 1 from public.notification_events where booking_id=bid and booking_status='cancelled') then raise exception 'FAIL transient cancellation';end if;
 perform public.mark_follow_up_sent(bid);
 if not exists(select 1 from public.bookings where id=bid and follow_up_sent_at is not null) then raise exception 'FAIL follow up mark';end if;
 perform public.reschedule_booking(bid,day,'11:00');
 if exists(select 1 from public.bookings where id=bid and follow_up_sent_at is not null) then raise exception 'FAIL stale follow up';end if;
 block_id:=public.add_agenda_block(day,'09:00',day,'10:00','Teste');
 if exists(select 1 from public.available_slots('verniz',day) where slot='09:00') then raise exception 'FAIL blocked availability';end if;
 begin perform public.create_staff_booking('verniz',day,'09:00','Teste','900000002');raise exception 'FAIL booking in block';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 perform public.remove_agenda_block(block_id);
 if not exists(select 1 from public.available_slots('verniz',day) where slot='09:00') then raise exception 'FAIL release block';end if;
 perform public.notification_health();
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('ana.test_client'),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.bookings) then raise exception 'FAIL client sees other bookings';end if;
 if exists(select 1 from public.customer_contacts) then raise exception 'FAIL client sees contacts';end if;
 if exists(select 1 from public.staff) then raise exception 'FAIL client sees staff';end if;
 if exists(select 1 from public.agenda_blocks) then raise exception 'FAIL client sees blocks';end if;
 begin perform public.notification_health();raise exception 'FAIL client admin access';exception when insufficient_privilege then null;end;
 begin perform public.add_agenda_block(current_date+120,'09:00',current_date+120,'10:00','Teste');raise exception 'FAIL client block';exception when insufficient_privilege then null;end;
 begin perform public.mark_follow_up_sent(gen_random_uuid());raise exception 'FAIL client mark';exception when insufficient_privilege then null;end;
 begin perform public.reschedule_booking(gen_random_uuid(),current_date+120,'10:00');raise exception 'FAIL client reschedule';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$
declare day date;bid uuid;
begin
 day:=(now() at time zone 'Europe/Lisbon')::date+121;while extract(isodow from day)<>2 loop day:=day+1;end loop;
 bid:=public.request_booking_accepted('verniz',day,'09:00','Teste prazo','900000003',true,'2026-11-20');
 if not exists(select 1 from public.bookings where id=bid and pending_expires_at<=now()+interval '24 hours') then raise exception 'FAIL missing expiry';end if;
 update public.bookings set pending_expires_at=now()-interval '1 minute' where id=bid;
 perform private.expire_pending_bookings();
 if not exists(select 1 from public.bookings where id=bid and status='declined' and status_reason='pending_expired') then raise exception 'FAIL expiry';end if;
 bid:=public.request_booking_accepted('verniz',day,'09:00','Teste reagendamento cliente','900000004',true,'2026-11-20');
 perform set_config('request.jwt.claim.sub',current_setting('ana.test_staff'),true);
 perform public.reschedule_booking(bid,day,'10:00');
 if (select count(*) from public.notification_events where booking_id=bid and notification_kind='client_status')<>1 then raise exception 'FAIL reschedule notification count';end if;
 if not exists(select 1 from public.notification_events where booking_id=bid and booking_status='confirmed' and recipient_id=current_setting('ana.test_client')::uuid) then raise exception 'FAIL reschedule recipient';end if;
end $$;
set local role anon;
do $$
begin
 begin perform public.notification_health();raise exception 'FAIL anonymous admin access';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.bookings;raise exception 'FAIL anonymous booking read';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: blocks, reschedule, follow-up, expiry, staff/client/anonymous isolation; rolled back' as result;
rollback;
