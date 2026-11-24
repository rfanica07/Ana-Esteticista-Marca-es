import {internationalPhone,fullDate,hour} from './agenda.js';
const one=value=>Array.isArray(value)?value[0]:value;
export const paymentPolicyLabel=value=>({none:'Sem pagamento antecipado',half:'Pedir 50% antecipado',full:'Pedir 100% antecipado'})[value]||'Sem pagamento antecipado';
export function customerHistorySummary(bookings,phone){
 const key=internationalPhone(String(phone||''));
 const items=bookings.filter(item=>internationalPhone(String(item.phone||''))===key).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at));
 return {items,attended:items.filter(b=>one(b.booking_financials)?.attendance==='attended').length,noShow:items.filter(b=>one(b.booking_financials)?.attendance==='no_show').length,cancelled:items.filter(b=>b.status==='cancelled').length};
}
export function createCustomerHistory({db,onSaved}){
 let bookings=[],profiles=new Map(),dataKey='';
 const controller={
  setData(items,records){bookings=items;profiles=new Map(records.map(item=>[item.phone,item]));dataKey=JSON.stringify([items.map(item=>[item.id,item.phone,item.status,item.booking_financials]),records])},
  get key(){return dataKey},
  hint(phone){const normalized=internationalPhone(String(phone||''));if(!normalized)return '';const history=customerHistorySummary(bookings,phone),profile=profiles.get(normalized);if(!history.items.length&&!profile)return '';return paymentPolicyLabel(profile?.payment_policy)+' · '+history.attended+' presenças · '+history.noShow+' faltas · '+history.cancelled+' cancelamentos'+(profile?.note?'\nNota privada: '+profile.note:'')},
  controls(phone){
   const normalized=internationalPhone(String(phone||'')),profile=profiles.get(normalized),history=customerHistorySummary(bookings,phone);
   const root=document.createElement('details');root.className='customer-history';
   const summary=document.createElement('summary');summary.textContent='👤 Histórico privado · '+history.noShow+' faltas · '+paymentPolicyLabel(profile?.payment_policy);root.append(summary);
   const count=document.createElement('p');count.textContent=history.attended+' presenças registadas · '+history.noShow+' faltas · '+history.cancelled+' cancelamentos';
   const help=document.createElement('p');help.className='muted';help.textContent='Só a Ana vê este histórico. Uma marcação passada sem presença registada não conta como falta. Os cancelamentos podem ter sido feitos pela Ana ou pela cliente.';
   const form=document.createElement('form');form.dataset.historyDirty='false';
   const fields=document.createElement('fieldset');
   const policy=document.createElement('select');for(const value of ['none','half','full']){const option=document.createElement('option');option.value=value;option.textContent=paymentPolicyLabel(value);policy.append(option)}policy.value=profile?.payment_policy||'none';
   const policyLabel=document.createElement('label');policyLabel.textContent='Pagamento para próximas marcações';policyLabel.append(policy);
   const note=document.createElement('textarea');note.maxLength=2000;note.rows=4;note.value=profile?.note||'';note.placeholder='Ex.: 24/11 — avisou com antecedência. Registe apenas observações sobre as marcações.';
   const noteLabel=document.createElement('label');noteLabel.textContent='Nota privada da Ana';noteLabel.append(note);
   const explanation=document.createElement('p');explanation.className='muted';explanation.textContent='A escolha fica predefinida nas novas marcações desta cliente, feitas pela Ana ou pela cliente. Os pagamentos são registados manualmente quando forem recebidos.';
   const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Guardar nota e preferência';
   const status=document.createElement('p');status.setAttribute('role','status');fields.append(policyLabel,noteLabel,explanation,save);form.append(fields,status);
   form.oninput=form.onchange=()=>form.dataset.historyDirty='true';
   form.onsubmit=async event=>{event.preventDefault();if(fields.disabled||!form.reportValidity())return;fields.disabled=true;root.setAttribute('aria-busy','true');status.textContent='A guardar…';try{const {error}=await db.rpc('save_customer_private_profile',{p_phone:normalized,p_note:note.value,p_policy:policy.value,p_version:profile?.updated_at||null});if(error)throw error;form.dataset.historyDirty='false';status.textContent='Histórico guardado.';await onSaved()}catch(error){status.textContent='Não foi possível guardar: '+error.message}finally{fields.disabled=false;root.removeAttribute('aria-busy')}};
   const list=document.createElement('details');const listTitle=document.createElement('summary');listTitle.textContent='Ver marcações anteriores e próximas';list.append(listTitle);
   for(const item of history.items){const row=document.createElement('p');const presence=one(item.booking_financials)?.attendance;const state=presence==='no_show'?'Faltou':presence==='attended'?'Compareceu':item.status==='cancelled'?'Cancelada':item.status==='declined'?'Recusada':item.status==='pending'?'Pendente':'Marcado · presença por registar';row.textContent=fullDate(item.starts_at)+' · '+hour(item.starts_at)+' · '+(item.services?.name||'Serviço')+' · '+state;list.append(row)}
   if(!history.items.length){const empty=document.createElement('p');empty.textContent='Ainda não há marcações guardadas.';list.append(empty)}
   root.append(count,help,form,list);return root;
  }
 };
 return controller;
}
