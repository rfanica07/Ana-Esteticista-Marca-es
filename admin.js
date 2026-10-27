import {db,login,currentUser,message,registerWorker} from './backend.js';
import {initManualBookings} from './admin-create.js';
let authorized=false;
const $=id=>document.getElementById(id);
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('agendaDate').value=date;
$('signIn').onclick=async()=>{if(!$('email').reportValidity())return;try{await login($('email').value,'admin.html');message('status','Abra o link enviado para o email da Ana.')}catch(e){message('status',e.message)}};
$('signOut').onclick=async()=>{await db.auth.signOut();location.reload()};
async function load(){
 if(!authorized)return;
 message('status','A consultar a agenda…');
 // UTC boundaries expanded, followed by exact Lisbon date filter (DST-safe).
 const day=$('agendaDate').value;if(!day)return;
 const start=new Date(day+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-1);
 const end=new Date(day+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+2);
 const {data,error}=await db.from('bookings').select('*,services(name,category)').gte('starts_at',start.toISOString()).lt('starts_at',end.toISOString()).order('starts_at');
 if(error){message('status','Não foi possível carregar a agenda.');return}
 const bookings=data.filter(b=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.starts_at))===day);
 $('bookings').replaceChildren();message('count',bookings.length+' marcações neste dia');
 for(const b of bookings){
  const article=document.createElement('article'),title=document.createElement('h2'),details=document.createElement('p'),state=document.createElement('p'),actions=document.createElement('div');actions.className='actions';
  const hour=d=>new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit'}).format(new Date(d));
  title.textContent=hour(b.starts_at)+'–'+hour(b.ends_at)+' · '+b.customer_name;
  details.textContent=b.services.name+' · '+b.services.category+' · '+b.phone;
  state.textContent=({pending:'Aguarda confirmação',confirmed:'Confirmada',declined:'Recusada',cancelled:'Cancelada'})[b.status];
  for(const [status,label] of b.status==='pending'?[['confirmed','Confirmar'],['declined','Recusar']]:b.status==='confirmed'?[['cancelled','Cancelar']]:[]){
   const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;const {error}=await db.rpc('set_booking_status',{p_id:b.id,p_status:status});if(error){message('status',error.message);button.disabled=false}else await load()};actions.append(button)
  }
  article.append(title,details,state,actions);$('bookings').append(article)
 }
 message('status','Agenda atualizada. Os pedidos pendentes já reservam o horário.');
}
$('agendaDate').onchange=load;$('refresh').onclick=load;
$('enablePush').onclick=async()=>{
 try{
  if(!authorized)throw Error('Entre primeiro na conta da Ana.');
  if(!('PushManager' in window)||!('Notification' in window))throw Error('Neste dispositivo, abra a app instalada no ecrã principal para ativar notificações.');
  if(!window.ANA_CONFIG.vapidPublicKey)throw Error('As notificações ainda precisam de ser configuradas no servidor.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('As notificações não foram autorizadas. Pode alterar esta opção nas definições do telemóvel.');
  await registerWorker();const reg=await navigator.serviceWorker.ready;
  const encoded=window.ANA_CONFIG.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/');
  const key=Uint8Array.from(atob(encoded+'='.repeat((4-encoded.length%4)%4)),c=>c.charCodeAt(0));
  const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const user=await currentUser();const {error}=await db.from('push_subscriptions').upsert({endpoint:sub.endpoint,user_id:user.id,subscription:sub.toJSON()});
  if(error)throw error;
  message('pushStatus','Este telemóvel ficou registado para receber notificações. Falta validar o envio com um pedido de teste.');
 }catch(e){message('pushStatus',e.message)}
};
if(!db){message('status','A base de dados ainda não está ligada. A agenda privada fica disponível após a configuração.');$('signIn').disabled=true}
else{
 const user=await currentUser();
 if(user){const {data,error}=await db.from('staff').select('user_id').eq('user_id',user.id).maybeSingle();authorized=!!data&&!error;
 if(authorized){$('login').hidden=true;$('agenda').hidden=false;await initManualBookings({db,onSaved:async day=>{$('agendaDate').value=day;await load()}});await load()}else message('status','Esta conta não está autorizada a gerir a agenda.')}
}
