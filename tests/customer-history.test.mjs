import test from 'node:test';import assert from 'node:assert/strict';
import {customerHistorySummary,paymentPolicyLabel,createCustomerHistory} from '../customer-history.js';
test('history normalizes phone formats, separates cancellations and never assumes absence from a past date',()=>{
 const items=[{id:'a',phone:'912345678',starts_at:'2026-11-01T10:00Z',status:'confirmed',booking_financials:{attendance:'unrecorded'}},{id:'b',phone:'+351912345678',starts_at:'2026-11-02T10:00Z',status:'cancelled',booking_financials:{attendance:'unrecorded'}},{id:'c',phone:'00351912345678',starts_at:'2026-11-03T10:00Z',status:'confirmed',booking_financials:[{attendance:'no_show'}]},{id:'d',phone:'351912345678',starts_at:'2026-11-04T10:00Z',status:'confirmed',booking_financials:{attendance:'attended'}},{id:'e',phone:'913000000',starts_at:'2026-11-05T10:00Z',status:'confirmed',booking_financials:{attendance:'no_show'}}];
 const result=customerHistorySummary(items,'+351 912 345 678');assert.equal(result.attended,1);assert.equal(result.noShow,1);assert.equal(result.cancelled,1);assert.deepEqual(result.items.map(x=>x.id),['d','c','b','a']);
});
test('manual booking hint includes explicit staff policy and note without inventing history',()=>{
 const controller=createCustomerHistory({db:{},onSaved(){}});controller.setData([],[{phone:'351912345678',payment_policy:'full',note:'Avisou com antecedência.'}]);
 assert.match(controller.hint('912345678'),/100%/);assert.match(controller.hint('912345678'),/Avisou com antecedência/);assert.equal(controller.hint('913000000'),'');assert.equal(paymentPolicyLabel('half'),'Pedir 50% antecipado');
});
