import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
export const recoveryLink=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
const cfg=window.ANA_CONFIG||{};
export const db=cfg.supabaseUrl&&cfg.supabasePublishableKey?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
export const message=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
function authError(error){
 if(error.code==='over_email_send_rate_limit'||/email rate limit exceeded/i.test(error.message||''))
  return 'O envio de emails atingiu o limite do serviço atual. A Ana precisa de concluir a configuração do serviço de email da app.';
 if(error.code==='email_address_not_authorized')
  return 'O envio de emails para este endereço ainda não está disponível. Contacte a Ana.';
 return error.message||'Não foi possível continuar. Tente novamente.';
}
export function bindLogin(emailId,statusId,onLogin){
 const form=document.getElementById('account'), email=document.getElementById(emailId), password=document.getElementById('password');
 let busy=false, recovering=recoveryLink;
 const reset=document.getElementById('resetPassword');
 function recovery(){
  recovering=true;form.hidden=false;email.required=false;email.disabled=true;
  password.autocomplete='new-password';password.minLength=8;
  form.querySelector('button').textContent='Guardar palavra-passe';
  document.getElementById('signup').hidden=true;reset.hidden=true;
  message(statusId,'Escolha uma nova palavra-passe com pelo menos 8 caracteres.');
 }
 if(recovering)recovery();
 db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recovery()});
 reset.onclick=async()=>{
  if(busy||!email.reportValidity())return;
  busy=true;
  reset.disabled=true;
  message(statusId,'A pedir o link de recuperação…');
  try{
   const {error}=await db.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:new URL(location.pathname,location.origin).href});
   if(error)throw error;
   message(statusId,'Se a conta existir, receberá um link para definir a palavra-passe.');
  }catch(e){message(statusId,authError(e))}finally{busy=false;reset.disabled=false}
 };
 async function submit(signup){
  if(busy||!form.reportValidity())return;
  if(signup&&!document.getElementById('registrationPrivacy').checked){message(statusId,'Leia o aviso de privacidade e assinale que tomou conhecimento.');return}
  if(signup&&password.value.length<8){message(statusId,'Escolha uma palavra-passe com pelo menos 8 caracteres.');return}
  busy=true;
  for(const button of form.querySelectorAll('button'))button.disabled=true;
  message(statusId,signup?'A criar a conta…':'A entrar…');
  try{
   if(recovering){
    const {error}=await db.auth.updateUser({password:password.value});
    if(error)throw error;
    location.reload();return;
   }
   const credentials={email:email.value.trim(),password:password.value};
   const {data,error}=signup?await db.auth.signUp({...credentials,options:{data:{privacy_notice_version:'2026-11-20'},emailRedirectTo:new URL(location.pathname,location.origin).href}}):await db.auth.signInWithPassword(credentials);
   if(error)throw error;
   password.value='';
   if(data.session)await onLogin();
   else message(statusId,'Confirme a conta pelo email. Depois entre com a sua palavra-passe.');
  }catch(e){message(statusId,({invalid_credentials:'Email ou palavra-passe incorretos.',email_not_confirmed:'Confirme o email da conta antes de entrar.'})[e.code]||authError(e))}
  finally{busy=false;for(const button of form.querySelectorAll('button'))button.disabled=false}
 }
 form.onsubmit=e=>{e.preventDefault();return submit(false)};
 document.getElementById('signup').onclick=()=>submit(true);
}
export async function currentUser(){if(!db)return null;const {data,error}=await db.auth.getUser();return error?null:data.user}
export async function registerWorker(){if('serviceWorker' in navigator&&location.protocol==='https:')return navigator.serviceWorker.register('./sw.js?v=20261122',{scope:'./'})}
export async function enablePush(){
 if(!('PushManager' in window)||!('Notification' in window))throw Error('Abra a app instalada no ecrã principal para ativar notificações. No iPhone, use Partilhar e Adicionar ao ecrã principal.');
 if(!cfg.vapidPublicKey)throw Error('As notificações ainda precisam de ser configuradas.');
 const user=await currentUser();if(!user)throw Error('Entre primeiro na sua conta.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Autorize as notificações nas definições do telemóvel para receber os avisos.');
 await registerWorker();const reg=await navigator.serviceWorker.ready;
 const encoded=cfg.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/');
 const key=Uint8Array.from(atob(encoded+'='.repeat((4-encoded.length%4)%4)),c=>c.charCodeAt(0));
 const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const {error}=await db.from('push_subscriptions').upsert({endpoint:sub.endpoint,user_id:user.id,subscription:sub.toJSON()});
 if(error)throw Error('Não foi possível registar este dispositivo. Termine a sessão e volte a entrar para tentar novamente.');
}
export async function signOutDevice(){
 if('serviceWorker' in navigator){
  const reg=await navigator.serviceWorker.getRegistration('./');const sub=await reg?.pushManager?.getSubscription();
  if(sub){await db.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe()}
 }
 await db.auth.signOut();
}
