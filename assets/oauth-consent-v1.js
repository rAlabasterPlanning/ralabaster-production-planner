(async()=>{
  'use strict';
  const SUPABASE_URL='https://gspqapzowtktdobltkcl.supabase.co';
  const SUPABASE_KEY='sb_publishable_cH7Q_KVdG41QYkp0wvdHVQ_HbaX6VHh';
  const authorizationId=new URLSearchParams(location.search).get('authorization_id')||'';
  const client=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const byId=id=>document.getElementById(id),show=id=>['loading','login','consent'].forEach(x=>byId(x).classList.toggle('hidden',x!==id));
  const fail=message=>{byId('error').textContent=String(message||'De koppeling kon niet worden geladen.')};
  let details=null;

  async function load(){
    byId('error').textContent='';
    if(!client)return fail('De beveiligde loginbibliotheek kon niet worden geladen. Vernieuw de pagina.');
    if(!authorizationId)return fail('Deze koppelingsaanvraag is ongeldig of verlopen. Start de verbinding opnieuw vanuit ChatGPT.');
    const {data:{user}}=await client.auth.getUser();
    if(!user){show('login');return}
    const {data,error}=await client.auth.oauth.getAuthorizationDetails(authorizationId);
    if(error)return fail(error.message);
    if(data?.redirect_url&&!data.authorization_id){location.assign(data.redirect_url);return}
    details=data;
    byId('clientName').textContent=data?.client?.name||'ChatGPT';
    byId('redirectUri').textContent=data?.redirect_uri||'';
    show('consent');
  }

  byId('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();byId('error').textContent='';
    const button=event.submitter;button.disabled=true;
    const form=new FormData(event.currentTarget),{error}=await client.auth.signInWithPassword({email:String(form.get('email')||''),password:String(form.get('password')||'')});
    button.disabled=false;if(error)return fail(error.message);show('loading');await load();
  });
  byId('approve').addEventListener('click',async event=>{
    event.currentTarget.disabled=true;byId('deny').disabled=true;
    const {data,error}=await client.auth.oauth.approveAuthorization(authorizationId);
    if(error){event.currentTarget.disabled=false;byId('deny').disabled=false;return fail(error.message)}
    location.assign(data.redirect_url);
  });
  byId('deny').addEventListener('click',async event=>{
    event.currentTarget.disabled=true;byId('approve').disabled=true;
    const {data,error}=await client.auth.oauth.denyAuthorization(authorizationId);
    if(error){event.currentTarget.disabled=false;byId('approve').disabled=false;return fail(error.message)}
    location.assign(data.redirect_url);
  });
  await load();
})().catch(error=>{const el=document.getElementById('error');if(el)el.textContent=String(error?.message||error)});
