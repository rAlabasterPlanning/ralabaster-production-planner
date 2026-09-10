// rAlabaster hoofdplanner login-gate
(()=>{
const CFG=window.RALAB_CONFIG?.online||{};
const STATE_KEY='ralabaster_planner_v1';
const AUTH_EMAIL_KEY='ralabaster_admin_email';

function style(){
 const s=document.createElement('style');
 s.id='ralab-auth-style';
 s.textContent=`
  html.ralab-auth-pending body>header,html.ralab-auth-pending body>main,html.ralab-auth-pending body>#printArea,html.ralab-auth-pending body>#modalRoot{visibility:hidden!important}
  #ralabAuthGate{position:fixed;inset:0;z-index:999999;background:#f5f3ee;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif}
  #ralabAuthGate .auth-card{width:min(430px,100%);background:#fff;border:1px solid #ddd7cc;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.12)}
  #ralabAuthGate h1{margin:0 0 6px;font-size:24px}#ralabAuthGate p{margin:0 0 20px;color:#666;line-height:1.45}
  #ralabAuthGate label{display:block;font-weight:700;margin:12px 0 6px}#ralabAuthGate input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccc;border-radius:9px;font-size:16px}
  #ralabAuthGate button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:9px;background:#1f332f;color:white;font-weight:800;font-size:15px;cursor:pointer}
  #ralabAuthGate button:disabled{opacity:.55;cursor:wait}#ralabAuthError{min-height:20px;margin-top:12px;color:#a52222;font-weight:700;font-size:13px}
  #ralabAdminLogout{margin-left:8px;white-space:nowrap}
 `;
 document.head.appendChild(s);
}

function gateHtml(){
 const saved=localStorage.getItem(AUTH_EMAIL_KEY)||'';
 const gate=document.createElement('div');gate.id='ralabAuthGate';
 gate.innerHTML=`<div class="auth-card"><h1>rAlabaster Planner</h1><p>Log in om de hoofdplanner, klanten, calculaties en commerciële gegevens te openen.</p><form id="ralabAuthForm"><label>E-mail</label><input id="ralabAuthEmail" type="email" autocomplete="username" required value="${saved.replace(/[&<>"']/g,'')}"/><label>Wachtwoord</label><input id="ralabAuthPassword" type="password" autocomplete="current-password" required/><button id="ralabAuthSubmit" type="submit">Inloggen</button><div id="ralabAuthError"></div></form></div>`;
 document.body.appendChild(gate);
 return gate;
}

function reveal(){
 document.documentElement.classList.remove('ralab-auth-pending');
 document.getElementById('ralabAuthGate')?.remove();
 addLogout();
}

function addLogout(){
 if(document.getElementById('ralabAdminLogout'))return;
 const header=document.querySelector('header');if(!header)return;
 const b=document.createElement('button');b.id='ralabAdminLogout';b.className='btn small';b.textContent='Uitloggen';
 b.addEventListener('click',async()=>{
  if(!confirm('Uitloggen uit de hoofdplanner?'))return;
  try{await window.RALAB_ADMIN_AUTH?.client?.auth.signOut()}catch(e){console.error(e)}
  localStorage.removeItem(STATE_KEY);
  location.reload();
 });
 header.appendChild(b);
}

async function boot(){
 document.documentElement.classList.add('ralab-auth-pending');style();
 if(!CFG.supabaseUrl||!CFG.supabasePublishableKey||!window.supabase){
  const g=gateHtml();g.querySelector('#ralabAuthError').textContent='Login kan niet worden gestart: Supabase-configuratie ontbreekt.';return;
 }
 const client=window.supabase.createClient(CFG.supabaseUrl,CFG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 window.RALAB_ADMIN_AUTH={client};
 try{
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  if(data?.session?.user){reveal();return}
 }catch(e){console.error(e)}
 const gate=gateHtml(),form=gate.querySelector('#ralabAuthForm'),err=gate.querySelector('#ralabAuthError'),btn=gate.querySelector('#ralabAuthSubmit');
 form.addEventListener('submit',async e=>{
  e.preventDefault();err.textContent='';btn.disabled=true;btn.textContent='Bezig met inloggen…';
  const email=gate.querySelector('#ralabAuthEmail').value.trim(),password=gate.querySelector('#ralabAuthPassword').value;
  try{
   const {data,error}=await client.auth.signInWithPassword({email,password});
   if(error)throw error;
   if(!data?.session)throw new Error('Geen geldige sessie ontvangen.');
   localStorage.setItem(AUTH_EMAIL_KEY,email);
   location.reload();
  }catch(e){err.textContent='Inloggen mislukt. Controleer e-mailadres en wachtwoord.';btn.disabled=false;btn.textContent='Inloggen'}
 });
}
boot();
})();
