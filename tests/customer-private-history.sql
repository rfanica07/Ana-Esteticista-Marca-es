begin;
do $$
declare staff_id uuid;client_id uuid;b public.bookings;test_phone text;v timestamptz;old_v timestamptz;new_id uuid;blocked boolean;
begin
 select user_id into staff_id from public.staff limit 1;
 select id into client_id from auth.users u where not exists(select 1 from public.staff s where s.user_id=u.id) limit 1;
 select * into b from public.bookings where status='confirmed' and starts_at<now() limit 1;
 test_phone:=private.normalize_customer_phone(b.phone);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 select updated_at into v from public.customer_private_profiles where customer_private_profiles.phone=test_phone;
 perform public.save_customer_private_profile(test_phone,'Teste transacional — avisou antes.','full',v);
 if not exists(select 1 from public.customer_private_profiles p where p.phone=test_phone and p.payment_policy='full') then raise exception 'Profile not saved';end if;
 select updated_at into old_v from public.customer_private_profiles p where p.phone=test_phone;
 perform public.save_customer_private_profile(test_phone,'Teste transacional','full',old_v);
 blocked:=false;
 begin perform public.save_customer_private_profile(test_phone,'Stale','none',old_v);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Stale profile save accepted';end if;
 insert into public.bookings(customer_id,service_id,customer_name,phone,starts_at,ends_at,status,booking_source)
 values(b.customer_id,b.service_id,b.customer_name,b.phone,b.starts_at,b.ends_at,'cancelled',b.booking_source) returning id into new_id;
 if not exists(select 1 from public.booking_financials where booking_id=new_id and deposit_required and deposit_percent=100 and deposit_amount=0) then raise exception 'New booking did not inherit full advance requirement';end if;
 select updated_at into v from public.booking_financials where booking_id=b.id;
 perform public.save_booking_financials(b.id,'no_show',20,true,true,current_date,false,null,v,100);
 if not exists(select 1 from public.booking_financials where booking_id=b.id and deposit_amount=20 and balance_amount=0 and attendance='no_show') then raise exception 'Full advance wrong';end if;
 select updated_at into v from public.booking_financials where booking_id=b.id;
 perform public.save_booking_financials(b.id,'attended',20,true,true,current_date,true,current_date,v,100);
 if (select sum(amount) from public.booking_payment_entries where booking_id=b.id)<>20 then raise exception 'Full advance counted twice';end if;
 perform set_config('request.jwt.claim.sub',client_id::text,true);blocked:=false;
 begin perform public.save_customer_private_profile(test_phone,'Client note','full',null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Client can write private history';end if;
 perform set_config('ana.test_client_id',client_id::text,true);
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('ana.test_client_id'),true);
do $$begin if exists(select 1 from public.customer_private_profiles) then raise exception 'Private notes exposed to client';end if;end;$$;
reset role;
select 'PASS: private profile, stale version rejection, inherited full advance, full advance without double count, client denial. All rolled back.' as result;
rollback;
