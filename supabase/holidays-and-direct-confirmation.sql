-- National holidays: https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34546475-46746675
-- Municipal holiday: Moita, Tuesday after the second Sunday of September.
create or replace function private.easter_sunday(p_year integer) returns date language plpgsql immutable strict set search_path='' as $$
declare a integer:=p_year%19;b integer:=p_year/100;c integer:=p_year%100;d integer:=b/4;e integer:=b%4;f integer:=(b+8)/25;g integer:=(b-f+1)/3;h integer:=(19*a+b-d-g+15)%30;i integer:=c/4;k integer:=c%4;l integer:=(32+2*e+2*i-h-k)%7;m integer:=(a+11*h+22*l)/451;n integer:=h+l-7*m+114;
begin return make_date(p_year,n/31,n%31+1);end;$$;
create or replace function private.holiday_name(p_day date) returns text language plpgsql immutable strict set search_path='' as $$
declare y integer:=extract(year from p_day);easter date:=private.easter_sunday(y);september date:=make_date(y,9,1);fixed text;
begin
 fixed:=case to_char(p_day,'MM-DD') when '01-01' then 'Ano Novo' when '04-25' then 'Dia da Liberdade' when '05-01' then 'Dia do Trabalhador' when '06-10' then 'Dia de Portugal' when '08-15' then 'Assunção de Nossa Senhora' when '10-05' then 'Implantação da República' when '11-01' then 'Todos os Santos' when '12-01' then 'Restauração da Independência' when '12-08' then 'Imaculada Conceição' when '12-25' then 'Natal' end;
 if fixed is not null then return fixed;end if;
 if p_day=easter-2 then return 'Sexta-feira Santa';end if;
 if p_day=easter then return 'Domingo de Páscoa';end if;
 if p_day=easter+60 then return 'Corpo de Deus';end if;
 if p_day=september+(7-extract(dow from september)::integer)%7+9 then return 'Feriado municipal da Moita';end if;
 return null;
end;$$;
create or replace function private.closed_day_reason(p_day date) returns text language plpgsql immutable strict set search_path='' as $$
declare holiday text:=private.holiday_name(p_day);
begin
 if holiday is not null then return 'Feriado · '||holiday;end if;
 if extract(isodow from p_day)=3 then return 'Folga · quarta-feira';end if;
 if extract(isodow from p_day)=7 then return 'Folga · domingo';end if;
 return null;
end;$$;
revoke all on function private.easter_sunday(integer),private.holiday_name(date),private.closed_day_reason(date) from public,anon,authenticated;
create or replace function public.available_slots(p_service text,p_day date) returns table(slot text) language sql stable security definer set search_path='' as $$
 with service as(select minutes from public.services where id=p_service), times as(select t from service cross join lateral generate_series(540,1140-minutes,5) t where extract(isodow from p_day) in(1,2,4,5,6) and private.closed_day_reason(p_day) is null and ((t>=540 and t+minutes<=case when extract(isodow from p_day)=6 then 780 else 720 end) or (t>=900 and t+minutes<=1140))), candidates as(select t,(p_day+t*interval '1 minute') at time zone 'Europe/Lisbon' as start_time from times)
 select to_char(p_day+t*interval '1 minute','HH24:MI') from candidates,service where p_day between (now() at time zone 'Europe/Lisbon')::date and (now() at time zone 'Europe/Lisbon')::date+180 and start_time>now()
 and not exists(select 1 from public.bookings b where (b.status='confirmed' or (b.status='pending' and (b.pending_expires_at is null or b.pending_expires_at>now()))) and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)'))
 and not exists(select 1 from public.agenda_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)')) order by t
$$;
create or replace function public.reschedule_slots(p_id uuid,p_day date) returns table(slot text) language plpgsql stable security definer set search_path='' as $$
declare service_id text;
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 select b.service_id into service_id from public.bookings b where b.id=p_id and b.status in('pending','confirmed') and b.starts_at>now();
 if service_id is null then raise exception 'Marcação indisponível.';end if;
 return query  with service as(select minutes from public.services where id=service_id), times as(select t from service cross join lateral generate_series(540,1140-minutes,5) t where extract(isodow from p_day) in(1,2,4,5,6) and private.closed_day_reason(p_day) is null and ((t>=540 and t+minutes<=case when extract(isodow from p_day)=6 then 780 else 720 end) or (t>=900 and t+minutes<=1140))), candidates as(select t,(p_day+t*interval '1 minute') at time zone 'Europe/Lisbon' as start_time from times)
 select to_char(p_day+t*interval '1 minute','HH24:MI') from candidates,service where p_day between (now() at time zone 'Europe/Lisbon')::date and (now() at time zone 'Europe/Lisbon')::date+180 and start_time>now()
 and not exists(select 1 from public.bookings b where b.id<>p_id and (b.status='confirmed' or (b.status='pending' and (b.pending_expires_at is null or b.pending_expires_at>now()))) and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)'))
 and not exists(select 1 from public.agenda_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(start_time,start_time+minutes*interval '1 minute','[)')) order by t
;
end $$;
revoke all on function public.reschedule_slots(uuid,date) from public,anon,authenticated;
grant execute on function public.reschedule_slots(uuid,date) to authenticated;


create or replace function private.guard_agenda_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare closed text;
begin
 perform pg_advisory_xact_lock(771122);
 if new.status not in('pending','confirmed') then return new;end if;
 if tg_op='INSERT' then
  perform private.expire_pending_bookings();
  if new.status='pending' then new.pending_expires_at:=least(new.starts_at,now()+interval '24 hours');end if;
 end if;
 closed:=private.closed_day_reason((new.starts_at at time zone 'Europe/Lisbon')::date);
 if closed is not null then
  if tg_op='INSERT' then raise exception 'A Ana não trabalha neste dia: %. Escolha outro dia.',closed;
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or old.status not in('pending','confirmed') or (old.status='pending' and new.status='confirmed') then raise exception 'A Ana não trabalha neste dia: %. Reagende a marcação.',closed;
  end if;
 end if;
 if exists(select 1 from public.agenda_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'Este horário foi bloqueado pela Ana. Escolha outro.';end if;
 return new;
end;$$;
revoke all on function private.guard_agenda_booking() from public,anon,authenticated;
create or replace function public.confirm_customer_booking(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings;closed text;
begin
 if auth.uid() is null or not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 select * into b from public.bookings where id=p_id for update;
 if not found or b.status<>'confirmed' or b.starts_at<=now() then raise exception 'Esta marcação já passou ou deixou de estar ativa. Atualize a agenda.';end if;
 closed:=private.closed_day_reason((b.starts_at at time zone 'Europe/Lisbon')::date);
 if closed is not null then raise exception 'A Ana não trabalha neste dia: %. Reagende a marcação.',closed;end if;
 update public.bookings set customer_confirmed_at=coalesce(customer_confirmed_at,now()),follow_up_sent_at=coalesce(follow_up_sent_at,now()) where id=p_id;
end;$$;
revoke all on function public.confirm_customer_booking(uuid) from public,anon,authenticated;
grant execute on function public.confirm_customer_booking(uuid) to authenticated;
