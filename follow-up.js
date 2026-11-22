import {fullDate,hour,internationalPhone} from './agenda.js';
export function followUpMessage(booking){
 return `Olá ${booking.customer_name}! É a Ana Esteticista. Lembro a sua marcação de ${booking.services?.name||'atendimento'} para ${fullDate(booking.starts_at)}, às ${hour(booking.starts_at)}. Se precisar de alterar, responda a esta mensagem. Até breve!`;
}
export function followUpLink(booking,text=followUpMessage(booking)){
 const phone=internationalPhone(booking.phone);
 return /^\d{10,15}$/.test(phone)?'https://wa.me/'+phone+'?text='+encodeURIComponent(text):null;
}
export function followUpControls(booking,{db,onSaved=()=>{}}={}){
 const panel=document.createElement('details');panel.className='follow-up';
 const title=document.createElement('summary');title.textContent='Lembrete por WhatsApp';
 const note=document.createElement('p');note.textContent='Reveja a mensagem. O WhatsApp abre com o texto preparado; a Ana toca em Enviar para concluir.';
 const text=document.createElement('textarea');text.value=followUpMessage(booking);text.rows=5;text.readOnly=true;text.setAttribute('aria-label','Mensagem de lembrete para '+booking.customer_name);
 const actions=document.createElement('div');actions.className='actions';
 const url=followUpLink(booking,text.value);
 if(url){const send=document.createElement('a');send.href=url;send.target='_blank';send.rel='noopener noreferrer';send.textContent='Abrir no WhatsApp';actions.append(send)}
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar mensagem';
 const status=document.createElement('p');status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Mensagem copiada. Cole na conversa da cliente.'}catch{text.focus();text.select();status.textContent='Selecione e copie o texto acima para colar no WhatsApp.'}};
 actions.append(copy);
 if(booking.follow_up_sent_at){const sent=document.createElement('p');sent.className='follow-up-sent';sent.textContent='Marcado como enviado em '+fullDate(booking.follow_up_sent_at)+' às '+hour(booking.follow_up_sent_at);panel.append(sent)}
 else if(db&&new Date(booking.starts_at)>new Date()){const mark=document.createElement('button');mark.type='button';mark.textContent='Já enviei o lembrete';mark.onclick=async()=>{mark.disabled=true;const {error}=await db.rpc('mark_follow_up_sent',{p_id:booking.id});if(error){status.textContent=error.message;mark.disabled=false}else{status.textContent='Lembrete marcado como enviado.';await onSaved()}};actions.append(mark)}
 panel.append(title,note,text,actions,status);return panel;
}
