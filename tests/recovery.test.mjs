import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=(await fs.readFile(new URL('../recovery.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
function setup({user=null,hash='',sendError=null}={}){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:id==='choosePassword'||id==='backToLogin',value:'',textContent:'',disabled:false,reportValidity:()=>true,reset(){this.value=''}});return nodes.get(id)};
 const calls={send:[],update:[],signOut:[]};
 const auth={onAuthStateChange(fn){calls.authEvent=fn},async resetPasswordForEmail(...args){calls.send.push(args);return {error:sendError}},async updateUser(args){calls.update.push(args);return {error:null}},async signOut(args){calls.signOut.push(args);return {error:null}}};
 const ctx=vm.createContext({db:{auth},currentUser:async()=>user,recoveryLink:false,document:{getElementById:node},location:{hash,search:'',href:'https://ana-esteticista.pages.dev/recuperar.html',pathname:'/recuperar.html'},history:{replaceState(){}},sessionStorage:{getItem:()=>null,setItem(){}},Date,URL,URLSearchParams,setTimeout:fn=>fn(),setInterval(){}});
 vm.runInContext(source,ctx);return {ctx,node,calls,verify:()=>vm.runInContext('verifyRecovery()',ctx)};
}
const event={preventDefault(){}};
test('new password cannot be saved without a verified recovery session',async()=>{const {node,calls,verify}=setup();await verify();node('newPassword').value=node('repeatPassword').value='Example-password-123';await node('choosePassword').onsubmit(event);assert.equal(calls.update.length,0);assert.equal(node('choosePassword').hidden,true)});
test('password confirmation mismatch never updates the account',async()=>{const {node,calls,verify}=setup({user:{id:'test-user'}});await verify();node('newPassword').value='Example-password-123';node('repeatPassword').value='Different-password';await node('choosePassword').onsubmit(event);assert.equal(calls.update.length,0);assert.match(node('recoveryStatus').textContent,/não coincidem/)});
test('verified recovery saves password and ends the local recovery session',async()=>{const {node,calls,verify}=setup({user:{id:'test-user'}});await verify();node('newPassword').value=node('repeatPassword').value='Example-password-123';await node('choosePassword').onsubmit(event);assert.equal(calls.update.length,1);assert.equal(calls.signOut.length,1);assert.equal(node('choosePassword').hidden,true);assert.equal(node('backToLogin').hidden,false)});
test('email requests use the dedicated callback and cannot be sent twice during cooldown',async()=>{const {node,calls}=setup();node('recoveryEmail').value=' client@example.invalid ';await node('requestRecovery').onsubmit(event);await node('requestRecovery').onsubmit(event);assert.equal(calls.send.length,1);assert.equal(calls.send[0][0],'client@example.invalid');assert.equal(calls.send[0][1].redirectTo,'https://ana-esteticista.pages.dev/recuperar.html');assert.match(node('recoveryStatus').textContent,/Se existir/)});
test('provider failure is not reported as successful delivery',async()=>{const {node}=setup({sendError:{code:'over_email_send_rate_limit'}});await node('requestRecovery').onsubmit(event);assert.match(node('recoveryStatus').textContent,/limite temporário/);assert.doesNotMatch(node('recoveryStatus').textContent,/receberá/)});
test('expired links do not expose the password form',()=>{const {node}=setup({hash:'#error=access_denied&error_code=otp_expired'});assert.equal(node('choosePassword').hidden,true);assert.match(node('recoveryStatus').textContent,/expirou/)});
