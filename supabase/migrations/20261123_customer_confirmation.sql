begin;
alter table public.bookings add column if not exists customer_confirmed_at timestamptz;
create or replace function public.confirm_customer_booking(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid()) then raise exception 'Sem autorização.';end if;
 update public.bookings set customer_confirmed_at=now() where id=p_id and status='confirmed' and starts_at>now() and follow_up_sent_at is not null;
 if not found then raise exception 'Envie e marque primeiro o lembrete como enviado.';end if;
end;$$;
revoke all on function public.confirm_customer_booking(uuid) from public,anon,authenticated;
grant execute on function public.confirm_customer_booking(uuid) to authenticated;
create or replace function public.reset_customer_confirmation() returns trigger language plpgsql set search_path='' as $$
begin
 if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.status<>'confirmed' then new.customer_confirmed_at=null;end if;
 return new;
end;$$;
drop trigger if exists reset_customer_confirmation on public.bookings;
create trigger reset_customer_confirmation before update on public.bookings for each row execute function public.reset_customer_confirmation();
commit;
