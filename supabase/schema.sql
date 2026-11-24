-- Apply once in the Supabase SQL Editor of a new project.
create extension if not exists btree_gist with schema extensions;
create table public.staff (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.services (id text primary key, name text not null, category text not null, minutes integer not null check(minutes between 5 and 240), price numeric(8,2) not null check(price>=0));
create table public.bookings (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id),
 service_id text not null references public.services(id), customer_name text not null check(length(customer_name) between 2 and 100),
 phone text not null check(length(phone) between 6 and 30), starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','confirmed','declined','cancelled')),
 created_at timestamptz not null default now(), check(ends_at>starts_at),
 exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&) where (status in ('pending','confirmed'))
);
create index on public.bookings(customer_id);
create table public.push_subscriptions (endpoint text primary key, user_id uuid not null references auth.users(id) on delete cascade, subscription jsonb not null, created_at timestamptz not null default now());
create table public.notification_events(id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade, delivered_at timestamptz, created_at timestamptz not null default now());
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
revoke all on public.staff,public.services,public.bookings,public.push_subscriptions,public.notification_events from anon,authenticated;
grant select on public.staff,public.services,public.bookings to authenticated;
grant select on public.services to anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.staff,public.services,public.bookings,public.push_subscriptions,public.notification_events to service_role;
create policy own_staff on public.staff for select to authenticated using(user_id=(select auth.uid()));
create policy read_services on public.services for select to anon,authenticated using(true);
create policy read_bookings on public.bookings for select to authenticated using(customer_id=(select auth.uid()) or exists(select 1 from public.staff where user_id=(select auth.uid())));
create policy staff_push on public.push_subscriptions for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.staff where user_id=(select auth.uid()))) with check(user_id=(select auth.uid()) and exists(select 1 from public.staff where user_id=(select auth.uid())) and subscription->>'endpoint'=endpoint);
create function public.available_slots(p_service text,p_day date) returns table(slot text)
language sql stable security definer set search_path='' as $$
 with service as(select minutes from public.services where id=p_service),
 times as(select t from service cross join lateral generate_series(540,1140-minutes,5) t
 where extract(isodow from p_day) in(1,2,4,5,6)
 and ((t>=540 and t+minutes<=case when extract(isodow from p_day)=6 then 780 else 720 end) or (t>=900 and t+minutes<=1140))),
 candidates as(select t, (p_day+t*interval '1 minute') at time zone 'Europe/Lisbon' as start_time from times)
 select to_char(p_day+t*interval '1 minute','HH24:MI') from candidates,service
 where p_day between (now() at time zone 'Europe/Lisbon')::date and (now() at time zone 'Europe/Lisbon')::date+180
 and start_time>now()
 and not exists(select 1 from public.bookings b where b.status in('pending','confirmed') and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)'))
 order by t;
$$;
create function public.request_booking(p_service text,p_day date,p_time text,p_name text,p_phone text) returns uuid
language plpgsql security definer set search_path='' as $$
declare booking_id uuid; start_time timestamptz; mins integer;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta para marcar.'; end if;
 if not exists(select 1 from public.available_slots(p_service,p_day) where slot=p_time) then raise exception 'Este horário já não está disponível.'; end if;
 if (select count(*) from public.bookings where customer_id=auth.uid() and created_at>now()-interval '24 hours')>=5 then raise exception 'Limite diário de pedidos atingido. Contacte a Ana.'; end if;
 select minutes into strict mins from public.services where id=p_service;
 start_time:=(p_day+p_time::time) at time zone 'Europe/Lisbon';
 insert into public.bookings(customer_id,service_id,customer_name,phone,starts_at,ends_at) values(auth.uid(),p_service,trim(p_name),trim(p_phone),start_time,start_time+mins*interval '1 minute') returning id into booking_id;
 return booking_id;
exception when exclusion_violation then raise exception 'Este horário acabou de ser reservado. Escolha outro.';
end;
$$;
create function public.set_booking_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.'; end if;
 if p_status not in('confirmed','declined','cancelled') then raise exception 'Estado inválido.'; end if;
 update public.bookings set status=p_status where id=p_id and status in('pending','confirmed');
 if not found then raise exception 'O pedido já foi alterado. Atualize a agenda.'; end if;
end;
$$;
create function public.queue_booking_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.notification_events(booking_id) values(new.id); return new; end;
$$;
create trigger booking_notification after insert on public.bookings for each row execute function public.queue_booking_notification();
revoke all on function public.available_slots(text,date),public.request_booking(text,date,text,text,text),public.set_booking_status(uuid,text),public.queue_booking_notification() from public,anon,authenticated;
grant execute on function public.available_slots(text,date) to anon,authenticated;
grant execute on function public.request_booking(text,date,text,text,text),public.set_booking_status(uuid,text) to authenticated;

insert into public.services(id,name,category,minutes,price) values
('verniz','Verniz de gel','Mãos',60,16),
('gel','Gel','Mãos',90,22),
('manicure','Manicure','Mãos',20,7.5),
('pedicure','Pedicure','Pés',40,20),
('sobrancelhas','Sobrancelhas','Rosto',10,4),
('buco','Buço','Rosto',5,3.5),
('buco-sobrancelhas','Buço e sobrancelhas','Rosto',10,7.5),
('pele','Limpeza de pele','Rosto',90,30),
('cera-pernas','Perna inteira','Cera',60,17),
('cera-virilhas','Virilhas','Cera',20,10),
('cera-axilas','Axilas','Cera',10,6.5),
('laser-pernas','Perna inteira','Laser',20,25),
('laser-axilas','Axilas','Laser',10,15),
('laser-bracos','Braços','Laser',15,15),
('laser-buco','Buço','Laser',5,10),
('laser-corpo','Corpo todo','Laser',60,50),
('laser-virilha','Virilha total','Laser',10,20);
