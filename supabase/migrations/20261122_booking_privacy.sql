begin;
alter table public.bookings add column if not exists privacy_notice_version text;
alter table public.bookings add column if not exists privacy_accepted_at timestamptz;
create or replace function public.request_booking_accepted(p_service text,p_day date,p_time text,p_name text,p_phone text,p_privacy_accepted boolean,p_privacy_version text)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.';end if;
 if p_privacy_accepted is distinct from true or p_privacy_version is distinct from '2026-11-20' then
  raise exception 'Leia e aceite o aviso de privacidade antes de enviar o pedido.' using errcode='22023';
 end if;
 perform public.acknowledge_privacy(p_privacy_version,'booking');
 booking:=public.request_booking(p_service,p_day,p_time,p_name,p_phone);
 update public.bookings set privacy_notice_version=p_privacy_version,privacy_accepted_at=now() where id=booking;
 return booking;
end $$;
revoke all on function public.request_booking_accepted(text,date,text,text,text,boolean,text) from public,anon;
grant execute on function public.request_booking_accepted(text,date,text,text,text,boolean,text) to authenticated;
-- Client submissions must go through the acceptance validation above.
revoke execute on function public.request_booking(text,date,text,text,text) from public,anon,authenticated;
commit;
-- Show existing future confirmations in each client's inbox, once only.
insert into public.notification_events(booking_id,notification_kind,recipient_id,booking_status)
select b.id,'client_status',b.customer_id,b.status from public.bookings b
where b.booking_source='client' and b.status='confirmed' and b.starts_at>now()
and not exists(select 1 from public.notification_events e where e.booking_id=b.id and e.notification_kind='client_status' and e.booking_status=b.status);
