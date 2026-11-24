import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../agenda.js',import.meta.url),'utf8');
const {lisbonDay,pendingBookings,internationalPhone,dayBookings}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('pending requests remain visible when the selected day is today',()=>{
 const bookings=[{id:'future',status:'pending',starts_at:'2026-11-26T09:00:00Z'},{id:'confirmed',status:'confirmed',starts_at:'2026-11-26T10:00:00Z'}];
 assert.deepEqual(pendingBookings(bookings,new Date('2026-11-20T12:00:00Z')).map(item=>item.id),['future']);
});
test('Lisbon date follows summer and winter time',()=>{
 assert.equal(lisbonDay('2026-07-01T23:30:00Z'),'2026-07-02');
 assert.equal(lisbonDay('2026-11-01T23:30:00Z'),'2026-11-01');
});
test('Portuguese and international phone normalization',()=>{
 assert.equal(internationalPhone('912 345 678'),'351912345678');
 assert.equal(internationalPhone('00351 912345678'),'351912345678');
 assert.equal(internationalPhone('+44 7700 900123'),'447700900123');
});

test('daily agenda includes earlier and later appointments regardless of reminder or confirmation stage',()=>{
 const items=[{id:'later',status:'confirmed',starts_at:'2026-11-24T18:00:00Z',reminder_sent_at:'2026-11-23T13:00:00Z'},
 {id:'earlier',status:'confirmed',starts_at:'2026-11-24T09:00:00Z',customer_confirmed_at:'2026-11-23T14:00:00Z'},
 {id:'pending',status:'pending',starts_at:'2026-11-24T11:00:00Z'},
 {id:'cancelled',status:'cancelled',starts_at:'2026-11-24T10:00:00Z'},
 {id:'thursday',status:'confirmed',starts_at:'2026-11-26T10:00:00Z'}];
 assert.deepEqual(dayBookings(items,'2026-11-24').map(b=>b.id),['earlier','pending','later']);
 assert.deepEqual(dayBookings(items,'2026-11-25'),[]);
});
test('daily agenda groups appointments by Lisbon calendar day in summer',()=>{
 assert.equal(dayBookings([{id:'night',status:'confirmed',starts_at:'2026-07-01T23:30:00Z'}],'2026-07-02').length,1);
});
