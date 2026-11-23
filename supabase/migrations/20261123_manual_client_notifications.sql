begin;
alter table public.customer_contacts add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
create or replace function private.normalize_customer_phone(value text) returns text language sql immutable set search_path='' as $$
 select case when length(digits)=9 then '351'||digits else digits end from (select regexp_replace(regexp_replace(coalesce(value,''),'[^0-9]','','g'),'^00','') digits) s;
$$;
create or replace function private.assign_manual_booking_customer() returns trigger language plpgsql security definer set search_path='' as $$
declare client_id uuid;
begin
 if new.booking_source='manual' then
 select c.customer_user_id into client_id from public.customer_contacts c where c.phone=private.normalize_customer_phone(new.phone);
 if client_id is not null and not exists(select 1 from public.staff where user_id=client_id) then new.customer_id=client_id;end if;
 end if;
 return new;
end;$$;
drop trigger if exists assign_manual_booking_customer on public.bookings;
create trigger assign_manual_booking_customer before insert on public.bookings for each row execute function private.assign_manual_booking_customer();
create or replace function public.queue_booking_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.booking_source='client' then insert into public.notification_events(booking_id) values(new.id);
 elsif new.customer_id is not null and not exists(select 1 from public.staff where user_id=new.customer_id) then
 insert into public.notification_events(booking_id,notification_kind,recipient_id,booking_status) values(new.id,'client_status',new.customer_id,new.status);
 end if;return new;
end;$$;
create or replace function private.queue_client_status_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('confirmed','declined','cancelled') and new.customer_id is not null and not exists(select 1 from public.staff where user_id=new.customer_id)
 and (new.status is distinct from old.status or (new.customer_id is distinct from old.customer_id and new.status='confirmed' and new.starts_at>now()))
 and not(new.status='cancelled' and coalesce(current_setting('ana.rescheduling',true),'')=new.id::text) then
 insert into public.notification_events(booking_id,notification_kind,recipient_id,booking_status) values(new.id,'client_status',new.customer_id,new.status);
 end if;return new;
end;$$;
drop trigger if exists client_status_notification on public.bookings;
create trigger client_status_notification after update of status,customer_id on public.bookings for each row execute function private.queue_client_status_notification();
create or replace function public.link_contact_account(p_phone text,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare client_id uuid; normalized text;
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 select id into client_id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if client_id is null or exists(select 1 from public.staff where user_id=client_id) then raise exception 'Não foi encontrada uma conta de cliente com esse email confirmado.';end if;
 normalized:=private.normalize_customer_phone(p_phone);
 update public.customer_contacts set customer_user_id=client_id where phone=normalized;
 if not found then raise exception 'Crie primeiro o contacto ou a marcação.';end if;
 update public.bookings b set customer_id=client_id where b.booking_source='manual' and private.normalize_customer_phone(b.phone)=normalized
 and exists(select 1 from public.staff where user_id=b.customer_id);
end;$$;
create or replace function public.create_staff_booking_for_account(p_service text,p_day date,p_time text,p_name text,p_phone text,p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare booking_id uuid;
begin
 booking_id:=public.create_staff_booking(p_service,p_day,p_time,p_name,p_phone);
 perform public.link_contact_account(p_phone,p_email);
 return booking_id;
end;$$;
revoke all on function private.normalize_customer_phone(text),private.assign_manual_booking_customer(),public.link_contact_account(text,text),public.create_staff_booking_for_account(text,date,text,text,text,text) from public,anon,authenticated;
grant execute on function public.link_contact_account(text,text),public.create_staff_booking_for_account(text,date,text,text,text,text) to authenticated;
commit;
