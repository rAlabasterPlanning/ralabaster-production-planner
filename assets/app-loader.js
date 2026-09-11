(async()=>{
  try{
    const ver='20260911-2';
    const parts=['app.part01.txt','app.part02.txt','app.part03.txt','app.part04.txt','app.part05.txt','app.part06.txt','app.part07.txt'];
    const texts=await Promise.all(parts.map(async p=>{
      const r=await fetch('assets/'+p+'?v='+ver,{cache:'default'});
      if(!r.ok) throw new Error(p+' kon niet worden geladen ('+r.status+')');
      return r.text();
    }));
    const cloudPatch=`
// --- non-blocking cloud bootstrap ---
async function initSupabase(){
 const c=onlineConfig();if(!c.url||!c.anonKey||!window.supabase){cloudStatus='offline';renderOnlineBadge();return}
 try{
  supabaseClient=window.supabase.createClient(c.url,c.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data}=await supabaseClient.auth.getSession();cloudUser=data?.session?.user||null;
  if(cloudUser){startCloudRefresh();setTimeout(()=>loadCloudState(true),0)}else{cloudStatus='login';renderOnlineBadge()}
  supabaseClient.auth.onAuthStateChange((_event,session)=>{cloudUser=session?.user||null;if(cloudUser){startCloudRefresh();setTimeout(()=>loadCloudState(true),0)}else{stopCloudRefresh();cloudStatus='login';renderOnlineBadge();renderSettings()}})
 }catch(e){console.error(e);cloudStatus='error';renderOnlineBadge()}
}
async function loadCloudState(silent=false){
 if(!supabaseClient||!cloudUser||cloudLoading)return;
 cloudLoading=true;
 try{
  const {data,error}=await supabaseClient.from('planner_shared_state').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
  if(error)throw error;
  if(data?.data?.normalizedVersion>=2){cloudStatus='online';return}
  if(data?.data?.orders&&data?.data?.tasks){state=data.data;try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}}
  cloudStatus='online';
 }catch(e){console.error(e);cloudStatus='error'}
 finally{cloudLoading=false;renderOnlineBadge()}
}
`;
    const s=document.createElement('script');
    // Duplicate function declarations at the end intentionally override the legacy cloud bootstrap before execution.
    s.textContent=texts.join('')+cloudPatch;
    document.body.appendChild(s);
  }catch(e){
    console.error('Planner laden mislukt',e);
    const main=document.querySelector('main');
    if(main) main.innerHTML='<div style="padding:24px;font-family:system-ui"><h2>Planner kon niet laden</h2><p>'+String(e.message||e)+'</p><p>Vernieuw de pagina met Ctrl+F5.</p></div>';
  }
})();
