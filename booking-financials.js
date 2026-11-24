import {lisbonDay} from './agenda.js';
const money=value=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(value);
export function paymentAmounts(total,depositReceived,paidInFull){
 const cents=Math.round(Number(total)*100);
 const deposit=depositReceived?Math.round(cents/2):0;
 const balance=paidInFull?cents-deposit:0;
 return {deposit:deposit/100,balance:balance/100,received:(deposit+balance)/100,outstanding:(cents-deposit-balance)/100};
}
export const attendanceLabel=value=>({unrecorded:'Presença por registar',attended:'✓ Compareceu',no_show:'✕ Faltou'})[value]||'Presença por registar';
export function financialControls(booking,{db,onSaved}){
 const record=Array.isArray(booking.booking_financials)?booking.booking_financials[0]:booking.booking_financials;
 const root=document.createElement('details');root.className='booking-financials';
 const summary=document.createElement('summary');
 const received=Number(record?.deposit_amount||0)+Number(record?.balance_amount||0);
 const paid=record&&Number(record.service_total)>0&&received>=Number(record.service_total);
 summary.textContent='👤 Presença e pagamento · '+attendanceLabel(record?.attendance)+(paid?' · Pago':record?.deposit_amount>0?' · Sinal recebido':record?.deposit_required?' · 50% por receber':'');
 root.append(summary);
 const form=document.createElement('form'),fields=document.createElement('fieldset');form.dataset.financeDirty='false';
 const input=(type,value='')=>{const item=document.createElement('input');item.type=type;item.value=value;return item};
 const label=(text,control)=>{const row=document.createElement('label');row.append(document.createTextNode(text),control);return row};
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 if(!record){status.textContent='Não foi possível carregar este registo. Atualize a agenda.';root.append(status);return root}
 const attendance=document.createElement('select');attendance.setAttribute('aria-label','Presença de '+booking.customer_name);
 for(const [value,text] of [['unrecorded','Por registar'],['attended','✓ Compareceu'],['no_show','✕ Faltou']]){const option=document.createElement('option');option.value=value;option.textContent=text;option.disabled=value!=='unrecorded'&&new Date(booking.starts_at)>new Date();attendance.append(option)}
 attendance.value=record.attendance;
 const total=input('number',record.service_total);total.min='0';total.step='0.01';total.required=true;
 const required=input('checkbox');required.checked=record.deposit_required;
 const deposit=input('checkbox');deposit.checked=Number(record.deposit_amount)>0;
 const full=input('checkbox');full.checked=paid;
 const today=lisbonDay(new Date());
 const depositDate=input('date',record.deposit_received_on||today);depositDate.max=today;
 const balanceDate=input('date',record.balance_received_on||today);balanceDate.max=today;
 const depositRow=label('Data em que recebeu o sinal',depositDate),balanceRow=label('Data em que recebeu o restante pagamento',balanceDate);
 const preview=document.createElement('p');preview.className='payment-preview';preview.setAttribute('aria-live','polite');
 const hint=document.createElement('p');hint.className='muted';hint.textContent=record.price_source==='catalog_reference'?'Preço de referência do catálogo atual. Confirme o preço acordado nesta marcação antes de guardar.':'O preço desta marcação fica guardado, mesmo que o catálogo mude.';
 const notice=document.createElement('p');notice.className='muted';notice.textContent='Registe apenas pagamentos realmente recebidos. Uma falta não apaga automaticamente um sinal recebido.';
 const refresh=()=>{if(deposit.checked)required.checked=true;depositRow.hidden=!deposit.checked;depositDate.required=deposit.checked;balanceRow.hidden=!full.checked;balanceDate.required=full.checked;const values=paymentAmounts(total.value,deposit.checked,full.checked);preview.textContent='Sinal de 50%: '+money(paymentAmounts(total.value,true,false).deposit)+' · Recebido: '+money(values.received)+' · Por receber: '+money(values.outstanding)};
 fields.append(label('Presença da cliente',attendance),label('Preço acordado (€)',total),hint,label('Exigir sinal de 50% nesta marcação',required),label('💶 Sinal de 50% recebido',deposit),depositRow,label('✓ Pagamento total concluído',full),balanceRow,preview,notice);
 const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Guardar presença e pagamento';fields.append(save);form.append(fields,status);root.append(form);
 form.oninput=()=>{form.dataset.financeDirty='true';refresh()};form.onchange=()=>{form.dataset.financeDirty='true';refresh()};
 let busy=false;
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;busy=true;fields.disabled=true;root.setAttribute('aria-busy','true');status.textContent='A guardar…';
  try{
   const {error}=await db.rpc('save_booking_financials',{p_booking:booking.id,p_attendance:attendance.value,p_total:Number(total.value),p_deposit_required:required.checked,p_deposit_received:deposit.checked,p_deposit_date:deposit.checked?depositDate.value:null,p_paid_in_full:full.checked,p_balance_date:full.checked?balanceDate.value:null,p_version:record.updated_at});
   if(error)throw error;
   form.dataset.financeDirty='false';status.textContent='Presença e pagamento guardados.';await onSaved();
  }catch(error){status.textContent='Não foi possível guardar: '+error.message}
  finally{busy=false;fields.disabled=false;root.removeAttribute('aria-busy')}
 };
 refresh();return root;
}
