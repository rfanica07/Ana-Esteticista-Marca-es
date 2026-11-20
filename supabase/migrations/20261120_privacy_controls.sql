begin;
create table if not exists public.privacy_acknowledgements(
 user_id uuid not null references auth.users(id) on delete cascade,
 version text not null,
 purpose text not null check(purpose in('registration','booking')),
 acknowledged_at timestamptz not null default now(),
 primary key(user_id,version,purpose)
);
alter table public.privacy_acknowledgements enable row level security;
revoke all on public.privacy_acknowledgements from anon,authenticated;
grant select on public.privacy_acknowledgements to authenticated;
create policy read_own_privacy_ack on public.privacy_acknowledgements for select to authenticated
 using(user_id=(select auth.uid()) or exists(select 1 from public.staff where user_id=(select auth.uid())));
create or replace function public.acknowledge_privacy(p_version text,p_purpose text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 if p_version<>'2026-11-20' or p_purpose not in('registration','booking') then raise exception 'Versão do aviso inválida.'; end if;
 insert into public.privacy_acknowledgements(user_id,version,purpose) values(auth.uid(),p_version,p_purpose)
 on conflict do nothing;
end $$;
revoke all on function public.acknowledge_privacy(text,text) from public,anon;
grant execute on function public.acknowledge_privacy(text,text) to authenticated;

create or replace function private.record_registration_privacy()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.raw_user_meta_data->>'privacy_notice_version'='2026-11-20' then
 insert into public.privacy_acknowledgements(user_id,version,purpose)
 values(new.id,'2026-11-20','registration') on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.record_registration_privacy() from public,anon,authenticated;
create trigger record_registration_privacy after insert on auth.users for each row execute function private.record_registration_privacy();

create table if not exists public.data_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 request_type text not null check(request_type in('access','correction','deletion')),
 requester_email text,
 details text not null default '' check(length(details)<=2000),
 status text not null default 'pending' check(status in('pending','completed')),
 created_at timestamptz not null default now()
);
alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon,authenticated;
grant select on public.data_requests to authenticated;
create policy read_data_requests on public.data_requests for select to authenticated
 using(user_id=(select auth.uid()) or exists(select 1 from public.staff where user_id=(select auth.uid())));
create or replace function public.submit_data_request(p_type text,p_details text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 if p_type not in('access','correction','deletion') or length(p_details)>2000 then raise exception 'Pedido inválido.'; end if;
 if exists(select 1 from public.data_requests where user_id=auth.uid() and request_type=p_type and status='pending') then
  raise exception 'Já tem um pedido deste tipo em análise.';
 end if;
 insert into public.data_requests(user_id,request_type,details,requester_email) values(auth.uid(),p_type,coalesce(p_details,''),(select email from auth.users where id=auth.uid())) returning id into request_id;
 return request_id;
end $$;
revoke all on function public.submit_data_request(text,text) from public,anon;
grant execute on function public.submit_data_request(text,text) to authenticated;

create or replace function public.complete_data_request(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.'; end if;
 update public.data_requests set status='completed' where id=p_id;
end $$;
revoke all on function public.complete_data_request(uuid) from public,anon;
grant execute on function public.complete_data_request(uuid) to authenticated;

create or replace function private.retry_notification_events()
returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if not exists(select 1 from public.push_subscriptions s join public.staff t on s.user_id=t.user_id) then return; end if;
 for item in select e.id from public.notification_events e join public.bookings b on b.id=e.booking_id
 where e.delivered_at is null and e.created_at<now()-interval '2 minutes'
 and (e.processing_at is null or e.processing_at<now()-interval '2 minutes')
 and ((e.notification_kind='request' and e.created_at>now()-interval '24 hours' and b.status='pending' and b.starts_at>now())
 or (e.notification_kind='daily_agenda' and e.reminder_day=(now() at time zone 'Europe/Lisbon')::date))
 order by e.created_at limit 20 loop perform private.dispatch_notification(item.id); end loop;
end $$;
commit;