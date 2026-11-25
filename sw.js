self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{}}catch{}
 event.waitUntil((async()=>{
 await self.registration.showNotification('Ana Esteticista',{
  body:payload.body||'Novo pedido de marcação. Abra a agenda para consultar.',icon:'./icon-192.png',
  tag:payload.id||'novo-pedido',data:{url:new URL((payload.audience==='client'?'./':'./admin.html')+(/^\d{4}-\d{2}-\d{2}$/.test(payload.day||'')?'?day='+payload.day:''),self.registration.scope).href}
 });
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const window of windows){try{window.postMessage({type:'booking-update'})}catch{}}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=event.notification.data?.url||new URL('./admin.html',self.registration.scope).href;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const window of windows){if(new URL(window.url).pathname===new URL(url).pathname){await window.navigate(url);await window.focus();return}}
 await self.clients.openWindow(url);
 })());
});
