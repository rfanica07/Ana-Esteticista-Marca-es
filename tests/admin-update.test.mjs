import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../admin-update.js',import.meta.url),'utf8');
function setup(dirty){
 const elements={reloadApp:{},appUpdateStatus:{hidden:true},manualName:{value:dirty?'Maria':''}};let reloads=0;
 const doc={getElementById:id=>elements[id],querySelector:selector=>selector.startsWith('script')?{getAttribute:()=> 'admin.js?v=old'}:null,addEventListener(){},hidden:false,activeElement:{matches:()=>false}};
 const win={location:{href:'https://ana-esteticista.pages.dev/admin',reload(){reloads++}},confirm:()=>false,addEventListener(){},setInterval(){}};
 const context=vm.createContext({URL,Date,DOMParser:class{parseFromString(){return {querySelector:()=>({getAttribute:()=> 'admin.js?v=new'})}}}});
 vm.runInContext(source.replaceAll('export function','function'),context);
 const controller=context.initAppUpdates({doc,win,fetchPage:async()=>({ok:true,text:async()=>'<html></html>'})});
 return {elements,controller,get reloads(){return reloads}};
}
test('new version reloads automatically when there is no unfinished entry',async()=>{const app=setup(false);await new Promise(setImmediate);assert.equal(app.reloads,1);assert.equal(app.controller.available,true)});
test('unfinished booking is preserved and update waits for user action',async()=>{const app=setup(true);await new Promise(setImmediate);assert.equal(app.reloads,0);assert.equal(app.elements.appUpdateStatus.hidden,false);app.elements.reloadApp.onclick();assert.equal(app.reloads,0)});
