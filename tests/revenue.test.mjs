import test from 'node:test';
import assert from 'node:assert/strict';
import {revenuePeriod,revenueArea,revenueSummary,fetchRevenueEntries} from '../revenue.js';
test('all requested periods follow calendar boundaries, including leap year and cross-year weeks',()=>{
 const expected={day:['2026-11-24','2026-11-24'],week:['2026-11-23','2026-11-29'],fortnight:['2026-11-16','2026-11-30'],month:['2026-11-01','2026-11-30'],quarter:['2026-10-01','2026-12-31'],semester:['2026-07-01','2026-12-31'],year:['2026-01-01','2026-12-31']};
 for(const [kind,[start,end]] of Object.entries(expected))assert.deepEqual(revenuePeriod(kind,'2026-11-24'),{start,end});
 assert.deepEqual(revenuePeriod('fortnight','2028-02-15'),{start:'2028-02-01',end:'2028-02-15'});
 assert.deepEqual(revenuePeriod('fortnight','2028-02-16'),{start:'2028-02-16',end:'2028-02-29'});
 assert.deepEqual(revenuePeriod('week','2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
 assert.throws(()=>revenuePeriod('month','2026-02-30'));
});
test('service area keeps wax facial services distinct from laser and skin care',()=>{
 for(const [category,name,area] of [['Laser','Buço','Laser'],['Cera','Perna inteira','Cera'],['Rosto','Buço e sobrancelhas','Cera'],['Rosto','Sobrancelhas','Cera'],['Rosto','Limpeza de pele','Limpeza de pele'],['Mãos','Gel','Manicure'],['Mãos','Verniz de gel','Manicure'],['Pés','Pedicure','Pedicure'],['Nova','Outro','Outros']])assert.equal(revenueArea({category,name}),area);
});
const entry=(booking_id,amount,received_on,payment_part='balance',attendance='attended',category='Laser')=>({booking_id,amount,received_on,payment_part,bookings:{customer_name:'Teste',starts_at:'2026-11-24T10:00:00Z',services:{name:category==='Laser'?'Axilas':'Manicure',category},booking_financials:{attendance}}});
test('deposit and balance count once, in their receipt period, within the same service area',()=>{
 const items=[entry('a',10,'2026-10-30','deposit'),entry('a',10,'2026-11-24')];
 const nov=revenueSummary(items,revenuePeriod('month','2026-11-24'),'2026-11-24');
 assert.equal(nov.total,10);assert.equal(nov.lifetime,20);assert.equal(nov.areas.find(x=>x.name==='Laser').amount,10);
 const year=revenueSummary(items,revenuePeriod('year','2026-11-24'),'2026-11-24');assert.equal(year.total,20);assert.equal(year.missedTotal,0);
});
test('no-show deposits are a subset of total and area income, never extra income',()=>{
 const items=[entry('missed',7.5,'2026-11-23','deposit','no_show'),entry('attended',7.5,'2026-11-23','deposit'),entry('attended',7.5,'2026-11-24')];
 const result=revenueSummary(items,revenuePeriod('month','2026-11-24'),'2026-11-24');
 assert.equal(result.total,22.5);assert.equal(result.missedTotal,7.5);assert.equal(result.missed.length,1);assert.equal(result.missed[0].amount,7.5);assert.equal(result.areas[0].amount,22.5);
 items[0].bookings.booking_financials.attendance='attended';assert.equal(revenueSummary(items,revenuePeriod('month','2026-11-24'),'2026-11-24').missedTotal,0);
});
test('reversals remove corrected receipts and preserve cents without double counting',()=>{
 const items=[entry('a',3.76,'2026-11-20','deposit'),entry('a',-3.76,'2026-11-20','deposit'),entry('a',3.75,'2026-11-21','deposit'),entry('a',3.75,'2026-11-24'),entry('future',100,'2027-01-01')];
 const result=revenueSummary(items,revenuePeriod('year','2026-11-24'),'2026-11-24');assert.equal(result.total,7.5);assert.equal(result.lifetime,7.5);assert.equal(result.days.length,2);assert.equal(result.areas.reduce((n,x)=>n+x.amount,0),7.5);
 assert.equal(revenueSummary([],revenuePeriod('day','2026-11-24')).total,0);
});
test('fetch paginates over 1000 receipts using stable ordering and one snapshot',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({id:String(i)})),calls=[];let cutoff;
 const db={from(name){assert.equal(name,'booking_payment_entries');return {select(){return this},lte(column,value){assert.equal(column,'recorded_at');if(cutoff)assert.equal(value,cutoff);cutoff=value;return this},order(){return this},async range(first,last){calls.push([first,last]);return {data:rows.slice(first,last+1),error:null}}}}};
 const got=await fetchRevenueEntries(db);assert.equal(got.length,1001);assert.deepEqual(calls,[[0,999],[1000,1999]]);
});
