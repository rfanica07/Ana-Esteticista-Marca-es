import test from 'node:test';import assert from 'node:assert/strict';
import {easterSunday,holidayName,closedDayReason} from '../closure-calendar.js';
import {canConfirmCustomer,customerConfirmationControls} from '../follow-up.js';
test('all national fixed holidays and movable Easter holidays are closed',()=>{
 for(const suffix of ['01-01','04-25','05-01','06-10','08-15','10-05','11-01','12-01','12-08','12-25'])assert.ok(holidayName('2027-'+suffix));
 for(const [year,easter,goodFriday,corpus] of [[2026,'2026-04-05','2026-04-03','2026-06-04'],[2027,'2027-03-28','2027-03-26','2027-05-27'],[2028,'2028-04-16','2028-04-14','2028-06-15']]){assert.equal(easterSunday(year).toISOString().slice(0,10),easter);assert.equal(holidayName(easter),'Domingo de Páscoa');assert.equal(holidayName(goodFriday),'Sexta-feira Santa');assert.equal(holidayName(corpus),'Corpo de Deus')}
});
test('Moita municipal holiday follows the second Sunday; weekly days off remain closed',()=>{
 assert.equal(holidayName('2025-09-16'),'Feriado municipal da Moita');assert.equal(holidayName('2026-09-15'),'Feriado municipal da Moita');assert.equal(holidayName('2027-09-14'),'Feriado municipal da Moita');
 assert.equal(closedDayReason('2026-11-25'),'Folga · quarta-feira');assert.equal(closedDayReason('2026-11-29'),'Folga · domingo');assert.equal(closedDayReason('2026-11-26'),null);assert.equal(holidayName('2026-02-30'),null);
});
test('customer can be confirmed directly without first marking the message sent',()=>{
 const booking={id:'booking',customer_name:'Cliente',status:'confirmed',starts_at:'2026-11-26T15:00:00Z'};
 assert.equal(canConfirmCustomer(booking,'2026-11-25T12:00:00Z'),true);
 assert.equal(canConfirmCustomer({...booking,customer_confirmed_at:'2026-11-25'},'2026-11-25'),false);
 assert.equal(canConfirmCustomer({...booking,status:'cancelled'},'2026-11-25'),false);
 assert.equal(canConfirmCustomer({...booking,starts_at:'2026-12-01T15:00:00Z'},'2026-11-25'),false);
});
test('direct confirmation button saves once, refreshes and presents errors without losing retry',async()=>{
 const original=globalThis.document;class Element{constructor(){this.children=[];this.attributes={}}append(...nodes){this.children.push(...nodes)}setAttribute(k,v){this.attributes[k]=v}removeAttribute(k){delete this.attributes[k]}}
 globalThis.document={createElement:()=>new Element()};
 try{let calls=0,saved=0,resolve;const pending=new Promise(r=>resolve=r);const booking={id:'demo',customer_name:'Teste',status:'confirmed',starts_at:'2099-11-26T15:00:00Z'};
 // 26 November 2099 is a normal working day.
 const root=customerConfirmationControls(booking,{db:{rpc(name,args){calls++;assert.equal(name,'confirm_customer_booking');assert.equal(args.p_id,'demo');return pending}},onSaved:()=>saved++});
 assert.ok(root.children.length);const button=root.children[0];const saving=button.onclick();await button.onclick();assert.equal(calls,1);resolve({error:null});await saving;assert.equal(saved,1);
 const retry=customerConfirmationControls(booking,{db:{rpc:async()=>({error:{message:'Falha temporária'}})}});await retry.children[0].onclick();assert.equal(retry.children[0].disabled,false);assert.match(retry.children[2].textContent,/Falha temporária/);
 }finally{globalThis.document=original}
});
