export async function initManualBookings({db,onSaved,isKnownContact=()=>false}) {
 const el=id=>document.getElementById(id);
 const form=el('manualForm'),fields=el('manualFields'),service=el('manualService'),day=el('manualDay'),time=el('manualTime'),submit=el('manualSubmit');
 const status=text=>{el('manualStatus').textContent=text};
 let request=0,verifiedKey=null,busy=false,contacts=[],contactsReady=false,mode='new',selectedPhone='';
 const name=el('manualName'),phone=el('manualPhone'),picker=el('manualContact'),search=el('manualContactSearch');
 const key=value=>String(value||'').replace(/\D/g,'').replace(/^00/,'').replace(/^(\d{9})$/,'351$1');
 const selected=()=>contacts.find(contact=>key(contact.phone)===selectedPhone);
 function renderContacts(){
  const query=search.value.trim().toLocaleLowerCase('pt-PT');
  const digits=query.replace(/\D/g,'');
  const matches=contacts.filter(contact=>(contact.name+' '+contact.phone).toLocaleLowerCase('pt-PT').includes(query)||(digits&&key(contact.phone).includes(digits)));
  const visible=matches.slice();const chosen=selected();
  if(chosen&&!visible.includes(chosen))visible.unshift(chosen);
  const first=document.createElement('option');first.value='';first.textContent=!contactsReady?'A carregar contactos…':!contacts.length?'Ainda não há clientes guardadas':'Selecione a cliente';picker.replaceChildren(first);
  for(const contact of visible){const option=document.createElement('option');option.value=key(contact.phone);option.textContent=contact.name+' · '+contact.phone;picker.append(option)}
  picker.value=selectedPhone;picker.disabled=!contactsReady||!contacts.length;
  el('manualContactHint').textContent=!contactsReady?'A carregar a lista de clientes…':!contacts.length?'Escolha Nova cliente para guardar a primeira marcação.':query&&!matches.length?'Nenhuma cliente encontrada. Experimente outro nome ou telefone.':matches.length+' clientes na lista. Escolha uma para preencher os dados.';
 }
 function setMode(next){
  if(busy||next===mode)return;
  mode=next;if(el('manualAccountEmail'))el('manualAccountEmail').value='';selectedPhone='';name.value='';phone.value='';search.value='';
  el('manualExistingFields').hidden=mode!=='existing';picker.required=mode==='existing';
  name.readOnly=phone.readOnly=mode==='existing';
  el('manualNewClient').setAttribute('aria-pressed',String(mode==='new'));el('manualExistingClient').setAttribute('aria-pressed',String(mode==='existing'));
  renderContacts();el('manualInvite').hidden=true;
 }
 el('manualNewClient').onclick=()=>setMode('new');el('manualExistingClient').onclick=()=>setMode('existing');
 search.oninput=renderContacts;
 picker.onchange=()=>{if(el('manualAccountEmail'))el('manualAccountEmail').value='';selectedPhone=picker.value;const contact=selected();name.value=contact?.name||'';phone.value=contact?.phone||'';el('manualInvite').hidden=true};
 const controller={
  setContacts(items){contacts=items;contactsReady=true;if(selectedPhone&&!selected()){selectedPhone='';name.value='';phone.value=''}renderContacts()},
  startForContact(contact){
   if(busy)return false;
   if(el('manualAccountEmail'))el('manualAccountEmail').value='';
   if(!contacts.some(item=>key(item.phone)===key(contact.phone)))contacts.push(contact);
   setMode('existing');selectedPhone=key(contact.phone);search.value='';renderContacts();name.value=contact.name;phone.value=contact.phone;
   el('manualBooking').open=true;el('manualBooking').scrollIntoView({behavior:'smooth',block:'start'});service.focus();
   return true;
  }
 };
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 day.min=today;day.value=today;
 const lastDay=new Date(today+'T12:00:00Z');lastDay.setUTCDate(lastDay.getUTCDate()+180);day.max=lastDay.toISOString().slice(0,10);
 const placeholder=text=>{const option=document.createElement('option');option.value='';option.textContent=text;time.replaceChildren(option)};
 async function loadSlots(){
  if(busy)return;
  const current=++request;verifiedKey=null;submit.disabled=true;time.disabled=true;
  const serviceId=service.value,date=day.value,key=serviceId+'|'+date;
  placeholder('Escolha um serviço e um dia');
  if(!serviceId||!date)return;
  status('A consultar horários disponíveis…');
  try{
   const {data,error}=await db.rpc('available_slots',{p_service:serviceId,p_day:date});
   if(current!==request)return;
   if(error)throw error;
   placeholder(data.length?'Escolha a hora':'Sem horários neste dia');
   for(const {slot} of data){const option=document.createElement('option');option.value=slot;option.textContent=slot;time.append(option)}
   verifiedKey=key;time.disabled=!data.length;
   status(data.length?'A marcação fica com o estado Marcado. A confirmação da cliente é registada depois do lembrete.':'Sem horários disponíveis. Escolha outro dia.');
  }catch{if(current===request)status('Não foi possível consultar a agenda. Volte a escolher o dia para tentar novamente.')}
 }
 service.onchange=loadSlots;day.onchange=loadSlots;
 time.onchange=()=>{submit.disabled=busy||!time.value||verifiedKey!==service.value+'|'+day.value};
 form.onsubmit=async event=>{
  event.preventDefault();
  if(busy||!form.reportValidity()||!time.value||verifiedKey!==service.value+'|'+day.value)return;
  if(mode==='existing'&&!selected()){status('Selecione uma cliente da lista.');return}
  busy=true;fields.disabled=true;submit.disabled=true;status('A guardar marcação…');
  const chosenDay=day.value;
  const chosen=mode==='existing'?selected():null;
  const contact={name:chosen?chosen.name:name.value.trim(),phone:chosen?chosen.phone:phone.value.trim()};
  contact.isNew=!isKnownContact(contact.phone);
  try{
   const email=el('manualAccountEmail')?.value.trim();
   const args={p_service:service.value,p_day:chosenDay,p_time:time.value,p_name:contact.name,p_phone:contact.phone};
   const {error}=await db.rpc(email?'create_staff_booking_for_account':'create_staff_booking',email?{...args,p_email:email}:args);
   if(error)throw error;
   name.value='';phone.value='';if(el('manualAccountEmail'))el('manualAccountEmail').value='';selectedPhone='';search.value='';renderContacts();
  }catch(error){
   busy=false;fields.disabled=false;await loadSlots();
   status(['PGRST202','42883'].includes(error.code)?'A criação de marcações ainda aguarda ativação na base de dados.':'Não foi possível guardar: '+error.message);
   return;
  }
  busy=false;fields.disabled=false;await loadSlots();
  status('Marcação guardada na agenda com o estado Marcado.');
  try{await onSaved(chosenDay,contact)}catch{status('Marcação guardada. Toque em Atualizar agenda para a consultar.')}
 };
 try{
  const {data,error}=await db.from('services').select('id,name,category,minutes,price').order('category').order('name');
  if(error)throw error;
  const first=document.createElement('option');first.value='';first.textContent='Escolha o serviço';service.replaceChildren(first);
  for(const item of data){const option=document.createElement('option');option.value=item.id;option.textContent=item.category+' · '+item.name+' · '+item.minutes+' min · '+new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(item.price);service.append(option)}
  fields.disabled=false;time.disabled=true;submit.disabled=true;
  status(data.length?'Escolha o serviço e os dados da cliente.':'Ainda não existem serviços configurados.');
 }catch{status('Não foi possível carregar os serviços. Atualize a página para tentar novamente.')}
 return controller;
}
