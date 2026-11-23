import {db,currentUser,recoveryLink} from './backend.js?v=20261122-recovery';
const el=id=>document.getElementById(id);
const requestForm=el('requestRecovery'),passwordForm=el('choosePassword'),requestButton=el('requestRecoveryButton');
let busy=false,verifiedRecovery=false;
let readyAt=0;try{readyAt=Number(sessionStorage.getItem('anaRecoveryReadyAt'))||0}catch{}
const status=text=>el('recoveryStatus').textContent=text;
function cooldown(){const seconds=Math.max(0,Math.ceil((readyAt-Date.now())/1000));requestButton.disabled=busy||seconds>0;requestButton.textContent=seconds?'Pedir novo link em '+seconds+' s':'Enviar link de recuperação'}
function failure(error){
 if(error.code==='over_email_send_rate_limit'||error.status===429||/rate limit/i.test(error.message||''))return 'O serviço atingiu o limite temporário de emails. Aguarde antes de tentar novamente. Se persistir, contacte a Ana.';
 if(error.code==='email_address_not_authorized')return 'O envio de recuperação ainda precisa de ser ativado. Contacte a Ana para obter ajuda.';
 if(['otp_expired','otp_disabled','session_not_found','refresh_token_not_found'].includes(error.code))return 'Este link expirou ou já foi utilizado. Peça um novo link abaixo.';
 if(error.code==='same_password')return 'Escolha uma palavra-passe diferente da anterior.';
 return 'Não foi possível concluir. Verifique a ligação à internet e tente novamente.';
}
async function verifyRecovery(){
 if(!await currentUser()){status('Este link não é válido ou já expirou. Peça um novo link.');return}
 verifiedRecovery=true;requestForm.hidden=true;passwordForm.hidden=false;el('recoveryTitle').textContent='Nova palavra-passe';status('Link validado. Pode escolher uma palavra-passe com pelo menos 8 caracteres.');
}
if(!db){requestButton.disabled=true;status('Não foi possível ligar ao serviço de contas. Tente mais tarde.')}
else{
 const params=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 const linkError=params.has('error')||query.has('error');
 if(linkError){history.replaceState(null,'',location.pathname);status('Este link expirou ou já foi utilizado. Peça um novo link.')}
 db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setTimeout(()=>{verifyRecovery()},0)});
 if(recoveryLink&&!linkError)verifyRecovery();
 requestForm.onsubmit=async event=>{
  event.preventDefault();if(busy||Date.now()<readyAt||!requestForm.reportValidity())return;
  busy=true;readyAt=Date.now()+60000;try{sessionStorage.setItem('anaRecoveryReadyAt',String(readyAt))}catch{}cooldown();status('A pedir o link de recuperação…');
  try{const {error}=await db.auth.resetPasswordForEmail(el('recoveryEmail').value.trim(),{redirectTo:'https://ana-esteticista.pages.dev/recuperar.html'});if(error)throw error;status('Se existir uma conta com esse email, receberá um link de recuperação. Verifique a caixa de entrada e o spam.');}
  catch(error){status(failure(error))}finally{busy=false;cooldown()}
 };
 passwordForm.onsubmit=async event=>{
  event.preventDefault();if(busy||!verifiedRecovery||!passwordForm.reportValidity())return;
  if(el('newPassword').value!==el('repeatPassword').value){status('As palavras-passe não coincidem. Repita a mesma nas duas caixas.');return}
  busy=true;el('saveNewPassword').disabled=true;status('A guardar a nova palavra-passe…');
  try{const {error}=await db.auth.updateUser({password:el('newPassword').value});if(error)throw error;passwordForm.reset();passwordForm.hidden=true;verifiedRecovery=false;await db.auth.signOut({scope:'local'});history.replaceState(null,'',location.pathname);status('Palavra-passe atualizada. Já pode voltar a entrar na sua conta.');el('backToLogin').hidden=false;}
  catch(error){status(failure(error));if(['session_not_found','otp_expired'].includes(error.code)){verifiedRecovery=false;passwordForm.hidden=true;requestForm.hidden=false}}
  finally{busy=false;el('saveNewPassword').disabled=false}
 };
 el('showNewPassword').onchange=()=>{el('newPassword').type=el('repeatPassword').type=el('showNewPassword').checked?'text':'password'};
 cooldown();setInterval(cooldown,1000);
}
