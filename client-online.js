import {db,bindLogin,recoveryLink,currentUser,message,registerWorker,enablePush,signOutDevice} from './backend.js';
registerWorker().catch(()=>{});
const notice=document.querySelector('.notice');
const form=document.getElementById('bookingForm');
let slotsRequest=0,verifiedSelection=null,submitting=false;
document.getElementById('bookingPrivacy').onchange=()=>summary();
const baseSummary=summary;
summary=function(){baseSummary();if(db)document.getElementById('review').disabled=submitting||!document.getElementById('bookingPrivacy').checked||!(selected&&time&&verifiedSelection===selected.id+'|'+document.getElementById('date').value)};
if(!db){
 notice.textContent='Demonstração · A ligação à base de dados ainda não foi ativada. Não são enviados pedidos.';
 form.hidden=true;
}else{
 notice.textContent='Escolha um horário e envie o pedido. A marcação fica pendente até a Ana confirmar.';
 document.getElementById('review').textContent='Enviar pedido de marcação';
 form.hidden=false;
 const {data:catalog,error:catalogError}=await db.from('services').select('*');
 if(!catalogError&&catalog?.length){services.splice(0,services.length,...catalog);selected=null;time=null;renderServices();summary()}
 else {notice.textContent='Não foi possível carregar os serviços. Tente mais tarde.';document.getElementById('review').disabled=true}
 renderSlots=async function(){
  const request=++slotsRequest;verifiedSelection=null;time=null;summary();
  const day=document.getElementById('date').value,service=selected?.id;
  document.getElementById('slots').replaceChildren();
  if(!day||!service){message('slotHint','Escolha um serviço e um dia.');return}
  message('slotHint','A consultar a disponibilidade…');
  const {data,error}=await db.rpc('available_slots',{p_service:service,p_day:day});
  if(request!==slotsRequest)return;
  if(error){message('slotHint','Não foi possível consultar a agenda. Tente novamente.');return}
  verifiedSelection=service+'|'+day;
  message('slotHint',data.length?'Escolha um horário.':'Sem horários disponíveis neste dia.');
  data.forEach(({slot})=>{const button=document.createElement('button');button.className='slot';button.textContent=slot;button.setAttribute('aria-pressed','false');button.onclick=()=>{time=slot;for(const other of document.querySelectorAll('.slot'))other.setAttribute('aria-pressed',String(other===button));summary()};document.getElementById('slots').append(button)});
 };
 async function loadMyBookings(){
  const user=await currentUser();
  const section=document.getElementById('myBookings');
  section.hidden=!user;
  document.getElementById('clientNotifications').hidden=!user;
  if(!user)return;
  const {data,error}=await db.from('bookings').select('id,starts_at,status,services(name)').eq('customer_id',user.id).gte('starts_at',new Date().toISOString()).order('starts_at').limit(50);
  const list=document.getElementById('myBookingList');list.replaceChildren();
  if(error){list.textContent='Não foi possível consultar os seus pedidos. Tente atualizar a página.';return}
  if(!data.length){list.textContent='Ainda não tem pedidos futuros.';return}
  for(const booking of data){
   const line=document.createElement('p');
   line.textContent=new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',dateStyle:'medium',timeStyle:'short'}).format(new Date(booking.starts_at))+' · '+(booking.services?.name||'Serviço')+' · '+({pending:'Aguarda confirmação da Ana',confirmed:'Confirmada',declined:'Recusada',cancelled:'Cancelada'})[booking.status];
   list.append(line);
  }
 }
 async function loadNotices(){
  const user=await currentUser();if(!user)return;
  const {data,error}=await db.from('notification_events').select('id,created_at,booking_status,bookings(starts_at,services(name))').eq('recipient_id',user.id).eq('notification_kind','client_status').order('created_at',{ascending:false}).limit(20);
  const list=document.getElementById('clientNoticeList');list.replaceChildren();
  if(error){list.textContent='Não foi possível atualizar os avisos. Tente novamente.';return}
  if(!data.length){list.textContent='As respostas da Ana vão aparecer aqui.';return}
  for(const item of data){const line=document.createElement('p');const booking=item.bookings;line.textContent=({confirmed:'Marcação confirmada',declined:'Pedido recusado',cancelled:'Marcação cancelada'})[item.booking_status]+' · '+(booking?.services?.name||'Serviço')+' · '+(booking?new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',dateStyle:'medium',timeStyle:'short'}).format(new Date(booking.starts_at)):'');list.append(line)}
 }
 async function refreshAccount(){await Promise.all([loadMyBookings(),loadNotices()])}
 document.getElementById('enableClientPush').onclick=async()=>{
  const button=document.getElementById('enableClientPush');button.disabled=true;
  try{await enablePush();message('clientPushStatus','Este telemóvel está registado para receber as respostas da Ana.')}catch(error){message('clientPushStatus',error.message)}finally{button.disabled=false}
 };
 const updateLogin=async()=>{
  if(recoveryLink)return;
  const user=await currentUser();
  document.getElementById('account').hidden=!!user;
  document.getElementById('clientSignOut').hidden=!user;
  document.getElementById('privacyControls').hidden=!user;
  await refreshAccount();
  message('loginStatus',user?'Sessão iniciada. Pode enviar o pedido.':'Entre com email e palavra-passe para enviar o pedido.');
 };
 bindLogin('clientEmail','loginStatus',updateLogin);
 document.getElementById('clientSignOut').onclick=async()=>{await signOutDevice();await updateLogin()};
 document.getElementById('submitDataRequest').onclick=async()=>{
  const button=document.getElementById('submitDataRequest');button.disabled=true;
  try{
   const {data,error}=await db.rpc('submit_data_request',{p_type:document.getElementById('dataRequestType').value,p_details:document.getElementById('dataRequestDetails').value});
   if(error)throw error;
   message('dataRequestStatus','Pedido registado. Referência '+data+'. A Ana irá analisá-lo.');
  }catch(error){message('dataRequestStatus',error.message)}finally{button.disabled=false}
 };
 await updateLogin();
 document.getElementById('review').onclick=async()=>{
  if(submitting||!selected||!time||verifiedSelection!==selected.id+'|'+document.getElementById('date').value)return;
  if(!document.getElementById('bookingPrivacy').checked){message('result','Leia e aceite o aviso de privacidade antes de enviar o pedido.');return}
  const name=document.getElementById('customerName'),phone=document.getElementById('customerPhone');
  if(!name.reportValidity()||!phone.reportValidity())return;
  if(!await currentUser()){message('result','Entre na sua conta antes de enviar o pedido.');return}
  const button=document.getElementById('review');submitting=true;button.disabled=true;
  try{
   const {data,error}=await db.rpc('request_booking_accepted',{p_service:selected.id,p_day:document.getElementById('date').value,p_time:time,p_name:name.value,p_phone:phone.value,p_privacy_accepted:document.getElementById('bookingPrivacy').checked,p_privacy_version:'2026-11-20'});
   if(error)throw error;
   message('result','Pedido recebido. Referência: '+data+'. Aguarde a confirmação da Ana.');name.value='';phone.value='';document.getElementById('bookingPrivacy').checked=false;await renderSlots();await loadMyBookings();
  }catch(e){message('result','O pedido não foi confirmado: '+e.message);await renderSlots()}
  finally{submitting=false;summary()}
 };
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAccount()});
 window.addEventListener('focus',()=>refreshAccount());
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='booking-update')refreshAccount()});
 setInterval(()=>{if(!document.hidden)refreshAccount()},30000);
 summary();
}
