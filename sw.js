self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification('Ana Esteticista',{
  body:'Novo pedido de marcação. Abra a agenda para consultar.',icon:'./icon.svg',
  tag:payload.id||'novo-pedido',data:{url:new URL('./admin.html',self.registration.scope).href}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=new URL('./admin.html',self.registration.scope).href;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const window of windows){if(window.url===url){await window.focus();return}}
 await self.clients.openWindow(url);
 })());
});
