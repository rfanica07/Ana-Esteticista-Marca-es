import {test} from 'node:test';import assert from 'node:assert/strict';
import {serviceEmoji,followUpMessage,followUpLink,followUpBookings,bookingStage} from '../follow-up.js';
test('manual reminder uses Lisbon time, service, date and normalized recipient',()=>{
 const booking={customer_name:'Maria & Inês',phone:'912 345 678',starts_at:'2026-07-10T08:30:00Z',services:{name:'Mãos & pés'}};
 const text=followUpMessage(booking),url=new URL(followUpLink(booking));
 assert.match(text,/responda a esta mensagem para confirmar a sua presença/);assert.match(text,/09:30/);assert.match(text,/10 de julho/);assert.match(text,/Mãos & pés/);
 assert.equal(url.pathname,'/351912345678');assert.equal(url.searchParams.get('text'),text);
 assert.equal(followUpLink({...booking,phone:'abc'}),null);
});

test('unsent list excludes sent, cancelled and past bookings while preserving time order',()=>{
 const later=new Date(Date.now()+86400000).toISOString();
 const rows=[{id:1,status:'confirmed',starts_at:later},{id:2,status:'confirmed',starts_at:later,follow_up_sent_at:later},{id:3,status:'cancelled',starts_at:later},{id:4,status:'confirmed',starts_at:'2020-01-01T09:00:00Z'},{id:5,status:'confirmed',starts_at:later}];
 assert.deepEqual(followUpBookings(rows).map(b=>b.id),[1,5]);
 assert.deepEqual(followUpBookings(rows,'sent').map(b=>b.id),[2]);
 assert.deepEqual(followUpBookings(rows,'history').map(b=>b.id),[4]);
 rows[0].follow_up_sent_at=later;
 assert.deepEqual(followUpBookings(rows).map(b=>b.id),[5]);
});

test('customer confirmation stages require explicit confirmation after the reminder',()=>{
 const b={status:'confirmed'};assert.equal(bookingStage(b),'Marcado');b.follow_up_sent_at='2026-11-23';assert.equal(bookingStage(b),'Lembrete enviado');b.customer_confirmed_at='2026-11-23';assert.equal(bookingStage(b),'Confirmado');
});

test('message lists span dates and archive sent reminders after the appointment',()=>{
 const rows=[{id:1,status:'confirmed',starts_at:'2090-01-01T09:00:00Z'},{id:2,status:'confirmed',starts_at:'2090-02-01T09:00:00Z'},{id:3,status:'confirmed',starts_at:'2020-01-01T09:00:00Z',follow_up_sent_at:'2019-12-31T13:30:00Z'}];
 assert.deepEqual(followUpBookings(rows,'unsent').map(b=>b.id),[1,2]);assert.deepEqual(followUpBookings(rows,'sent').map(b=>b.id),[]);assert.deepEqual(followUpBookings(rows,'history').map(b=>b.id),[3]);
});

test('sent and confirmed are exclusive and move to history automatically at appointment time',()=>{
 const now='2030-05-01T12:00:00Z';
 const rows=[
  {id:'new',status:'confirmed',starts_at:'2030-05-02T09:00:00Z'},
  {id:'sent',status:'confirmed',starts_at:'2030-05-02T10:00:00Z',follow_up_sent_at:now},
  {id:'confirmed',status:'confirmed',starts_at:'2030-05-03T09:00:00Z',follow_up_sent_at:now,customer_confirmed_at:now},
  {id:'old',status:'confirmed',starts_at:'2030-04-30T09:00:00Z',follow_up_sent_at:now,customer_confirmed_at:now},
  {id:'cancelled',status:'cancelled',starts_at:'2030-04-29T09:00:00Z'},
 ];
 assert.deepEqual(followUpBookings(rows,'unsent',now).map(b=>b.id),['new']);
 assert.deepEqual(followUpBookings(rows,'sent',now).map(b=>b.id),['sent']);
 assert.deepEqual(followUpBookings(rows,'confirmed',now).map(b=>b.id),['confirmed']);
 assert.deepEqual(followUpBookings(rows,'history',now).map(b=>b.id),['old','cancelled']);
 rows[1].customer_confirmed_at=now;
 assert.deepEqual(followUpBookings(rows,'sent',now).map(b=>b.id),[]);
 assert.deepEqual(followUpBookings(rows,'confirmed',now).map(b=>b.id),['sent','confirmed']);
 assert.deepEqual(followUpBookings(rows,'unsent','2030-05-02T09:00:00Z').map(b=>b.id),[]);
});

test('approved message applies the service emoji, flower, clock and affectionate closing',()=>{
 for(const [service,emoji] of [[{name:'Axilas',category:'Cera'},'🍯'],[{name:'Axilas',category:'Laser'},'✨'],[{name:'Verniz de gel',category:'Mãos'},'💅'],[{name:'Pedicure',category:'Pés'},'🦶'],[{name:'Limpeza de pele',category:'Rosto'},'🧖‍♀️']]){
  const text=followUpMessage({customer_name:'Maria',starts_at:'2030-07-01T08:30:00Z',services:service});
  assert.equal(serviceEmoji(service),emoji);assert.ok(text.includes(service.name+' '+emoji));
  assert.match(text,/Ana Esteticista 🌸/);assert.match(text,/09:30 🕒/);assert.match(text,/Obrigada, beijinhos e até breve! 🌸$/);
 }
});
