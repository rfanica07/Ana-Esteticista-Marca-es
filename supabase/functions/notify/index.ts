import {createClient} from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async req => {
 if (req.method !== 'POST') return new Response('Method not allowed', {status:405});
 const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const secret = req.headers.get('x-webhook-secret');
 if (!secret) return new Response('Unauthorized', {status:401});
 const {data:valid,error:authError} = await db.rpc('verify_notification_dispatch',{p_secret:secret});
 if (authError || !valid) return new Response('Unauthorized',{status:401});
 let eventId: string | undefined;
 let claimed = false;
 try {
  const payload = await req.json();
  if (payload.type !== 'INSERT' || payload.table !== 'notification_events' || payload.schema !== 'public')
   return new Response('Invalid event',{status:400});
  eventId = payload.record?.id;
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId))
   return new Response('Invalid event',{status:400});
  const {data:event,error} = await db.from('notification_events').select('id,delivered_at,notification_kind,reminder_day,recipient_id,booking_status,bookings(status,starts_at,customer_id)').eq('id',eventId).maybeSingle();
  if (error) throw error;
  if (!event) return new Response('Not found',{status:404});
  if (event.delivered_at) return new Response('Already delivered');
  const booking = event.bookings as unknown as {status:string;starts_at:string;customer_id:string};
  let pushPayload: {id:string;body?:string;day?:string;audience?:string} = {id:eventId};
  let recipientIds:string[]=[];
  if(event.notification_kind === 'device_test'){
   if(!event.recipient_id)return new Response('Invalid recipient',{status:400});
   const {data:staffMember}=await db.from('staff').select('user_id').eq('user_id',event.recipient_id).maybeSingle();
   recipientIds=[event.recipient_id];
   pushPayload={id:eventId,audience:staffMember?'staff':'client',body:'Teste de notificações: este telemóvel está a receber os avisos da Ana Esteticista 🌸'};
  } else if(event.notification_kind === 'client_status') {
   if(!booking || booking.customer_id!==event.recipient_id || booking.status!==event.booking_status || !['confirmed','declined','cancelled'].includes(event.booking_status))return new Response('Obsolete response');
   recipientIds=[event.recipient_id];
   const descriptions={confirmed:'A Ana confirmou a sua marcação.',declined:'A Ana não conseguiu aceitar o seu pedido.',cancelled:'A sua marcação foi cancelada.'};
   pushPayload={id:eventId,audience:'client',body:descriptions[event.booking_status]+' Abra a app para consultar a data, hora e serviço.'};
   } else if(event.notification_kind === 'follow_up') {
   const now=new Date();
   const localDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
   const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
   const calendarDay=new Date(localDay+'T12:00:00Z');
   if([2,6].includes(calendarDay.getUTCDay()) || localTime<'13:30' || localTime>='14:00')return new Response('Outside follow-up reminder window');
   calendarDay.setUTCDate(calendarDay.getUTCDate()+1);
   const day=calendarDay.toISOString().slice(0,10);
   if(event.reminder_day!==day)return new Response('Expired follow-up reminder');
   const from=new Date(day+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-1);
   const until=new Date(day+'T00:00:00Z');until.setUTCDate(until.getUTCDate()+2);
   const {data:appointments,error:agendaError}=await db.from('bookings').select('starts_at').eq('status','confirmed').gte('starts_at',from.toISOString()).lt('starts_at',until.toISOString());
   if(agendaError)throw agendaError;
   const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
   const count=appointments.filter(item=>formatter.format(new Date(item.starts_at))===day).length;
   if(!count)return new Response('No confirmed appointments tomorrow');
   pushPayload={id:eventId,day,body:'Envie os lembretes das '+count+' marcações confirmadas de amanhã. Toque para abrir a agenda e preparar as mensagens.'};
  } else if(event.notification_kind === 'daily_agenda') {
   const day = event.reminder_day;
   if(day !== new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
    return new Response('Expired daily agenda');
   const from = new Date(day+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-1);
   const until = new Date(day+'T00:00:00Z');until.setUTCDate(until.getUTCDate()+2);
   const {data:appointments,error:agendaError}=await db.from('bookings').select('starts_at').eq('status','confirmed').gte('starts_at',from.toISOString()).lt('starts_at',until.toISOString());
   if(agendaError)throw agendaError;
   const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'});
   const count=appointments.filter(item=>formatter.format(new Date(item.starts_at))===day).length;
   if(!count)return new Response('No appointments today');
   pushPayload={id:eventId,day,body:'Tem '+count+' marcações confirmadas hoje. Abra a agenda para consultar.'};
  } else if(event.notification_kind === 'request') {
   if (!booking || booking.status !== 'pending' || new Date(booking.starts_at) <= new Date())
    return new Response('No longer pending');
   pushPayload.day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(booking.starts_at));
  }
  else return new Response('Unsupported notification',{status:400});
  const {data:acquired,error:claimError} = await db.rpc('claim_notification',{p_id:eventId});
  if (claimError) throw claimError;
  if (!acquired) return new Response('Already processing',{status:202});
  claimed = true;
  if(!['client_status','device_test'].includes(event.notification_kind)){
   const {data:staff,error:staffError}=await db.from('staff').select('user_id');
   if(staffError)throw staffError;
   recipientIds=staff?.map(s=>s.user_id)||[];
  }
  if(!recipientIds.length)return new Response('No recipients configured',{status:503});
  const {data:subs,error:subError} = await db.from('push_subscriptions').select('*').in('user_id',recipientIds);
  if (subError) throw subError;
  if (!subs?.length) return new Response('No registered phone',{status:503});
  const {data:receipts,error:receiptError} = await db.from('notification_deliveries').select('endpoint').eq('event_id',eventId);
  if (receiptError) throw receiptError;
  const done = new Set(receipts?.map(r=>r.endpoint));
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!,Deno.env.get('VAPID_PUBLIC_KEY')!,Deno.env.get('VAPID_PRIVATE_KEY')!);
  let delivered=0,failed=0,expired=0;
  for (const sub of subs) {
   if (done.has(sub.endpoint)) {delivered++;continue}
   let url: URL;
   try {url=new URL(sub.endpoint)} catch {failed++;continue}
   if (url.protocol !== 'https:' || !['push.apple.com','fcm.googleapis.com','push.services.mozilla.com','notify.windows.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host))) {failed++;continue}
   try {
    await webpush.sendNotification(sub.subscription,JSON.stringify(pushPayload),{TTL:86400,timeout:10000});
    const {error:saveError}=await db.from('notification_deliveries').upsert({event_id:eventId,endpoint:sub.endpoint});
    if(saveError) throw saveError;
    delivered++;
   } catch(e) {
    if ([404,410].includes(e.statusCode)) {
     const {error:deleteError}=await db.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);
     if(deleteError) failed++; else expired++;
    } else failed++;
   }
  }
  if (delivered && !failed) {
   const {error:finishError}=await db.from('notification_events').update({delivered_at:new Date().toISOString()}).eq('id',eventId);
   if(finishError) throw finishError;
  }
  return Response.json({delivered,failed,expired},{status:failed||!delivered?503:200});
 } catch {
  return new Response('Notification delivery failed; booking remains saved',{status:500});
 } finally {
  if (claimed && eventId) await db.from('notification_events').update({processing_at:null}).eq('id',eventId);
 }
});
