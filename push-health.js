import {recoverPushRegistration,enablePush} from './backend.js?v=20261125-push-recovery';
export function initPushHealth({db,root}){
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const title=document.createElement('h3');title.textContent='Notificações neste dispositivo';
 const repair=document.createElement('button');repair.type='button';repair.textContent='Ativar ou reparar notificações';
 const test=document.createElement('button');test.type='button';test.textContent='Enviar notificação de teste';test.disabled=true;
 const actions=document.createElement('div');actions.className='actions';actions.append(repair,test);
 const report=document.createElement('p');report.setAttribute('role','status');
 root.classList.add('push-health');root.append(title,status,actions,report);
 let working=false,lastCheck=0;
 async function refresh(force=false){if(working||(!force&&Date.now()-lastCheck<30000))return;working=true;lastCheck=Date.now();try{const result=await recoverPushRegistration();status.textContent=result.message;root.classList.toggle('push-attention',!result.registered);test.disabled=!result.registered}finally{working=false}}
 repair.onclick=async()=>{repair.disabled=true;try{await enablePush({renew:true});await refresh(true)}catch(error){status.textContent=error.message;root.classList.add('push-attention')}finally{repair.disabled=false}};
 test.onclick=async()=>{test.disabled=true;report.textContent='A enviar um teste para os dispositivos desta conta…';try{const {data:id,error}=await db.rpc('send_device_push_test');if(error)throw error;let result;for(let attempt=0;attempt<5;attempt++){await new Promise(resolve=>setTimeout(resolve,1000));const response=await db.rpc('device_push_test_status',{p_id:id});if(response.error)throw response.error;result=response.data;if(result.accepted>0||result.registered_devices===0)break}report.textContent=result?.accepted>0?'O serviço aceitou o teste. Confirme se apareceu no telemóvel.':result?.registered_devices===0?'O registo do dispositivo expirou. Toque em Ativar ou reparar e volte a testar.':'O teste está a aguardar envio. Verifique a ligação e tente novamente dentro de um minuto.'}catch(error){report.textContent='Não foi possível enviar o teste: '+error.message}finally{test.disabled=false}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('focus',()=>refresh());
 refresh(true);return {refresh};
}
