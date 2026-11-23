import {test} from 'node:test';import assert from 'node:assert/strict';
import {followUpMessage,followUpLink,followUpBookings} from '../follow-up.js';
test('manual reminder uses Lisbon time, service, date and normalized recipient',()=>{
 const booking={customer_name:'Maria & Inês',phone:'912 345 678',starts_at:'2026-07-10T08:30:00Z',services:{name:'Mãos & pés'}};
 const text=followUpMessage(booking),url=new URL(followUpLink(booking));
 assert.match(text,/Por favor, confirme a sua marcação/);assert.match(text,/09:30/);assert.match(text,/10 de julho/);assert.match(text,/Mãos & pés/);
 assert.equal(url.pathname,'/351912345678');assert.equal(url.searchParams.get('text'),text);
 assert.equal(followUpLink({...booking,phone:'abc'}),null);
});

test('unsent list excludes sent, cancelled and past bookings while preserving time order',()=>{
 const later=new Date(Date.now()+86400000).toISOString();
 const rows=[{id:1,status:'confirmed',starts_at:later},{id:2,status:'confirmed',starts_at:later,follow_up_sent_at:later},{id:3,status:'cancelled',starts_at:later},{id:4,status:'confirmed',starts_at:'2020-01-01T09:00:00Z'},{id:5,status:'confirmed',starts_at:later}];
 assert.deepEqual(followUpBookings(rows).map(b=>b.id),[1,5]);
 assert.deepEqual(followUpBookings(rows,'sent').map(b=>b.id),[2]);
 assert.equal(followUpBookings(rows,'all').length,5);
 rows[0].follow_up_sent_at=later;
 assert.deepEqual(followUpBookings(rows).map(b=>b.id),[5]);
});
