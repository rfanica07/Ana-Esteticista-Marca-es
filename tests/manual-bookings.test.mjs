import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../admin-create.js',import.meta.url),'utf8');
class Element {
 constructor(){this.checked=false;this.value='';this.textContent='';this.disabled=false;this.children=[]}
 replaceChildren(...nodes){this.children=nodes;this.value=nodes[0]?.value||''}
 append(node){this.children.push(node)}
 reportValidity(){return true}
 setAttribute(name,value){this[name]=value}
 focus(){this.focused=true}
 scrollIntoView(){}
}
const ids=['manualForm','manualFields','manualService','manualDay','manualTime','manualSubmit','manualStatus','manualName','manualPhone','manualContact','manualContactSearch','manualContactHint','manualExistingFields','manualNewClient','manualExistingClient','manualInvite','manualBooking'];
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
let savedDay=null,savedContact=null,savedCalls=0,knownContact=false;
const controller=await context.initManualBookings({db,isKnownContact:()=>knownContact,onSaved:async(day,contact)=>{savedDay=day;savedContact=contact;savedCalls++}});
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
assert.equal(creates[0].name,'create_staff_booking');
assert.equal(creates[0].args.p_day,'2026-11-03');
knownContact=true; // A background contact refresh while the booking is saving must not suppress the invitation.
creation.resolve({data:'test-reference',error:null});
while(waiting.length<3)await Promise.resolve();
waiting[2].resolve({data:[],error:null});await saving;
assert.equal(savedDay,'2026-11-03');
assert.equal(savedContact.name,'Cliente de teste');assert.equal(savedContact.phone,'900000000');assert.equal(savedContact.isNew,true);
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
assert.equal(savedCalls,1,'failed bookings must not generate an invitation');
console.log('PASS: catalogue, stale availability, duplicate submit, confirmed booking, missing migration and preserved inputs');


controller.setContacts([{name:'Maria Silva',phone:'912345678'},{name:'Maria Costa',phone:'913456789'}]);
elements.manualExistingClient.onclick();
assert.equal(elements.manualExistingFields.hidden,false);
assert.equal(elements.manualName.value,'','switching clients clears previous customer data');
assert.equal(elements.manualName.readOnly,true);
elements.manualContactSearch.value='912 345';elements.manualContactSearch.oninput();
assert.equal(elements.manualContact.children.length,2,'phone search ignores spaces');
elements.manualContact.value='351912345678';elements.manualContact.onchange();
assert.equal(elements.manualName.value,'Maria Silva');
assert.equal(elements.manualPhone.value,'912345678');
controller.setContacts([{name:'Maria Silva',phone:'912345678'},{name:'Maria Costa',phone:'913456789'}]);
assert.equal(elements.manualContact.value,'351912345678','agenda refresh preserves the selected contact');
elements.manualTime.value='09:00';elements.manualTime.onchange();
elements.manualName.value='Unwanted edit';creation=deferred();
const existingSave=elements.manualForm.onsubmit(event);
assert.equal(creates.at(-1).args.p_name,'Maria Silva','saved booking uses selected contact, not stale text');
creation.resolve({data:'existing-contact-booking',error:null});
while(waiting.length<6)await Promise.resolve();waiting[5].resolve({data:[],error:null});await existingSave;
assert.equal(savedContact.isNew,false);
assert.equal(controller.startForContact({name:'Maria Costa',phone:'913456789'}),true);
assert.equal(elements.manualName.value,'Maria Costa');assert.equal(elements.manualPhone.value,'913456789');
assert.equal(elements.manualBooking.open,true);assert.equal(elements.manualService.focused,true);
elements.manualNewClient.onclick();assert.equal(elements.manualName.value,'');assert.equal(elements.manualPhone.readOnly,false);assert.equal(elements.manualExistingFields.hidden,true);
console.log('PASS: existing contact selection, phone search, refresh preservation, booking payload and contact shortcut');
