create table public.booking_financials (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 attendance text not null default 'unrecorded' check(attendance in('unrecorded','attended','no_show')),
 service_total numeric(12,2) not null check(service_total>=0),
 price_source text not null check(price_source in('catalog_snapshot','catalog_reference','reviewed')),
 deposit_required boolean not null default false,
 deposit_amount numeric(12,2) not null default 0 check(deposit_amount>=0),
 deposit_received_on date,
 balance_amount numeric(12,2) not null default 0 check(balance_amount>=0),
 balance_received_on date,
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id) on delete set null,
 check(deposit_amount+balance_amount<=service_total),
 check((deposit_amount=0 and deposit_received_on is null) or (deposit_amount>0 and deposit_received_on is not null)),
 check((balance_amount=0 and balance_received_on is null) or (balance_amount>0 and balance_received_on is not null))
);
create table public.booking_payment_entries (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 payment_part text not null check(payment_part in('deposit','balance')),
 amount numeric(12,2) not null check(amount<>0),
 received_on date not null,
 recorded_at timestamptz not null default clock_timestamp(),
 recorded_by uuid references auth.users(id) on delete set null
);
create index booking_payment_entries_date on public.booking_payment_entries(received_on,booking_id);
create index booking_payment_entries_booking on public.booking_payment_entries(booking_id);
create table public.booking_financial_revisions (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 previous_record jsonb not null,
 new_record jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 recorded_by uuid references auth.users(id) on delete set null
);
create index booking_financial_revisions_booking on public.booking_financial_revisions(booking_id);
alter table public.booking_financials enable row level security;
alter table public.booking_payment_entries enable row level security;
alter table public.booking_financial_revisions enable row level security;
revoke all on public.booking_financials,public.booking_payment_entries,public.booking_financial_revisions from public,anon,authenticated;
grant select on public.booking_financials,public.booking_payment_entries,public.booking_financial_revisions to authenticated;
grant all on public.booking_financials,public.booking_payment_entries,public.booking_financial_revisions to service_role;
create policy staff_financials_read on public.booking_financials for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
create policy staff_payments_read on public.booking_payment_entries for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
create policy staff_revisions_read on public.booking_financial_revisions for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
create or replace function private.initialize_booking_financials() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.booking_financials(booking_id,service_total,price_source) select new.id,price,'catalog_snapshot' from public.services where id=new.service_id;
 return new;
end;$$;
revoke all on function private.initialize_booking_financials() from public,anon,authenticated;
create trigger initialize_booking_financials after insert on public.bookings for each row execute function private.initialize_booking_financials();
insert into public.booking_financials(booking_id,service_total,price_source) select b.id,s.price,'catalog_reference' from public.bookings b join public.services s on s.id=b.service_id;
create or replace function public.save_booking_financials(p_booking uuid,p_attendance text,p_total numeric,p_deposit_required boolean,p_deposit_received boolean,p_deposit_date date,p_paid_in_full boolean,p_balance_date date,p_version timestamptz)
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
 deposit:=case when p_deposit_received then round(p_total/2,2) else 0 end;
 balance:=case when p_paid_in_full then p_total-deposit else 0 end;
 if deposit>0 and (p_deposit_date is null or p_deposit_date>today) then raise exception 'Indique a data real do sinal, sem uma data futura.';end if;
 if balance>0 and (p_balance_date is null or p_balance_date>today) then raise exception 'Indique a data real do pagamento, sem uma data futura.';end if;
 update public.booking_financials set attendance=p_attendance,service_total=p_total,price_source='reviewed',deposit_required=p_deposit_required or p_deposit_received,
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
revoke all on function public.save_booking_financials(uuid,text,numeric,boolean,boolean,date,boolean,date,timestamptz) from public,anon,authenticated;
grant execute on function public.save_booking_financials(uuid,text,numeric,boolean,boolean,date,boolean,date,timestamptz) to authenticated;
