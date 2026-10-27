export async function initManualBookings({db,onSaved}) {
 const el=id=>document.getElementById(id);
 const form=el('manualForm'),fields=el('manualFields'),service=el('manualService'),day=el('manualDay'),time=el('manualTime'),submit=el('manualSubmit');
 const status=text=>{el('manualStatus').textContent=text};
 let request=0,verifiedKey=null,busy=false;
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
   status(data.length?'A marcação criada pela Ana fica logo confirmada.':'Sem horários disponíveis. Escolha outro dia.');
  }catch{if(current===request)status('Não foi possível consultar a agenda. Volte a escolher o dia para tentar novamente.')}
 }
 service.onchange=loadSlots;day.onchange=loadSlots;
 time.onchange=()=>{submit.disabled=busy||!time.value||verifiedKey!==service.value+'|'+day.value};
 form.onsubmit=async event=>{
  event.preventDefault();
  if(busy||!form.reportValidity()||!time.value||verifiedKey!==service.value+'|'+day.value)return;
  busy=true;fields.disabled=true;submit.disabled=true;status('A guardar marcação…');
  const chosenDay=day.value;
  try{
   const {error}=await db.rpc('create_staff_booking',{p_service:service.value,p_day:chosenDay,p_time:time.value,p_name:el('manualName').value.trim(),p_phone:el('manualPhone').value.trim()});
   if(error)throw error;
   el('manualName').value='';el('manualPhone').value='';
  }catch(error){
   busy=false;fields.disabled=false;await loadSlots();
   status(['PGRST202','42883'].includes(error.code)?'A criação de marcações ainda aguarda ativação na base de dados.':'Não foi possível guardar: '+error.message);
   return;
  }
  busy=false;fields.disabled=false;await loadSlots();
  status('Marcação confirmada e guardada na agenda.');
  try{await onSaved(chosenDay)}catch{status('Marcação guardada. Toque em Atualizar agenda para a consultar.')}
 };
 try{
  const {data,error}=await db.from('services').select('id,name,category,minutes,price').order('category').order('name');
  if(error)throw error;
  const first=document.createElement('option');first.value='';first.textContent='Escolha o serviço';service.replaceChildren(first);
  for(const item of data){const option=document.createElement('option');option.value=item.id;option.textContent=item.category+' · '+item.name+' · '+item.minutes+' min · '+new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(item.price);service.append(option)}
  fields.disabled=false;time.disabled=true;submit.disabled=true;
  status(data.length?'Escolha o serviço e os dados da cliente.':'Ainda não existem serviços configurados.');
 }catch{status('Não foi possível carregar os serviços. Atualize a página para tentar novamente.')}
}
