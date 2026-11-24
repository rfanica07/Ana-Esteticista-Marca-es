// Check the published page without interrupting a booking being entered.
export function hasUnsavedBooking(doc=document){
 return !!doc.querySelector('[data-finance-dirty="true"],[data-history-dirty="true"]')||['email','password','manualName','manualPhone','manualAccountEmail','manualService','manualTime','blockReason'].some(id=>!!doc.getElementById(id)?.value?.trim());
}
export function initAppUpdates({doc=document,win=window,fetchPage=fetch}={}){
 const version=doc.querySelector('script[type="module"][src^="admin.js"]')?.getAttribute('src');
 const button=doc.getElementById('reloadApp'),status=doc.getElementById('appUpdateStatus');
 let checking=false,available=false;
 const refresh=()=>{if(hasUnsavedBooking(doc)&&!win.confirm('Há dados por guardar. Atualizar a app e descartar esses dados?'))return;win.location.reload()};
 button.onclick=refresh;
 async function check(){
  if(checking||doc.hidden)return;checking=true;
  try{
   const url=new URL('admin.html',win.location.href);url.searchParams.set('versionCheck',String(Date.now()));
   const response=await fetchPage(url,{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)return;
   const source=new DOMParser().parseFromString(await response.text(),'text/html');
   const latest=source.querySelector('script[type="module"][src^="admin.js"]')?.getAttribute('src');
   if(latest&&version&&latest!==version){
    available=true;status.hidden=false;status.textContent='Há uma nova versão da app. Toque em Atualizar app quando terminar de guardar.';button.textContent='Atualizar app · nova versão';
    if(!hasUnsavedBooking(doc)&&!doc.activeElement?.matches('input,select,textarea')&&!doc.querySelector('[aria-busy="true"]'))win.location.reload();
   }
  }catch{}finally{checking=false}
 }
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)check()});
 win.addEventListener('focus',check);win.setInterval(check,60000);check();
 return {check,get available(){return available}};
}
