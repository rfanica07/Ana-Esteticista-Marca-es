import {db,bindLogin,recoveryLink,currentUser,message,registerWorker,enablePush,signOutDevice} from './backend.js?v=20261122';
import {followUpControls} from './follow-up.js';
import {initManualBookings} from './admin-create.js';
import {lisbonDay,hour,fullDate,internationalPhone,pendingBookings} from './agenda.js';
let authorized = false;
let request = 0;
const $ = id => document.getElementById(id);
const today = lisbonDay(new Date());
const requestedDay = new URLSearchParams(location.search).get('day');
$('agendaDate').value = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay || '') ? requestedDay : today;
$('calendarMonth').value = $('agendaDate').value.slice(0,7);
$('signOut').onclick = async () => {await signOutDevice();location.reload()};
function card(booking, showDay = false) {
 const article=document.createElement('article');
 const title=document.createElement('h3');
 title.textContent=(showDay ? fullDate(booking.starts_at)+' · ' : '')+hour(booking.starts_at)+'–'+hour(booking.ends_at)+' · '+booking.customer_name;
 const details=document.createElement('p');
 details.textContent=(booking.services?.name || 'Serviço')+' · '+booking.phone;
 const state=document.createElement('p');
 state.textContent=({pending:'Aguarda confirmação',confirmed:'Confirmada',declined:'Recusada',cancelled:'Cancelada'})[booking.status];
 const actions=document.createElement('div');actions.className='actions';
 const transitions=booking.status==='pending' ? [['confirmed','Confirmar'],['declined','Recusar']] : booking.status==='confirmed' ? [['cancelled','Cancelar']] : [];
 for(const [status,label] of transitions) {
  const button=document.createElement('button');button.textContent=label;
  button.onclick=async()=>{
   for(const item of actions.querySelectorAll('button'))item.disabled=true;
   try {
    const {error}=await db.rpc('set_booking_status',{p_id:booking.id,p_status:status});
    if(error)throw error;
    await load();
   }catch(error){message('status',error.message);for(const item of actions.querySelectorAll('button'))item.disabled=false}
  };
  actions.append(button);
 }

 const phone=document.createElement('a');phone.href='tel:+'+internationalPhone(booking.phone);phone.textContent='Ligar';actions.append(phone);
 article.append(title,details,state,actions);
 if(booking.status==='confirmed')article.append(followUpControls(booking));
 return article;
}
function selectDay(day) {
 $('agendaDate').value=day;
 $('calendarMonth').value=day.slice(0,7);
 load();
}
function renderMonth(bookings) {
 const month=$('calendarMonth').value;
 if(!/^\d{4}-\d{2}$/.test(month))return;
 const [year,number]=month.split('-').map(Number);
 const total=new Date(Date.UTC(year,number,0)).getUTCDate();
 const grid=$('calendarDays');grid.replaceChildren();
 const offset=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;
 for(let index=0;index<offset;index++)grid.append(document.createElement('span'));
 for(let day=1;day<=total;day++) {
  const key=month+'-'+String(day).padStart(2,'0');
  const active=bookings.filter(booking=>lisbonDay(booking.starts_at)===key&&['pending','confirmed'].includes(booking.status));
  const button=document.createElement('button');button.textContent=day+(active.length?' · '+active.length:'');
  button.setAttribute('aria-label',key+' · '+active.length+' marcações');
  button.setAttribute('aria-pressed',String(key===$('agendaDate').value));
  button.onclick=()=>selectDay(key);grid.append(button);
 }
}
async function loadContacts() {
 const {data,error}=await db.from('customer_contacts').select('name,phone,updated_at').order('name').limit(1000);
 if(error){message('contactStatus','Não foi possível carregar os contactos.');return}
 const query=$('contactSearch').value.toLocaleLowerCase('pt-PT');
 $('contacts').replaceChildren();
 for(const contact of data.filter(item=>(item.name+' '+item.phone).toLocaleLowerCase('pt-PT').includes(query))) {
  const row=document.createElement('p');const name=document.createElement('strong');name.textContent=contact.name+' · ';
  const phone=document.createElement('a');phone.textContent=contact.phone;phone.href='tel:+'+internationalPhone(contact.phone);
  row.append(name,phone);$('contacts').append(row);
 }
 message('contactStatus',data.length+' contactos guardados. Números nacionais de 9 dígitos usam +351.');
}
async function load() {
 if(!authorized)return;
 const current=++request;
 message('status','A consultar a agenda…');
 const day=$('agendaDate').value;
 const month=$('calendarMonth').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{4}-\d{2}$/.test(month)){message('status','Escolha um dia e um mês válidos.');return}
 const start=new Date(day+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-1);
 const end=new Date(day+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+2);
 const monthStart=new Date(month+'-01T00:00:00Z');monthStart.setUTCDate(monthStart.getUTCDate()-1);
 const monthEnd=new Date(month+'-01T00:00:00Z');monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1);monthEnd.setUTCDate(2);
 const fields='*,services(name,category)';
 const [daily,pending,monthly]=await Promise.all([
  db.from('bookings').select(fields).gte('starts_at',start.toISOString()).lt('starts_at',end.toISOString()).order('starts_at'),
  db.from('bookings').select(fields).eq('status','pending').gte('starts_at',new Date().toISOString()).order('starts_at').limit(200),
  db.from('bookings').select('starts_at,status').gte('starts_at',monthStart.toISOString()).lt('starts_at',monthEnd.toISOString()).order('starts_at')
 ]);
 if(current!==request)return;
 if(daily.error||pending.error||monthly.error){message('status','Não foi possível atualizar a agenda. Toque em Atualizar agenda.');return}
 const selected=daily.data.filter(booking=>lisbonDay(booking.starts_at)===day);
 $('bookings').replaceChildren(...selected.map(booking=>card(booking)));
 message('count',fullDate(day+'T12:00:00Z')+' · '+selected.length+' marcações');
 const pendingItems=pendingBookings(pending.data);
 message('pendingCount',pendingItems.length ? pendingItems.length+' pedidos por confirmar' : 'Sem pedidos pendentes');
 $('pendingBookings').replaceChildren(...pendingItems.map(booking=>card(booking,true)));
 renderMonth(monthly.data);
 message('status','Agenda atualizada. Os pedidos de todos os dias aparecem em Pedidos pendentes.');
 await loadContacts();
 const {data:requests,error:requestError}=await db.from('data_requests').select('id,request_type,details,created_at,status,user_id,requester_email').eq('status','pending').order('created_at');
 $('dataRequests').replaceChildren();
 if(requestError){$('dataRequests').textContent='Não foi possível consultar os pedidos sobre dados pessoais.';return}
 if(!requests.length)$('dataRequests').textContent='Sem pedidos pendentes.';
 for(const item of requests){
  const row=document.createElement('p');row.textContent=fullDate(item.created_at)+' · '+({access:'Acesso',correction:'Correção',deletion:'Apagamento'})[item.request_type]+' · '+(item.requester_email||item.user_id)+' · '+item.details;const button=document.createElement('button');button.textContent='Marcar como respondido';button.onclick=async()=>{button.disabled=true;const {error}=await db.rpc('complete_data_request',{p_id:item.id});if(error){message('status',error.message);button.disabled=false}else load()};row.append(button);$('dataRequests').append(row);
 }
}
$('agendaDate').onchange=()=>{$('calendarMonth').value=$('agendaDate').value.slice(0,7);load()};
$('calendarMonth').onchange=load;
$('refresh').onclick=load;
$('contactSearch').oninput=loadContacts;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
window.addEventListener('focus',()=>load());
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='booking-update')load()});
setInterval(()=>{if(authorized&&!document.hidden)load()},30000);
$('enablePush').onclick=async()=>{
 try{
  if(!authorized)throw Error('Entre primeiro na conta da Ana.');
  await enablePush();
  message('pushStatus','Este telemóvel está registado para receber os pedidos e o resumo diário da agenda.');
 }catch(e){message('pushStatus',e.message)}
};
if(!db){message('status','A base de dados ainda não está ligada. A agenda privada fica disponível após a configuração.');$('signIn').disabled=true}
else{
 bindLogin('email','status',()=>location.reload());
 const user=await currentUser();
 if(user&&!recoveryLink){const {data,error}=await db.from('staff').select('user_id').eq('user_id',user.id).maybeSingle();authorized=!!data&&!error;
 if(authorized){$('login').hidden=true;$('agenda').hidden=false;registerWorker().catch(()=>{});await initManualBookings({db,onSaved:async day=>{$('agendaDate').value=day;await load()}});await load()}else message('status','Esta conta não está autorizada a gerir a agenda.')}
}
