begin;
create table if not exists public.customer_contacts (
 phone text primary key,
 name text not null,
 updated_at timestamptz not null default now()
);
alter table public.customer_contacts enable row level security;
revoke all on public.customer_contacts from anon, authenticated;
grant select on public.customer_contacts to authenticated;
create policy staff_read_contacts on public.customer_contacts for select to authenticated
 using(exists(select 1 from public.staff where user_id=(select auth.uid())));

create or replace function private.save_booking_contact()
returns trigger language plpgsql security definer set search_path='' as $$
declare normalized text;
begin
 normalized:=regexp_replace(new.phone,'[^0-9]','','g');
 if normalized like '00%' then normalized:=substr(normalized,3); end if;
 if length(normalized)=9 then normalized:='351'||normalized; end if;
 if normalized<>'' then
 insert into public.customer_contacts(phone,name) values(normalized,new.customer_name)
 on conflict(phone) do update set name=excluded.name,updated_at=now();
 end if;
 return new;
end $$;
revoke all on function private.save_booking_contact() from public,anon,authenticated;
create trigger save_booking_contact after insert or update of phone,customer_name on public.bookings
for each row execute function private.save_booking_contact();
insert into public.customer_contacts(phone,name,updated_at)
 select distinct on(normalized) normalized,customer_name,created_at
 from (select customer_name,created_at,
 case when length(digits)=9 then '351'||digits else digits end as normalized
 from (select customer_name,created_at,regexp_replace(regexp_replace(phone,'[^0-9]','','g'),'^00','') as digits from public.bookings) b) c
 where normalized<>'' order by normalized,created_at desc
 on conflict(phone) do nothing;

alter table public.bookings add column if not exists whatsapp_reminder_consent boolean not null default false;
alter table public.bookings add column if not exists reminder_consent_at timestamptz;

create or replace function public.request_booking_with_reminder(
 p_service text,p_day date,p_time text,p_name text,p_phone text,p_reminder boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking uuid; digits text;
begin
 digits:=regexp_replace(regexp_replace(p_phone,'[^0-9]','','g'),'^00','');
 if p_reminder and length(digits) not between 9 and 15 then raise exception 'Indique o telefone com indicativo para receber o lembrete.'; end if;
 booking:=public.request_booking(p_service,p_day,p_time,p_name,p_phone);
 update public.bookings set whatsapp_reminder_consent=coalesce(p_reminder,false),
 reminder_consent_at=case when p_reminder then now() end where id=booking;
 return booking;
end $$;
revoke all on function public.request_booking_with_reminder(text,date,text,text,text,boolean) from public,anon;
grant execute on function public.request_booking_with_reminder(text,date,text,text,text,boolean) to authenticated;

create table if not exists private.whatsapp_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 phone_number_id text,
 template_name text,
 template_language text not null default 'pt_PT',
 send_hour integer not null default 18 check(send_hour between 8 and 20)
);
alter table private.whatsapp_settings enable row level security;
insert into private.whatsapp_settings(singleton) values(true) on conflict do nothing;
revoke all on private.whatsapp_settings from public,anon,authenticated;

create table if not exists public.whatsapp_reminders (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 starts_at timestamptz not null,
 status text not null default 'queued' check(status in('queued','submitted','accepted','failed','uncertain','cancelled')),
 request_id bigint,
 provider_message_id text,
 attempts integer not null default 0,
 last_error text,
 created_at timestamptz not null default now(),
 submitted_at timestamptz,
 unique(booking_id,starts_at)
);
alter table public.whatsapp_reminders enable row level security;
revoke all on public.whatsapp_reminders from anon,authenticated;
grant select on public.whatsapp_reminders to authenticated;
create policy staff_read_reminders on public.whatsapp_reminders for select to authenticated
 using(exists(select 1 from public.staff where user_id=(select auth.uid())));

create or replace function private.process_whatsapp_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare config private.whatsapp_settings%rowtype; token text; item record; response record; request bigint; digits text; local_now timestamp;
begin
 if not pg_try_advisory_xact_lock(898221) then return; end if;
 -- Meta accepting a message is recorded as accepted, not as delivery to the phone.
 for item in select * from public.whatsapp_reminders where status='submitted' loop
  select status_code,content,error_msg into response from net._http_response where id=item.request_id;
  if found then
   if response.status_code between 200 and 299 then
    begin
     update public.whatsapp_reminders set status='accepted',provider_message_id=(response.content::jsonb#>>'{messages,0,id}'),last_error=null where id=item.id;
    exception when others then
     update public.whatsapp_reminders set status='uncertain',last_error='Resposta inesperada do fornecedor. Verificar antes de reenviar.' where id=item.id;
    end;
   elsif response.status_code between 400 and 499 then
    update public.whatsapp_reminders set status='failed',last_error='Fornecedor recusou o envio (HTTP '||response.status_code||').' where id=item.id;
   else
    update public.whatsapp_reminders set status='uncertain',last_error='Resultado incerto. Verificar no fornecedor antes de reenviar.' where id=item.id;
   end if;
  elsif item.submitted_at<now()-interval '10 minutes' then
   update public.whatsapp_reminders set status='uncertain',last_error='Sem resposta. Verificar no fornecedor antes de reenviar.' where id=item.id;
  end if;
 end loop;
 select * into config from private.whatsapp_settings where singleton;
 if not found or not config.enabled then return; end if;
 if config.phone_number_id is null or config.phone_number_id!~'^[0-9]+$' or config.template_name is null then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='ana_whatsapp_access_token';
 if token is null then return; end if;
 local_now:=now() at time zone 'Europe/Lisbon';
 if extract(hour from local_now)<config.send_hour or extract(hour from local_now)>20 then return; end if;

 insert into public.whatsapp_reminders(booking_id,starts_at)
 select id,starts_at from public.bookings
 where status='confirmed' and whatsapp_reminder_consent
 and (starts_at at time zone 'Europe/Lisbon')::date=local_now::date+1
 on conflict(booking_id,starts_at) do nothing;
 update public.whatsapp_reminders r set status='cancelled'
 where r.status='queued' and not exists(select 1 from public.bookings b where b.id=r.booking_id and b.status='confirmed' and b.starts_at=r.starts_at and b.whatsapp_reminder_consent);

 for item in
 select r.id,b.customer_name,b.phone,b.starts_at,s.name as service_name
 from public.whatsapp_reminders r join public.bookings b on b.id=r.booking_id join public.services s on s.id=b.service_id
 where r.status='queued' and b.status='confirmed' and b.starts_at=r.starts_at and b.whatsapp_reminder_consent
 and (b.starts_at at time zone 'Europe/Lisbon')::date=local_now::date+1
 order by r.created_at limit 50
 loop
  digits:=regexp_replace(regexp_replace(item.phone,'[^0-9]','','g'),'^00','');
  if length(digits)=9 then digits:='351'||digits; end if;
  if length(digits) not between 10 and 15 then
   update public.whatsapp_reminders set status='failed',last_error='Telefone sem indicativo válido.' where id=item.id;
   continue;
  end if;
  request:=net.http_post(
   url:='https://graph.facebook.com/v27.0/'||config.phone_number_id||'/messages',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
   body:=jsonb_build_object('messaging_product','whatsapp','to',digits,'type','template',
    'template',jsonb_build_object('name',config.template_name,'language',jsonb_build_object('code',config.template_language),
    'components',jsonb_build_array(jsonb_build_object('type','body','parameters',jsonb_build_array(
     jsonb_build_object('type','text','text',item.customer_name),
     jsonb_build_object('type','text','text',to_char(item.starts_at at time zone 'Europe/Lisbon','DD/MM/YYYY')),
     jsonb_build_object('type','text','text',to_char(item.starts_at at time zone 'Europe/Lisbon','HH24:MI')),
     jsonb_build_object('type','text','text',item.service_name)))))),
   timeout_milliseconds:=10000);
  update public.whatsapp_reminders set status='submitted',request_id=request,submitted_at=now(),attempts=attempts+1 where id=item.id;
 end loop;
end $$;
revoke all on function private.process_whatsapp_reminders() from public,anon,authenticated;
select cron.schedule('ana-whatsapp-reminders','*/5 * * * *','select private.process_whatsapp_reminders()');
commit;
