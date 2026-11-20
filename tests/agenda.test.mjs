import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../agenda.js',import.meta.url),'utf8');
const {lisbonDay,pendingBookings,internationalPhone}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
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
