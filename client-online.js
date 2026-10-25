import {db,login,currentUser,message,registerWorker} from './backend.js';
registerWorker().catch(()=>{});
const notice=document.querySelector('.notice');
const form=document.getElementById('bookingForm');
let slotsRequest=0,verifiedSelection=null;
const baseSummary=summary;
summary=function(){baseSummary();if(db)document.getElementById('review').disabled=!(selected&&time&&verifiedSelection===selected.id+'|'+document.getElementById('date').value)};
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
 document.getElementById('loginClient').onclick=async()=>{
  const input=document.getElementById('clientEmail');if(!input.reportValidity())return;
  try{await login(input.value,'index.html');message('result','Enviámos um link para o seu email. Abra-o neste dispositivo para entrar e depois escolha a marcação.')}catch(e){message('result',e.message)}
 };
 const user=await currentUser();message('loginStatus',user?'Sessão iniciada. Pode enviar o pedido.':'Entre pelo email para enviar o pedido.');
 document.getElementById('review').onclick=async()=>{
  if(!selected||!time)return;
  const name=document.getElementById('customerName'),phone=document.getElementById('customerPhone');
  if(!name.reportValidity()||!phone.reportValidity())return;
  if(!await currentUser()){message('result','Entre pelo email antes de enviar o pedido.');return}
  const button=document.getElementById('review');button.disabled=true;
  try{
   const {data,error}=await db.rpc('request_booking',{p_service:selected.id,p_day:document.getElementById('date').value,p_time:time,p_name:name.value,p_phone:phone.value});
   if(error)throw error;
   message('result','Pedido recebido. Referência: '+data+'. Aguarde a confirmação da Ana.');name.value='';phone.value='';await renderSlots();
  }catch(e){message('result','O pedido não foi confirmado: '+e.message);await renderSlots()}
  finally{summary()}
 };
 summary();
}
