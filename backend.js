import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.ANA_CONFIG||{};
export const db=cfg.supabaseUrl&&cfg.supabasePublishableKey?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
export const message=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
export async function login(email,returnPage){
 if(!db)throw Error('A base de dados ainda não está configurada.');
 const redirect=new URL(returnPage,location.href);redirect.hash='';
 const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirect.href}});
 if(error)throw error;
}
export async function currentUser(){if(!db)return null;const {data,error}=await db.auth.getUser();return error?null:data.user}
export async function registerWorker(){if('serviceWorker' in navigator&&location.protocol==='https:')return navigator.serviceWorker.register('./sw.js',{scope:'./'})}
