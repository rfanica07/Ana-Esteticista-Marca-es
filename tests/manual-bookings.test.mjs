import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../admin-create.js',import.meta.url),'utf8');
class Element {
 constructor(){this.checked=false;this.value='';this.textContent='';this.disabled=false;this.children=[]}
 replaceChildren(...nodes){this.children=nodes;this.value=nodes[0]?.value||''}
 append(node){this.children.push(node)}
 reportValidity(){return true}
}
const ids=['manualForm','manualFields','manualService','manualDay','manualTime','manualSubmit','manualStatus','manualName','manualPhone','manualReminder'];
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
const context=vm.createContext({Intl,Date,document:{getElementById:id=>elements[id],createElement:()=>new Element()}});
vm.runInContext(source.replace('export async function','async function'),context);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const waiting=[],creates=[];
let creation=deferred();
const db={from(){return {select(){return {order(){return {order:async()=>({data:[{id:'gel',category:'Mãos',name:'Gel',minutes:90,price:22}],error:null})}}}}}},rpc(name,args){
 if(name==='available_slots'){const item=deferred();waiting.push({...item,args});return item.promise}
 creates.push({name,args});return creation.promise;
}};
let savedDay=null;
await context.initManualBookings({db,onSaved:async day=>{savedDay=day}});
assert.equal(elements.manualFields.disabled,false);
assert.equal(elements.manualSubmit.disabled,true);
elements.manualService.value='gel';elements.manualDay.value='2026-11-02';
const old=elements.manualService.onchange();
elements.manualDay.value='2026-11-03';
const latest=elements.manualDay.onchange();
waiting[1].resolve({data:[{slot:'10:30'}],error:null});await latest;
waiting[0].resolve({data:[{slot:'09:00'}],error:null});await old;
assert.equal(elements.manualTime.children[1].value,'10:30','stale availability must not overwrite the new date');
elements.manualTime.value='10:30';elements.manualTime.onchange();
assert.equal(elements.manualSubmit.disabled,false);
elements.manualName.value='Cliente de teste';elements.manualPhone.value='900000000';
const event={preventDefault(){}};
const saving=elements.manualForm.onsubmit(event);
await elements.manualForm.onsubmit(event);
assert.equal(creates.length,1,'double submission must create only one request');
assert.equal(creates[0].name,'create_staff_booking_with_reminder');
assert.equal(creates[0].args.p_reminder,false);
assert.equal(creates[0].args.p_day,'2026-11-03');
creation.resolve({data:'test-reference',error:null});
while(waiting.length<3)await Promise.resolve();
waiting[2].resolve({data:[],error:null});await saving;
assert.equal(savedDay,'2026-11-03');
assert.equal(elements.manualName.value,'');
assert.equal(elements.manualSubmit.disabled,true);
assert.match(elements.manualStatus.textContent,/confirmada e guardada/);
elements.manualDay.value='2026-11-05';const refresh=elements.manualDay.onchange();
waiting[3].resolve({data:[{slot:'09:00'}],error:null});await refresh;
elements.manualTime.value='09:00';elements.manualTime.onchange();elements.manualName.value='Cliente de teste';elements.manualPhone.value='900000000';
creation=deferred();const failing=elements.manualForm.onsubmit(event);
creation.resolve({error:{code:'PGRST202',message:'missing function'}});
while(waiting.length<5)await Promise.resolve();
waiting[4].resolve({data:[{slot:'09:00'}],error:null});await failing;
assert.match(elements.manualStatus.textContent,/aguarda ativação/);
assert.equal(elements.manualName.value,'Cliente de teste','a failure must preserve customer inputs');
console.log('PASS: catalogue, stale availability, duplicate submit, confirmed booking, missing migration and preserved inputs');

