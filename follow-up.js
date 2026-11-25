import {closedDayReason} from './closure-calendar.js?v=20261125';
import {fullDate,hour,internationalPhone,lisbonDay} from './agenda.js';
export function serviceEmoji(service={}){
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const category=normalize(service.category),name=normalize(service.name);
 if(category.includes('laser')||name.includes('laser'))return '✨';
 if(category.includes('cera')||name.includes('cera')||/buco|sobrancelh/.test(name))return '🍯';
 if(category.includes('pes')||name.includes('pedicure'))return '🦶';
 if(category.includes('maos')||/manicure|unhas|gel/.test(name))return '💅';
 if(name.includes('limpeza')&&name.includes('pele'))return '🧖‍♀️';
 return '✨';
}
export function serviceDescription(service={}){
 const name=String(service.name||'Atendimento').trim();
 const normalized=(String(service.category||'')+' '+name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let label=name;
 if(normalized.includes('laser')&&!/depila.*laser/.test(normalized.split(' ').slice(1).join(' ')))label='Depilação a laser · '+name;
 else if((normalized.includes('cera')||/buco|sobrancelh/.test(normalized))&&!/depila.*cera/.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))label='Depilação a cera · '+name;
 return label+' '+serviceEmoji(service);
}
export function followUpMessage(booking){
 return `Olá ${booking.customer_name}! É a Ana Esteticista 🌸

A sua marcação de ${serviceDescription(booking.services)} está agendada para ${fullDate(booking.starts_at)}, às ${hour(booking.starts_at)} 🕒.

Por favor, responda a esta mensagem para confirmar a sua presença. Se precisar de alterar ou cancelar, avise-me também por aqui.

Obrigada, beijinhos e até breve! 🌸`;
}
export function followUpLink(booking,text=followUpMessage(booking)){
 const phone=internationalPhone(booking.phone);
 return /^\d{10,15}$/.test(phone)?'https://wa.me/'+phone+'?text='+encodeURIComponent(text):null;
}
export function bookingStage(booking){
 if(booking.status!=='confirmed')return ({pending:'Pedido pendente',cancelled:'Cancelada',declined:'Recusada'})[booking.status]||booking.status;
 return booking.customer_confirmed_at?'Confirmado':booking.follow_up_sent_at?'Lembrete enviado':'Marcado';
}
export function followUpBookings(bookings,filter='unsent',now=new Date()){
 const time=new Date(now).getTime();
 const items=bookings.filter(booking=>{
  const past=new Date(booking.starts_at).getTime()<=time;
  if(filter==='history')return past;
  if(booking.status!=='confirmed'||past)return false;
  if(filter==='confirmed')return !!booking.customer_confirmed_at;
  if(booking.customer_confirmed_at)return false;
  if(filter==='sent')return !!booking.follow_up_sent_at;
  return !booking.follow_up_sent_at;
 });
 return items.sort((a,b)=>filter==='history'?new Date(b.starts_at)-new Date(a.starts_at):new Date(a.starts_at)-new Date(b.starts_at));
}
export function followUpControls(booking,{db,onSaved=()=>{}}={}){
 const panel=document.createElement('details');panel.className='follow-up';
 const title=document.createElement('summary');title.textContent=booking.follow_up_sent_at?'✓ Mensagem enviada':'Mensagem de confirmação · Por enviar';
 const note=document.createElement('p');note.textContent='Envie pelo WhatsApp ou por SMS e, depois, toque em ✓ Enviada. Abrir a mensagem não a marca como enviada.';
 const text=document.createElement('textarea');text.value=followUpMessage(booking);text.rows=5;text.readOnly=true;text.setAttribute('aria-label','Mensagem de lembrete para '+booking.customer_name);
 const actions=document.createElement('div');actions.className='actions';
 const url=followUpLink(booking,text.value);
 if(url){const send=document.createElement('a');send.href=url;send.target='_blank';send.rel='noopener noreferrer';send.textContent='Abrir no WhatsApp';actions.append(send);const sms=document.createElement('a');sms.href='sms:+'+internationalPhone(booking.phone)+'?body='+encodeURIComponent(text.value);sms.textContent='Abrir SMS';actions.append(sms)}
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar mensagem';
 const status=document.createElement('p');status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Mensagem copiada. Cole na conversa da cliente.'}catch{text.focus();text.select();status.textContent='Selecione e copie o texto acima para colar no WhatsApp.'}};
 actions.append(copy);
 if(booking.follow_up_sent_at){const sent=document.createElement('p');sent.className='follow-up-sent';sent.textContent='Marcado como enviado em '+fullDate(booking.follow_up_sent_at)+' às '+hour(booking.follow_up_sent_at);actions.append(sent)}
 else if(db&&new Date(booking.starts_at)>new Date()){const mark=document.createElement('button');mark.type='button';mark.textContent='✓ Enviada';mark.className='primary';mark.setAttribute('aria-label','Marcar mensagem para '+booking.customer_name+' como enviada');mark.onclick=async()=>{mark.disabled=true;const {error}=await db.rpc('mark_follow_up_sent',{p_id:booking.id});if(error){status.textContent=error.message;mark.disabled=false}else{status.textContent='Lembrete marcado como enviado.';await onSaved()}};actions.append(mark)}

 panel.append(title,note,text,actions,status);return panel;
}

export function canConfirmCustomer(booking,now=new Date()){
 return booking.status==='confirmed'&&!booking.customer_confirmed_at&&new Date(booking.starts_at)>new Date(now)&&!closedDayReason(lisbonDay(booking.starts_at));
}
export function customerConfirmationControls(booking,{db,onSaved=()=>{}}={}){
 const root=document.createElement('div');root.className='customer-confirmation';
 if(!db||!canConfirmCustomer(booking))return root;
 const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='✓ Cliente confirmou';button.setAttribute('aria-label','Registar que '+booking.customer_name+' confirmou a presença');
 const note=document.createElement('p');note.className='muted';note.textContent='Use depois de a cliente responder que vai comparecer.'+(!booking.follow_up_sent_at?' Também regista o lembrete como enviado.':'');
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 button.onclick=async()=>{if(button.disabled)return;button.disabled=true;root.setAttribute('aria-busy','true');status.textContent='A guardar confirmação…';try{const {error}=await db.rpc('confirm_customer_booking',{p_id:booking.id});if(error)throw error;status.textContent='Confirmação da cliente guardada.';await onSaved()}catch(error){status.textContent='Não foi possível guardar: '+error.message;button.disabled=false}finally{root.removeAttribute('aria-busy')}};
 root.append(button,note,status);return root;
}
