import {lisbonDay} from './agenda.js';
export const revenueAreas=['Laser','Cera','Manicure','Pedicure','Limpeza de pele','Outros'];
const iso=date=>date.toISOString().slice(0,10);
const shift=(day,days)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return iso(date)};
export function revenuePeriod(kind,reference){
 const date=new Date(reference+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reference)||Number.isNaN(date.getTime())||iso(date)!==reference)throw Error('Escolha uma data válida.');
 const year=date.getUTCFullYear(),month=date.getUTCMonth();
 const span=(start,end)=>({start,end});
 const months=(first,count)=>span(iso(new Date(Date.UTC(year,first,1,12))),iso(new Date(Date.UTC(year,first+count,0,12))));
 switch(kind){
 case 'day':return span(reference,reference);
 case 'week':{const first=shift(reference,-((date.getUTCDay()+6)%7));return span(first,shift(first,6))}
 case 'fortnight':return span(reference.slice(0,8)+(date.getUTCDate()<=15?'01':'16'),date.getUTCDate()<=15?reference.slice(0,8)+'15':months(month,1).end);
 case 'month':return months(month,1);
 case 'quarter':return months(Math.floor(month/3)*3,3);
 case 'semester':return months(Math.floor(month/6)*6,6);
 case 'year':return months(0,12);
 default:throw Error('Escolha um período válido.');
 }
}
export function revenueArea(service){
 const category=(service?.category||'').toLocaleLowerCase('pt-PT');
 const name=(service?.name||'').toLocaleLowerCase('pt-PT');
 if(category==='laser')return 'Laser';
 if(category==='cera'||(category==='rosto'&&/buço|sobrancelha/.test(name)))return 'Cera';
 if(category==='mãos')return 'Manicure';
 if(category==='pés')return 'Pedicure';
 if(/limpeza.*pele/.test(name))return 'Limpeza de pele';
 return 'Outros';
}
const one=value=>Array.isArray(value)?value[0]:value;
export function revenueSummary(entries,period,today=lisbonDay(new Date())){
 const areas=new Map(revenueAreas.map(name=>[name,0])),days=new Map(),missed=new Map();
 let total=0,lifetime=0,missedTotal=0;
 for(const entry of entries){
  const cents=Math.round(Number(entry.amount)*100);
  if(!Number.isFinite(cents))throw Error('Há um valor de pagamento inválido.');
  if(entry.received_on>today)continue;
  lifetime+=cents;
  if(entry.received_on<period.start||entry.received_on>period.end)continue;
  const booking=one(entry.bookings),financial=one(booking?.booking_financials),service=one(booking?.services);
  const area=revenueArea(service);
  total+=cents;areas.set(area,areas.get(area)+cents);
  days.set(entry.received_on,(days.get(entry.received_on)||0)+cents);
  if(financial?.attendance==='no_show'&&entry.payment_part==='deposit'){
   missedTotal+=cents;
   const old=missed.get(entry.booking_id)||{id:entry.booking_id,name:booking.customer_name,starts_at:booking.starts_at,service:service?.name||'Serviço',area,cents:0};
   old.cents+=cents;missed.set(entry.booking_id,old);
  }
 }
 return {total:total/100,lifetime:lifetime/100,missedTotal:missedTotal/100,
  areas:[...areas].map(([name,cents])=>({name,amount:cents/100})),
  days:[...days].sort(([a],[b])=>b.localeCompare(a)).filter(([,cents])=>cents!==0).map(([day,cents])=>({day,amount:cents/100})),
  missed:[...missed.values()].filter(item=>item.cents!==0).sort((a,b)=>(b.starts_at||'').localeCompare(a.starts_at||'')).map(({cents,...item})=>({...item,amount:cents/100}))};
}
export async function fetchRevenueEntries(db){
 const snapshot=new Date().toISOString(),items=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await db.from('booking_payment_entries').select('id,booking_id,amount,payment_part,received_on,bookings(customer_name,starts_at,services(name,category),booking_financials(attendance))').lte('recorded_at',snapshot).order('recorded_at').order('id').range(offset,offset+999);
  if(error)throw error;
  items.push(...data);if(data.length<1000)return items;
 }
}
export function initRevenue({db,doc=document}){
 const el=id=>doc.getElementById(id),money=value=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(value);
 const date=day=>new Intl.DateTimeFormat('pt-PT',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Lisbon'}).format(new Date(day+'T12:00:00Z'));
 let entries=null,request=0,dirty=true;
 el('revenueDate').value=lisbonDay(new Date());
 function render(){
  if(!entries)return;
  const period=revenuePeriod(el('revenuePeriod').value,el('revenueDate').value);
  const summary=revenueSummary(entries,period);
  el('revenueRange').textContent=period.start===period.end?date(period.start):date(period.start)+' → '+date(period.end);
  el('revenueTotal').textContent=money(summary.total);el('revenueLifetime').textContent=money(summary.lifetime);el('revenueMissedTotal').textContent=money(summary.missedTotal);
  el('revenueAreas').replaceChildren();
  for(const area of summary.areas){if(area.name==='Outros'&&!area.amount)continue;const row=doc.createElement('div');row.className='revenue-area';const name=doc.createElement('span');name.textContent=area.name;const value=doc.createElement('strong');value.textContent=money(area.amount);row.append(name,value);el('revenueAreas').append(row)}
  el('revenueDays').replaceChildren();
  for(const day of summary.days){const row=doc.createElement('div');row.className='revenue-area';const name=doc.createElement('span');name.textContent=date(day.day);const value=doc.createElement('strong');value.textContent=money(day.amount);row.append(name,value);el('revenueDays').append(row)}
  el('revenueDaysEmpty').hidden=summary.days.length>0;
  el('revenueMissed').replaceChildren();
  for(const item of summary.missed){const row=doc.createElement('article');const heading=doc.createElement('h4');heading.textContent=(item.name||'Cliente')+' · '+money(item.amount);const text=doc.createElement('p');text.textContent=item.service+' · '+item.area+' · Marcação: '+date(lisbonDay(item.starts_at));row.append(heading,text);el('revenueMissed').append(row)}
  el('revenueMissedEmpty').hidden=summary.missed.length>0;
 }
 async function refresh(){
  const current=++request;el('revenueRefresh').disabled=true;el('revenueStatus').textContent='A consultar os pagamentos…';
  try{const data=await fetchRevenueEntries(db);if(current!==request)return;entries=data;render();dirty=false;el('revenueStatus').textContent=data.length?'Atualizado. Apenas pagamentos registados; os sinais não são contados duas vezes.':'Ainda não há pagamentos registados. Os valores aparecem quando guardar o sinal recebido ou o serviço realizado nas marcações.';el('revenueResults').hidden=false}
  catch(error){if(current!==request)return;el('revenueStatus').textContent='Não foi possível atualizar os ganhos. Tente novamente. '+error.message;}
  finally{if(current===request)el('revenueRefresh').disabled=false}
 }
 const change=()=>{try{render();if(entries)el('revenueResults').hidden=false}catch(error){el('revenueResults').hidden=true;el('revenueStatus').textContent=error.message}};
 el('revenuePeriod').onchange=change;el('revenueDate').onchange=change;
 el('revenueRefresh').onclick=refresh;
 el('revenueToday').onclick=()=>{el('revenueDate').value=lisbonDay(new Date());change()};
 el('revenuePanel').ontoggle=()=>{if(el('revenuePanel').open&&(dirty||!entries))refresh()};
 for(const button of doc.querySelectorAll('[data-revenue-tab]'))button.onclick=()=>{const missed=button.dataset.revenueTab==='missed';el('revenueNormalView').hidden=missed;el('revenueMissedView').hidden=!missed;for(const tab of doc.querySelectorAll('[data-revenue-tab]'))tab.setAttribute('aria-pressed',String(tab===button))};
 return {refresh,invalidate(){dirty=true;if(el('revenuePanel').open)refresh()}};
}
