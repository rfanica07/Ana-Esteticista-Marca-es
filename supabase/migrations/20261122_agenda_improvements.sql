begin;
alter table public.bookings add column if not exists pending_expires_at timestamptz;
alter table public.bookings add column if not exists status_reason text;
alter table public.bookings add column if not exists rescheduled_at timestamptz;
alter table public.bookings add column if not exists follow_up_sent_at timestamptz;
update public.bookings set pending_expires_at=least(starts_at,now()+interval '24 hours') where status='pending' and pending_expires_at is null;
create table if not exists public.agenda_blocks(id uuid primary key default gen_random_uuid(), starts_at timestamptz not null, ends_at timestamptz not null, reason text not null check(length(reason) between 1 and 160), active boolean not null default true, created_at timestamptz not null default now(), check(ends_at>starts_at));
alter table public.agenda_blocks enable row level security;
revoke all on public.agenda_blocks from public,anon,authenticated;
grant select on public.agenda_blocks to authenticated;
create policy staff_read_blocks on public.agenda_blocks for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
create or replace function private.expire_pending_bookings() returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(771122);
 update public.bookings set status='declined',status_reason='pending_expired' where status='pending' and pending_expires_at<=now();
end $$;
revoke all on function private.expire_pending_bookings() from public,anon,authenticated;
create or replace function public.available_slots(p_service text,p_day date) returns table(slot text) language sql stable security definer set search_path='' as $$
 with service as(select minutes from public.services where id=p_service), times as(select t from service cross join lateral generate_series(540,1140-minutes,5) t where extract(isodow from p_day) in(1,2,4,5,6) and ((t>=540 and t+minutes<=case when extract(isodow from p_day)=6 then 780 else 720 end) or (t>=900 and t+minutes<=1140))), candidates as(select t,(p_day+t*interval '1 minute') at time zone 'Europe/Lisbon' as start_time from times)
 select to_char(p_day+t*interval '1 minute','HH24:MI') from candidates,service where p_day between (now() at time zone 'Europe/Lisbon')::date and (now() at time zone 'Europe/Lisbon')::date+180 and start_time>now()
 and not exists(select 1 from public.bookings b where (b.status='confirmed' or (b.status='pending' and (b.pending_expires_at is null or b.pending_expires_at>now()))) and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)'))
 and not exists(select 1 from public.agenda_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)')) order by t
$$;
create or replace function private.guard_agenda_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(771122);
 if new.status not in('pending','confirmed') then return new; end if;
 if tg_op='INSERT' then
  perform private.expire_pending_bookings();
  if new.status='pending' then new.pending_expires_at:=least(new.starts_at,now()+interval '24 hours');end if;
 end if;
 if exists(select 1 from public.agenda_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'Este horário foi bloqueado pela Ana. Escolha outro.';end if;
 return new;
end $$;
revoke all on function private.guard_agenda_booking() from public,anon,authenticated;
create trigger guard_agenda_booking before insert or update of starts_at,ends_at,status on public.bookings for each row execute function private.guard_agenda_booking();
create or replace function public.set_booking_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 perform private.expire_pending_bookings();
 if p_status not in('confirmed','declined','cancelled') then raise exception 'Estado inválido.';end if;
 update public.bookings set status=p_status,status_reason=null where id=p_id and starts_at>now() and status in('pending','confirmed');
 if not found then raise exception 'Este pedido expirou, já foi alterado ou já passou. Atualize a agenda.';end if;
end $$;
create or replace function public.add_agenda_block(p_from date,p_start time,p_until date,p_end time,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare first_at timestamptz;last_at timestamptz;result uuid;
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 perform private.expire_pending_bookings();
 first_at:=(p_from+p_start) at time zone 'Europe/Lisbon';last_at:=(p_until+p_end) at time zone 'Europe/Lisbon';
 if first_at is null or last_at is null or last_at<=first_at or p_reason is null or length(trim(p_reason)) not between 1 and 160 then raise exception 'Preencha um intervalo válido e o motivo.';end if;
 if exists(select 1 from public.bookings b where b.status in('pending','confirmed') and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(first_at,last_at,'[)')) then raise exception 'Há marcações neste intervalo. Reagende ou cancele primeiro.';end if;
 insert into public.agenda_blocks(starts_at,ends_at,reason) values(first_at,last_at,trim(p_reason)) returning id into result;return result;
end $$;
create or replace function public.remove_agenda_block(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(771122);update public.agenda_blocks set active=false where id=p_id;
end $$;
create or replace function public.reschedule_booking(p_id uuid,p_day date,p_time text) returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings;target timestamptz;duration interval;valid boolean;
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 perform private.expire_pending_bookings();
 select * into b from public.bookings where id=p_id and status in('pending','confirmed') and starts_at>now() for update;
 if not found then raise exception 'A marcação já não pode ser alterada.';end if;
 -- Ignore this booking temporarily, without queuing a cancellation notice.
 perform set_config('ana.rescheduling',p_id::text,true);
 update public.bookings set status='cancelled' where id=p_id;
 select exists(select 1 from public.available_slots(b.service_id,p_day) where slot=p_time) into valid;
 if not valid then raise exception 'Esse horário já não está disponível.';end if;
 target:=(p_day+p_time::time) at time zone 'Europe/Lisbon';duration:=b.ends_at-b.starts_at;
 update public.bookings set status='confirmed',starts_at=target,ends_at=target+duration,rescheduled_at=now(),follow_up_sent_at=null,status_reason=null,pending_expires_at=null where id=p_id;
 perform set_config('ana.rescheduling','',true);
end $$;
create or replace function public.mark_follow_up_sent(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 update public.bookings set follow_up_sent_at=now() where id=p_id and status='confirmed' and starts_at>now();
 if not found then raise exception 'A marcação já passou ou deixou de estar confirmada.';end if;
end $$;
create or replace function public.notification_health() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 return jsonb_build_object('registered_devices',(select count(*) from public.push_subscriptions where user_id=auth.uid()),'queued',(select count(*) from public.notification_events where created_at>now()-interval '24 hours' and delivered_at is null and (notification_kind<>'client_status')),'accepted',(select count(*) from public.notification_events where created_at>now()-interval '24 hours' and delivered_at is not null and notification_kind<>'client_status'),'last_accepted',(select max(delivered_at) from public.notification_events where notification_kind<>'client_status'));
end $$;
revoke all on function public.add_agenda_block(date,time,date,time,text),public.remove_agenda_block(uuid),public.reschedule_booking(uuid,date,text),public.mark_follow_up_sent(uuid),public.notification_health() from public,anon,authenticated;
grant execute on function public.add_agenda_block(date,time,date,time,text),public.remove_agenda_block(uuid),public.reschedule_booking(uuid,date,text),public.mark_follow_up_sent(uuid),public.notification_health() to authenticated;
create or replace function public.reschedule_slots(p_id uuid,p_day date) returns table(slot text) language plpgsql stable security definer set search_path='' as $$
declare service_id text;
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 select b.service_id into service_id from public.bookings b where b.id=p_id and b.status in('pending','confirmed') and b.starts_at>now();
 if service_id is null then raise exception 'Marcação indisponível.';end if;
 return query  with service as(select minutes from public.services where id=service_id), times as(select t from service cross join lateral generate_series(540,1140-minutes,5) t where extract(isodow from p_day) in(1,2,4,5,6) and ((t>=540 and t+minutes<=case when extract(isodow from p_day)=6 then 780 else 720 end) or (t>=900 and t+minutes<=1140))), candidates as(select t,(p_day+t*interval '1 minute') at time zone 'Europe/Lisbon' as start_time from times)
 select to_char(p_day+t*interval '1 minute','HH24:MI') from candidates,service where p_day between (now() at time zone 'Europe/Lisbon')::date and (now() at time zone 'Europe/Lisbon')::date+180 and start_time>now()
 and not exists(select 1 from public.bookings b where b.id<>p_id and (b.status='confirmed' or (b.status='pending' and (b.pending_expires_at is null or b.pending_expires_at>now()))) and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)'))
 and not exists(select 1 from public.agenda_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)')) order by t
;
end $$;
revoke all on function public.reschedule_slots(uuid,date) from public,anon,authenticated;
grant execute on function public.reschedule_slots(uuid,date) to authenticated;

select cron.schedule('ana-expire-pending','*/5 * * * *','select private.expire_pending_bookings()');
-- Catch up within the reminder window if the scheduler misses 13:30.
create or replace function private.queue_follow_up_notice(p_at timestamptz default now())
returns void language plpgsql security definer set search_path='' as $$
declare target_day date; first_booking uuid;
begin
 if not private.follow_up_notice_due(p_at) then return;end if;
 target_day:=(p_at at time zone 'Europe/Lisbon')::date+1;
 select id into first_booking from public.bookings where status='confirmed'
 and (starts_at at time zone 'Europe/Lisbon')::date=target_day order by starts_at limit 1;
 if first_booking is null then return;end if;
 insert into public.notification_events(booking_id,notification_kind,reminder_day)
 values(first_booking,'follow_up',target_day)
 on conflict(reminder_day) where notification_kind='follow_up' do nothing;
end $$;
create or replace function private.queue_client_status_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.booking_source='client' and new.status is distinct from old.status and new.status in('confirmed','declined','cancelled') and new.customer_id is not null
 and not(new.status='cancelled' and coalesce(current_setting('ana.rescheduling',true),'')=new.id::text) then
 insert into public.notification_events(booking_id,notification_kind,recipient_id,booking_status) values(new.id,'client_status',new.customer_id,new.status);
 end if;return new;
end $$;
commit;
