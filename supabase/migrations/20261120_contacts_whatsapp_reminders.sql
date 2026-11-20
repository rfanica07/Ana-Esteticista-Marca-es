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

commit;
