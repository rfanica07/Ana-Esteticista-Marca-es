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
  const {data:event,error} = await db.from('notification_events').select('id,delivered_at,bookings(status,starts_at)').eq('id',eventId).maybeSingle();
  if (error) throw error;
  if (!event) return new Response('Not found',{status:404});
  if (event.delivered_at) return new Response('Already delivered');
  const booking = event.bookings as unknown as {status:string;starts_at:string};
  if (!booking || booking.status !== 'pending' || new Date(booking.starts_at) <= new Date())
   return new Response('No longer pending');
  const {data:acquired,error:claimError} = await db.rpc('claim_notification',{p_id:eventId});
  if (claimError) throw claimError;
  if (!acquired) return new Response('Already processing',{status:202});
  claimed = true;
  const {data:staff,error:staffError} = await db.from('staff').select('user_id');
  if (staffError) throw staffError;
  if (!staff?.length) return new Response('No staff configured',{status:503});
  const {data:subs,error:subError} = await db.from('push_subscriptions').select('*').in('user_id',staff.map(s=>s.user_id));
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
    await webpush.sendNotification(sub.subscription,JSON.stringify({id:eventId}),{TTL:86400,timeout:10000});
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
