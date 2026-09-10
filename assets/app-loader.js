(async()=>{
  try{
    const parts=['app.part01.txt','app.part02.txt','app.part03.txt','app.part04.txt','app.part05.txt','app.part06.txt'];
    const texts=[];
    for(const p of parts){
      const r=await fetch('assets/'+p,{cache:'no-store'});
      if(!r.ok) throw new Error(p+' kon niet worden geladen ('+r.status+')');
      texts.push(await r.text());
    }
    const s=document.createElement('script');
    s.textContent=texts.join('');
    document.body.appendChild(s);
  }catch(e){
    console.error('Planner laden mislukt',e);
    const main=document.querySelector('main');
    if(main) main.innerHTML='<div style="padding:24px;font-family:system-ui"><h2>Planner kon niet laden</h2><p>'+String(e.message||e)+'</p><p>Vernieuw de pagina met Ctrl+F5.</p></div>';
  }
})();
