create table public.customer_private_profiles (
 phone text primary key references public.customer_contacts(phone) on delete cascade,
 note text not null default '' check(length(note)<=2000),
 payment_policy text not null default 'none' check(payment_policy in('none','half','full')),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id) on delete set null
);
alter table public.customer_private_profiles enable row level security;
revoke all on public.customer_private_profiles from public,anon,authenticated;
grant select on public.customer_private_profiles to authenticated;
grant all on public.customer_private_profiles to service_role;
create policy staff_read_private_profiles on public.customer_private_profiles for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
create function public.save_customer_private_profile(p_phone text,p_note text,p_policy text,p_version timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare normalized text; v timestamptz;
begin
 if auth.uid() is null or not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 normalized:=private.normalize_customer_phone(p_phone);
 perform 1 from public.customer_contacts where phone=normalized for update;
 if not found then raise exception 'Contacto não encontrado.';end if;
 if p_note is null or length(p_note)>2000 or p_policy is null or p_policy not in('none','half','full') then raise exception 'Reveja a nota e o pagamento antecipado.';end if;
 select updated_at into v from public.customer_private_profiles where phone=normalized;
 if (found and (p_version is null or v<>p_version)) or (not found and p_version is not null) then raise exception 'O histórico mudou noutro ecrã. Atualize antes de guardar.';end if;
 insert into public.customer_private_profiles(phone,note,payment_policy,updated_by) values(normalized,btrim(p_note),p_policy,auth.uid())
 on conflict(phone) do update set note=excluded.note,payment_policy=excluded.payment_policy,updated_at=clock_timestamp(),updated_by=auth.uid();
end;$$;
revoke all on function public.save_customer_private_profile(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_customer_private_profile(text,text,text,timestamptz) to authenticated;
alter table public.booking_financials add column deposit_percent integer not null default 50 check(deposit_percent in(50,100));
create or replace function private.initialize_booking_financials() returns trigger language plpgsql security definer set search_path='' as $$
declare policy text;
begin
 select payment_policy into policy from public.customer_private_profiles where phone=private.normalize_customer_phone(new.phone);
 insert into public.booking_financials(booking_id,service_total,price_source,deposit_required,deposit_percent)
 select new.id,price,'catalog_snapshot',coalesce(policy<>'none',false),case when policy='full' then 100 else 50 end from public.services where id=new.service_id;
 return new;
end;$$;
revoke all on function private.initialize_booking_financials() from public,anon,authenticated;
drop function public.save_booking_financials(uuid,text,numeric,boolean,boolean,date,boolean,date,timestamptz);
create or replace function public.save_booking_financials(p_booking uuid,p_attendance text,p_total numeric,p_deposit_required boolean,p_deposit_received boolean,p_deposit_date date,p_paid_in_full boolean,p_balance_date date,p_version timestamptz,p_deposit_percent integer default 50)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings; old_record public.booking_financials; new_record public.booking_financials; deposit numeric; balance numeric; today date:=(now() at time zone 'Europe/Lisbon')::date;
begin
 if auth.uid() is null or not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Acesso reservado à Ana.' using errcode='42501';end if;
 select * into b from public.bookings where id=p_booking for update;
 if not found then raise exception 'Marcação não encontrada.';end if;
 select * into old_record from public.booking_financials where booking_id=p_booking for update;
 if not found or p_version is null or old_record.updated_at<>p_version then raise exception 'O registo foi atualizado noutro ecrã. Atualize a agenda antes de guardar.';end if;
 if p_attendance is null or p_attendance not in('unrecorded','attended','no_show') then raise exception 'Escolha uma presença válida.';end if;
 if p_attendance<>'unrecorded' and b.starts_at>now() then raise exception 'A presença só pode ser registada a partir da hora da marcação.';end if;
 if p_attendance='attended' and b.status<>'confirmed' then raise exception 'Não pode registar presença numa marcação cancelada ou recusada.';end if;
 if p_total is null or p_total<0 or p_total<>round(p_total,2) then raise exception 'Indique um preço válido com até duas casas decimais.';end if;
 if p_deposit_required is null or p_deposit_received is null or p_paid_in_full is null then raise exception 'Reveja as opções de pagamento.';end if;
 if p_deposit_percent is null or p_deposit_percent not in(50,100) then raise exception 'Escolha metade ou a totalidade para o pagamento antecipado.';end if;
 deposit:=case when p_deposit_received then round(p_total*p_deposit_percent/100,2) else 0 end;
 balance:=case when p_paid_in_full then p_total-deposit else 0 end;
 if deposit>0 and (p_deposit_date is null or p_deposit_date>today) then raise exception 'Indique a data real do sinal, sem uma data futura.';end if;
 if balance>0 and (p_balance_date is null or p_balance_date>today) then raise exception 'Indique a data real do pagamento, sem uma data futura.';end if;
 update public.booking_financials set attendance=p_attendance,service_total=p_total,price_source='reviewed',deposit_required=p_deposit_required or p_deposit_received,deposit_percent=p_deposit_percent,
 deposit_amount=deposit,deposit_received_on=case when deposit>0 then p_deposit_date end,
 balance_amount=balance,balance_received_on=case when balance>0 then p_balance_date end,updated_at=clock_timestamp(),updated_by=auth.uid() where booking_id=p_booking returning * into new_record;
 if old_record.deposit_amount is distinct from new_record.deposit_amount or old_record.deposit_received_on is distinct from new_record.deposit_received_on then
 if old_record.deposit_amount>0 then insert into public.booking_payment_entries(booking_id,payment_part,amount,received_on,recorded_by) values(p_booking,'deposit',-old_record.deposit_amount,old_record.deposit_received_on,auth.uid());end if;
 if new_record.deposit_amount>0 then insert into public.booking_payment_entries(booking_id,payment_part,amount,received_on,recorded_by) values(p_booking,'deposit',new_record.deposit_amount,new_record.deposit_received_on,auth.uid());end if;
 end if;
 if old_record.balance_amount is distinct from new_record.balance_amount or old_record.balance_received_on is distinct from new_record.balance_received_on then
 if old_record.balance_amount>0 then insert into public.booking_payment_entries(booking_id,payment_part,amount,received_on,recorded_by) values(p_booking,'balance',-old_record.balance_amount,old_record.balance_received_on,auth.uid());end if;
 if new_record.balance_amount>0 then insert into public.booking_payment_entries(booking_id,payment_part,amount,received_on,recorded_by) values(p_booking,'balance',new_record.balance_amount,new_record.balance_received_on,auth.uid());end if;
 end if;
 insert into public.booking_financial_revisions(booking_id,previous_record,new_record,recorded_by) values(p_booking,to_jsonb(old_record),to_jsonb(new_record),auth.uid());
end;$$;
revoke all on function public.save_booking_financials(uuid,text,numeric,boolean,boolean,date,boolean,date,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.save_booking_financials(uuid,text,numeric,boolean,boolean,date,boolean,date,timestamptz,integer) to authenticated;
