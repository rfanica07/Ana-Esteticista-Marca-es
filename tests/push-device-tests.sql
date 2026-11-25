begin;
do $$
declare staff_id uuid;client_id uuid;first_id uuid;again_id uuid;blocked boolean;result jsonb;
begin
 select user_id into staff_id from public.staff limit 1;
 select s.user_id into client_id from public.push_subscriptions s where not exists(select 1 from public.staff t where t.user_id=s.user_id) limit 1;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 first_id:=public.send_device_push_test();again_id:=public.send_device_push_test();if first_id<>again_id then raise exception 'Test cooldown failed';end if;
 result:=public.device_push_test_status(first_id);if result is null then raise exception 'Missing own test status';end if;
 perform set_config('request.jwt.claim.sub',client_id::text,true);blocked:=false;
 begin perform public.device_push_test_status(first_id);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Client can read staff test';end if;
 first_id:=public.send_device_push_test();if not exists(select 1 from public.notification_events where id=first_id and notification_kind='device_test' and recipient_id=client_id and booking_id is null) then raise exception 'Test not scoped to own account';end if;
 perform set_config('request.jwt.claim.sub','',true);blocked:=false;
 begin perform public.send_device_push_test();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous can trigger a test';end if;
end;$$;
select 'PASS: own-device test, one-minute cooldown, staff/client isolation and anonymous denial. All rolled back.' as result;
rollback;
