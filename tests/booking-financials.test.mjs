import {test} from 'node:test';import assert from 'node:assert/strict';
import {paymentAmounts,attendanceLabel} from '../booking-financials.js';
test('requiring a deposit alone never records money received',()=>{assert.deepEqual(paymentAmounts(22,false,false),{deposit:0,balance:0,received:0,outstanding:22})});
test('50 percent deposit and final payment never count the deposit twice',()=>{assert.deepEqual(paymentAmounts(22,true,false),{deposit:11,balance:0,received:11,outstanding:11});assert.deepEqual(paymentAmounts(22,true,true),{deposit:11,balance:11,received:22,outstanding:0});assert.deepEqual(paymentAmounts(22,false,true),{deposit:0,balance:22,received:22,outstanding:0})});
test('half deposits round to cents and leave the exact balance',()=>{assert.deepEqual(paymentAmounts(7.51,true,true),{deposit:3.76,balance:3.75,received:7.51,outstanding:0});assert.equal(paymentAmounts(7.5,true,false).deposit,3.75)});
test('attendance stays unrecorded until Ana explicitly marks it',()=>{assert.equal(attendanceLabel('unrecorded'),'Presença por registar');assert.equal(attendanceLabel('attended'),'✓ Compareceu');assert.equal(attendanceLabel('no_show'),'✕ Faltou')});
