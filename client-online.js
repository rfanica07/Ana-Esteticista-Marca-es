import {db,bindLogin,recoveryLink,currentUser,message,registerWorker} from './backend.js';
registerWorker().catch(()=>{});
const notice=document.querySelector('.notice');
const form=document.getElementById('bookingForm');
let slotsRequest=0,verifiedSelection=null,submitting=false;
const baseSummary=summary;
summary=function(){baseSummary();if(db)document.getElementById('review').disabled=submitting||!(selected&&time&&verifiedSelection===selected.id+'|'+document.getElementById('date').value)};
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
 const updateLogin=async()=>{
  if(recoveryLink)return;
  const user=await currentUser();
  document.getElementById('account').hidden=!!user;
  document.getElementById('clientSignOut').hidden=!user;
  document.getElementById('privacyControls').hidden=!user;
  await loadMyBookings();
  message('loginStatus',user?'Sessão iniciada. Pode enviar o pedido.':'Entre com email e palavra-passe para enviar o pedido.');
 };
 bindLogin('clientEmail','loginStatus',updateLogin);
 document.getElementById('clientSignOut').onclick=async()=>{await db.auth.signOut();await updateLogin()};
 document.getElementById('submitDataRequest').onclick=async()=>{
  const button=document.getElementById('submitDataRequest');button.disabled=true;
  try{
   const {data,error}=await db.rpc('submit_data_request',{p_type:document.getElementById('dataRequestType').value,p_details:document.getElementById('dataRequestDetails').value});
   if(error)throw error;
   message('dataRequestStatus','Pedido registado. Referência '+data+'. A Ana irá analisá-lo.');
  }catch(error){message('dataRequestStatus',error.message)}finally{button.disabled=false}
 };
 document.getElementById('withdrawReminders').onclick=async()=>{
  const {error}=await db.rpc('withdraw_whatsapp_reminders');
  message('dataRequestStatus',error?error.message:'Autorização retirada para os lembretes associados à sua conta. Pode voltar a autorizar numa futura marcação.');
 };
 await updateLogin();
 document.getElementById('review').onclick=async()=>{
  if(submitting||!selected||!time||verifiedSelection!==selected.id+'|'+document.getElementById('date').value)return;
  if(!document.getElementById('bookingPrivacy').checked){message('result','Leia o aviso de privacidade e assinale que tomou conhecimento.');return}
  const name=document.getElementById('customerName'),phone=document.getElementById('customerPhone');
  if(!name.reportValidity()||!phone.reportValidity())return;
  if(!await currentUser()){message('result','Entre na sua conta antes de enviar o pedido.');return}
  const button=document.getElementById('review');submitting=true;button.disabled=true;
  try{
   const {error:privacyError}=await db.rpc('acknowledge_privacy',{p_version:'2026-11-20',p_purpose:'booking'});
   if(privacyError)throw privacyError;
   const {data,error}=await db.rpc('request_booking_with_reminder',{p_service:selected.id,p_day:document.getElementById('date').value,p_time:time,p_name:name.value,p_phone:phone.value,p_reminder:document.getElementById('whatsappConsent').checked});
   if(error)throw error;
   message('result','Pedido recebido. Referência: '+data+'. Aguarde a confirmação da Ana.');name.value='';phone.value='';await renderSlots();await loadMyBookings();
  }catch(e){message('result','O pedido não foi confirmado: '+e.message);await renderSlots()}
  finally{submitting=false;summary()}
 };
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadMyBookings()});
 summary();
}
