import {test} from 'node:test';import assert from 'node:assert/strict';
import {followUpMessage,followUpLink} from '../follow-up.js';
test('manual reminder uses Lisbon time, service, date and normalized recipient',()=>{
 const booking={customer_name:'Maria & Inês',phone:'912 345 678',starts_at:'2026-07-10T08:30:00Z',services:{name:'Mãos & pés'}};
 const text=followUpMessage(booking),url=new URL(followUpLink(booking));
 assert.match(text,/09:30/);assert.match(text,/10 de julho/);assert.match(text,/Mãos & pés/);
 assert.equal(url.pathname,'/351912345678');assert.equal(url.searchParams.get('text'),text);
 assert.equal(followUpLink({...booking,phone:'abc'}),null);
});
