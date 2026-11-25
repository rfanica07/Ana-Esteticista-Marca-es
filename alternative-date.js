import {serviceDescription} from './follow-up.js?v=20261125-direct-confirm';
import {fullDate,hour,internationalPhone} from './agenda.js';
export function alternativeDateMessage(booking){return `Olá ${booking.customer_name}! É a Ana Esteticista 🌸

Não conseguirei atendê-la na data pedida para ${serviceDescription(booking.services||{})}: ${fullDate(booking.starts_at)}, às ${hour(booking.starts_at)} 🕒.

Podemos combinar outra data? Responda a esta mensagem com os dias e horários que lhe dão mais jeito, ou escolha um novo horário na app:
https://ana-esteticista.pages.dev/

A nova data fica combinada depois de eu a confirmar.
Obrigada, beijinhos! 🌸`}
export function alternativeDateControls(booking,{onNewBooking}={}){
 const root=document.createElement('details');root.className='alternative-date';const title=document.createElement('summary');title.textContent='Combinar outra data · mensagem à cliente';
 const note=document.createElement('p');note.className='muted';note.textContent='Pode pedir outra data pelo WhatsApp ou SMS. A mensagem é enviada manualmente. Abrir ou copiar não altera a marcação.';
 const text=document.createElement('textarea');text.value=alternativeDateMessage(booking);text.rows=7;text.readOnly=true;text.setAttribute('aria-label','Mensagem para combinar outra data com '+booking.customer_name);
 const actions=document.createElement('div');actions.className='actions';const phone=internationalPhone(booking.phone);let wa,sms;
 if(/^\d{10,15}$/.test(phone)){wa=document.createElement('a');wa.textContent='Abrir WhatsApp';wa.target='_blank';wa.rel='noopener noreferrer';sms=document.createElement('a');sms.textContent='Abrir SMS';actions.append(wa,sms)}
 const update=()=>{if(wa)wa.href='https://wa.me/'+phone+'?text='+encodeURIComponent(text.value);if(sms)sms.href='sms:+'+phone+'?body='+encodeURIComponent(text.value)};text.oninput=update;update();
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar mensagem';const status=document.createElement('p');status.setAttribute('role','status');copy.onclick=async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Mensagem copiada. Cole na conversa da cliente.'}catch{text.focus();text.select();status.textContent='Selecione e copie a mensagem acima.'}};actions.append(copy);
 if(onNewBooking){const book=document.createElement('button');book.type='button';book.textContent='Preparar nova marcação';book.onclick=()=>onNewBooking(booking);actions.append(book)}
 root.append(title,note,text,actions,status);return root;
}
