begin;
select cron.unschedule(jobid) from cron.job where jobname='ana-whatsapp-reminders';
create or replace function private.apply_data_retention(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz:=now()-interval '24 months'; booking_count integer; account_count integer; contact_count integer; booking_ids uuid[]; user_ids uuid[];
begin
 if not pg_try_advisory_xact_lock(898222) then return jsonb_build_object('skipped',true); end if;
 select coalesce(array_agg(b.id),'{}'::uuid[]) into booking_ids from public.bookings b
 where greatest(b.ends_at,b.created_at)<cutoff
 and not exists(select 1 from public.data_requests r where r.user_id=b.customer_id and r.status='pending');
 select coalesce(array_agg(u.id),'{}'::uuid[]) into user_ids from auth.users u
 where u.created_at<cutoff
 and not exists(select 1 from public.staff where user_id=u.id)
 and not exists(select 1 from public.data_requests where user_id=u.id and status='pending')
 and not exists(select 1 from public.bookings where customer_id=u.id and greatest(ends_at,created_at)>=cutoff);
 booking_count:=cardinality(booking_ids);
 account_count:=cardinality(user_ids);
 select count(*) into contact_count from public.customer_contacts c where c.updated_at<cutoff
 and not exists(select 1 from public.bookings b where not(b.id=any(booking_ids))
 and case when length(regexp_replace(regexp_replace(b.phone,'[^0-9]','','g'),'^00',''))=9
 then '351'||regexp_replace(b.phone,'[^0-9]','','g')
 else regexp_replace(regexp_replace(b.phone,'[^0-9]','','g'),'^00','') end=c.phone);
 if p_dry_run then return jsonb_build_object('dry_run',true,'bookings',booking_count,'accounts',account_count,'contacts',contact_count); end if;
 if not coalesce((select enabled from private.retention_settings where singleton),false) then
  return jsonb_build_object('enabled',false);
 end if;
 delete from public.notification_events where booking_id=any(booking_ids);
 delete from public.bookings where id=any(booking_ids);
 delete from public.customer_contacts c where c.updated_at<cutoff
 and not exists(select 1 from public.bookings b where
 case when length(regexp_replace(regexp_replace(b.phone,'[^0-9]','','g'),'^00',''))=9
 then '351'||regexp_replace(b.phone,'[^0-9]','','g')
 else regexp_replace(regexp_replace(b.phone,'[^0-9]','','g'),'^00','') end=c.phone);
 delete from public.data_requests where user_id=any(user_ids);
 delete from public.push_subscriptions where user_id=any(user_ids);
 -- Auth-owned rows such as sessions and identities are removed through existing FK cascades.
 delete from auth.users where id=any(user_ids);
 insert into private.retention_runs(deleted_bookings,deleted_accounts,deleted_contacts) values(booking_count,account_count,contact_count);
 return jsonb_build_object('dry_run',false,'bookings',booking_count,'accounts',account_count,'contacts',contact_count);
end $$;

drop function if exists public.request_booking_with_reminder(text,date,text,text,text,boolean);
drop function if exists public.create_staff_booking_with_reminder(text,date,text,text,text,boolean);
drop function if exists public.withdraw_whatsapp_reminders();
drop function if exists private.process_whatsapp_reminders();
drop table if exists public.whatsapp_reminders;
drop table if exists private.whatsapp_settings;
alter table public.bookings drop column if exists whatsapp_reminder_consent, drop column if exists reminder_consent_at;
delete from vault.secrets where name='ana_whatsapp_access_token';
commit;
