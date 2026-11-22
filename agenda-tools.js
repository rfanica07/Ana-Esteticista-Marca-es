import {fullDate,hour,lisbonDay} from './agenda.js';
const el=id=>document.getElementById(id);
export function rescheduleControls({db,booking,onSaved}){
 const panel=document.createElement('details');panel.className='reschedule';
 const title=document.createElement('summary');title.textContent='Reagendar';
 const note=document.createElement('p');note.textContent='O novo horário fica confirmado. A cliente com conta recebe um aviso na app; para marcações manuais, envie também a mensagem no WhatsApp.';
 const form=document.createElement('form');const day=document.createElement('input');day.type='date';day.required=true;day.min=lisbonDay(new Date());day.value=lisbonDay(booking.starts_at);day.setAttribute('aria-label','Novo dia');
 const time=document.createElement('select');time.required=true;time.setAttribute('aria-label','Nova hora');
 const save=document.createElement('button');save.type='submit';save.textContent='Confirmar novo horário';save.className='primary';save.disabled=true;
 const status=document.createElement('p');status.setAttribute('role','status');let request=0,verified=null,busy=false;
 async function slots(){const current=++request;verified=null;save.disabled=true;time.disabled=true;time.replaceChildren();status.textContent='A consultar horários…';
 const {data,error}=await db.rpc('reschedule_slots',{p_id:booking.id,p_day:day.value});if(current!==request)return;
 if(error){status.textContent='Não foi possível consultar os horários. '+error.message;return}
 const first=document.createElement('option');first.value='';first.textContent=data.length?'Escolha a hora':'Sem horários disponíveis';time.append(first);
 for(const item of data){const option=document.createElement('option');option.value=option.textContent=item.slot;time.append(option)}verified=day.value;time.disabled=!data.length;status.textContent='';}
 day.onchange=slots;time.onchange=()=>save.disabled=busy||!time.value||verified!==day.value;
 panel.ontoggle=()=>{if(panel.open&&!verified)slots()};
 form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity()||verified!==day.value)return;busy=true;save.disabled=true;day.disabled=time.disabled=true;
 try{const {error}=await db.rpc('reschedule_booking',{p_id:booking.id,p_day:day.value,p_time:time.value});if(error)throw error;status.textContent='Novo horário guardado.';await onSaved(day.value)}catch(error){status.textContent=error.message;day.disabled=time.disabled=false;busy=false;save.disabled=false}};
 const dl=document.createElement('label');dl.textContent='Novo dia';dl.append(day);const tl=document.createElement('label');tl.textContent='Nova hora';tl.append(time);form.append(dl,tl,save,status);panel.append(title,note,form);return panel;
}
export async function initAgendaTools({db,onChanged,selectDay}){
 el('goToday').onclick=()=>selectDay(lisbonDay(new Date()));
 el('goTomorrow').onclick=()=>{const day=new Date(lisbonDay(new Date())+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+1);selectDay(day.toISOString().slice(0,10))};
 el('goPending').onclick=()=>el('pendingPanel').scrollIntoView({behavior:'smooth',block:'start'});
 el('goNew').onclick=()=>{el('manualBooking').open=true;el('manualBooking').scrollIntoView({behavior:'smooth',block:'start'})};
 el('blockFrom').value=el('blockUntil').value=lisbonDay(new Date());
 el('blockAllDay').onchange=()=>{const full=el('blockAllDay').checked;el('blockStart').value=full?'00:00':'09:00';el('blockEnd').value=full?'23:59':'10:00'};
 el('blockForm').onsubmit=async event=>{event.preventDefault();const button=el('blockSave');button.disabled=true;try{const {error}=await db.rpc('add_agenda_block',{p_from:el('blockFrom').value,p_start:el('blockStart').value,p_until:el('blockUntil').value,p_end:el('blockEnd').value,p_reason:el('blockReason').value.trim()});if(error)throw error;el('blockStatus').textContent='Intervalo bloqueado. As clientes já não o podem escolher.';await refreshBlocks();await onChanged()}catch(error){el('blockStatus').textContent=error.message}finally{button.disabled=false}};
 async function refreshBlocks(){const {data,error}=await db.from('agenda_blocks').select('id,starts_at,ends_at,reason').eq('active',true).gte('ends_at',new Date().toISOString()).order('starts_at');const list=el('blockList');list.replaceChildren();if(error){list.textContent='Não foi possível carregar os bloqueios.';return}if(!data.length)list.textContent='Sem bloqueios futuros.';
 for(const block of data){const row=document.createElement('div');row.className='block-row';const text=document.createElement('p');text.textContent=fullDate(block.starts_at)+' '+hour(block.starts_at)+' → '+fullDate(block.ends_at)+' '+hour(block.ends_at)+' · '+block.reason;const remove=document.createElement('button');remove.textContent='Libertar horário';remove.onclick=async()=>{remove.disabled=true;const {error}=await db.rpc('remove_agenda_block',{p_id:block.id});if(error){el('blockStatus').textContent=error.message;remove.disabled=false}else{await refreshBlocks();await onChanged()}};row.append(text,remove);list.append(row)}}
 await refreshBlocks();return {refreshBlocks};
}
export async function refreshNotificationHealth(db){
 const node=el('notificationHealth');const {data,error}=await db.rpc('notification_health');
 if(error){node.textContent='Não foi possível consultar o estado dos avisos.';return}
 node.textContent=data.registered_devices+' dispositivos registados · últimas 24 h: '+data.accepted+' avisos aceites pelo serviço, '+data.queued+' eventos sem confirmação de envio. A aceitação pelo serviço não comprova leitura no telemóvel.';
}
