import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
export const recoveryLink=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
const cfg=window.ANA_CONFIG||{};
export const db=cfg.supabaseUrl&&cfg.supabasePublishableKey?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
export const message=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
function authError(error){
 if(error.code==='over_email_send_rate_limit'||/email rate limit exceeded/i.test(error.message||''))
  return 'Foi atingido o limite de envio de emails. Aguarde até uma hora antes de voltar a tentar.';
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
  if(signup&&password.value.length<8){message(statusId,'Escolha uma palavra-passe com pelo menos 8 caracteres.');return}
  busy=true;
  try{
   if(recovering){
    const {error}=await db.auth.updateUser({password:password.value});
    if(error)throw error;
    location.reload();return;
   }
   const credentials={email:email.value.trim(),password:password.value};
   const {data,error}=signup?await db.auth.signUp({...credentials,options:{emailRedirectTo:new URL(location.pathname,location.origin).href}}):await db.auth.signInWithPassword(credentials);
   if(error)throw error;
   password.value='';
   if(data.session)await onLogin();
   else message(statusId,'Confirme a conta pelo email. Depois entre com a sua palavra-passe.');
  }catch(e){message(statusId,({invalid_credentials:'Email ou palavra-passe incorretos.',email_not_confirmed:'Confirme o email da conta antes de entrar.'})[e.code]||authError(e))}
  finally{busy=false}
 }
 form.onsubmit=e=>{e.preventDefault();return submit(false)};
 document.getElementById('signup').onclick=()=>submit(true);
}
export async function currentUser(){if(!db)return null;const {data,error}=await db.auth.getUser();return error?null:data.user}
export async function registerWorker(){if('serviceWorker' in navigator&&location.protocol==='https:')return navigator.serviceWorker.register('./sw.js',{scope:'./'})}
