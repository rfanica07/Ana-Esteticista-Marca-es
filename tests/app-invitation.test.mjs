import {test} from 'node:test';import assert from 'node:assert/strict';
import {APP_URL,appInvitationMessage,appInvitationLink} from '../app-invitation.js';
test('invitation includes the client name, public app URL and installation steps',()=>{
 const contact={name:' Maria & Inês ',phone:'912 345 678'};const text=appInvitationMessage(contact);const link=new URL(appInvitationLink(contact));
 assert.match(text,/Olá Maria & Inês!/);assert.match(text,/Luisa & Ana/);assert.ok(text.includes(APP_URL));assert.match(text,/iPhone/);assert.match(text,/Android/);assert.match(text,/notificações/);assert.doesNotMatch(text,/rfanica07|localhost|127\.0\.0\.1/);
 assert.equal(link.origin,'https://wa.me');assert.equal(link.pathname,'/351912345678');assert.equal(link.searchParams.get('text'),text);
});
test('invalid recipients have no WhatsApp link and an unnamed invitation remains usable',()=>{
 assert.equal(appInvitationLink({name:'Cliente',phone:'abc'}),null);assert.match(appInvitationMessage({phone:''}),/^Olá!/);assert.equal(new URL(appInvitationLink({phone:'00447700900123'})).pathname,'/447700900123');
});
