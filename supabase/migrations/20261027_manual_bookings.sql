-- Apply once to the existing Ana Esteticista project, after schema.sql.
begin;
alter table public.bookings add column booking_source text not null default 'client'
 check (booking_source in ('client','manual'));

create function public.create_staff_booking(p_service text,p_day date,p_time text,p_name text,p_phone text)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking_id uuid; start_time timestamptz; mins integer;
begin
 if auth.uid() is null or not exists(select 1 from public.staff where user_id=auth.uid()) then
  raise exception 'Acesso reservado à Ana.' using errcode='42501';
 end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100
    or p_phone is null or length(trim(p_phone)) not between 6 and 30 then
  raise exception 'Preencha o nome e o contacto da cliente.';
 end if;
 if not exists(select 1 from public.available_slots(p_service,p_day) where slot=p_time) then
  raise exception 'Este horário já não está disponível. Escolha outro.';
 end if;
 select minutes into strict mins from public.services where id=p_service;
 start_time:=(p_day+p_time::time) at time zone 'Europe/Lisbon';
 -- For a manual booking, ownership belongs to the authenticated staff member.
 -- The customer does not need an app account and is not impersonated.
 insert into public.bookings(customer_id,service_id,customer_name,phone,starts_at,ends_at,status,booking_source)
 values(auth.uid(),p_service,trim(p_name),trim(p_phone),start_time,start_time+mins*interval '1 minute','confirmed','manual')
 returning id into booking_id;
 return booking_id;
exception when exclusion_violation then
 raise exception 'Este horário acabou de ser reservado. Escolha outro.';
end;
$$;
revoke all on function public.create_staff_booking(text,date,text,text,text) from public,anon,authenticated;
grant execute on function public.create_staff_booking(text,date,text,text,text) to authenticated;

create or replace function public.queue_booking_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.booking_source='client' then
  insert into public.notification_events(booking_id) values(new.id);
 end if;
 return new;
end;
$$;
revoke all on function public.queue_booking_notification() from public,anon,authenticated;
commit;
