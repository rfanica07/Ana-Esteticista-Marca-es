import {internationalPhone} from './agenda.js';
export const APP_URL='https://ana-esteticista.pages.dev/';
export function appInvitationMessage(contact){
 const name=String(contact.name||'').trim();
 return `Olá${name?' '+name:''}! Sou a Ana, do salão Luisa & Ana. 🌸

Convido-a a instalar a nossa app para consultar os serviços e fazer os seus pedidos de marcação:
${APP_URL}

Para guardar a app no telemóvel:
• iPhone: abra o link no Safari, toque em Partilhar e em “Adicionar ao ecrã principal”. Se aparecer “Abrir como aplicação web”, ative essa opção e toque em Adicionar.
• Android: abra o link no Chrome e, no menu ⋮, escolha “Instalar e criar atalho” e “Instalar” (em algumas versões, “Adicionar ao ecrã principal”).

Depois, abra a app pelo ícone, crie a sua conta e ative as notificações para receber as respostas aos seus pedidos.

Até breve! 🌸`;
}
export function appInvitationLink(contact,text=appInvitationMessage(contact)){
 const phone=internationalPhone(String(contact.phone||''));
 return /^\d{10,15}$/.test(phone)?'https://wa.me/'+phone+'?text='+encodeURIComponent(text):null;
}
export function appInvitationControls(contact,{open=false}={}){
 const panel=document.createElement('details');panel.className='follow-up app-invitation';panel.open=open;
 const title=document.createElement('summary');title.textContent='Convidar para a app';
 const note=document.createElement('p');note.textContent='A mensagem inclui o link e os passos para instalar no iPhone ou Android. Reveja e envie à cliente pelo WhatsApp.';
 const text=document.createElement('textarea');text.value=appInvitationMessage(contact);text.rows=12;text.readOnly=true;text.setAttribute('aria-label','Convite para a app'+(contact.name?' · '+contact.name:''));
 const actions=document.createElement('div');actions.className='actions';
 const url=appInvitationLink(contact,text.value);
 if(url){const send=document.createElement('a');send.href=url;send.target='_blank';send.rel='noopener noreferrer';send.textContent='Abrir convite no WhatsApp';actions.append(send)}
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar convite';
 const status=document.createElement('p');status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Convite copiado. Cole na conversa da cliente e envie.'}catch{text.focus();text.select();status.textContent='Selecione e copie o convite acima para enviar à cliente.'}};
 actions.append(copy);panel.append(title,note,text,actions,status);return panel;
}
