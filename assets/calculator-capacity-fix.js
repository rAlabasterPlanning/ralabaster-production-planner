// Zorg dat iedere geselecteerde calculatiestap zichtbaar blijft in de capaciteitstoets.
(()=>{
  function selectedSteps(){
    return [...document.querySelectorAll('#view-calculation [data-opcheck]')]
      .filter(cb=>cb.checked)
      .map(cb=>{
        const row=cb.closest('tr');
        return {
          name:row?.querySelector('td:nth-child(2) b')?.textContent?.trim()||'',
          mode:row?.querySelector('[data-mode]')?.value||'',
          minutes:Number(row?.querySelector('[data-minutes]')?.value||0)
        };
      })
      .filter(x=>x.name);
  }

  function repairCapacityResult(selected){
    const root=document.getElementById('calcResult');
    if(!root||!selected.length)return;
    const headings=[...root.querySelectorAll('h3')];
    const h=headings.find(x=>x.textContent.trim()==='Verwachte procesdoorloop');
    if(!h)return;

    const rendered=[];
    let n=h.nextElementSibling;
    while(n&&n.tagName!=='H3'){
      if(n.matches('div')){
        const b=n.querySelector('b');
        if(b){
          const raw=b.textContent.replace(/^\s*\d+\.\s*/, '').trim();
          if(raw)rendered.push({name:raw,node:n});
        }
      }
      n=n.nextElementSibling;
    }

    const present=new Set(rendered.map(x=>x.name));
    const missing=selected.filter(x=>!present.has(x.name));
    root.querySelectorAll('.capacity-missing-step,.capacity-missing-warning').forEach(x=>x.remove());
    if(!missing.length)return;

    const warning=document.createElement('div');
    warning.className='notice capacity-missing-warning';
    warning.style.margin='8px 0';
    warning.innerHTML=`<b>${missing.length} geselecteerde stap${missing.length===1?'':'pen'} zonder ingevoerde tijd.</b> Deze staan hieronder wel in de route, maar tellen niet mee in de capaciteitsberekening.`;
    h.insertAdjacentElement('afterend',warning);

    // Voeg ontbrekende regels toe vóór de eerstvolgende geselecteerde stap die wel bestaat.
    missing.forEach(m=>{
      const idx=selected.findIndex(x=>x.name===m.name);
      const next=selected.slice(idx+1).find(x=>present.has(x.name));
      const div=document.createElement('div');
      div.className='capacity-missing-step';
      div.style.cssText='padding:8px;border-bottom:1px solid #eee';
      div.innerHTML=`<b>${idx+1}. ${escapeHtml(m.name)}</b> · <strong>Tijd ontbreekt – niet in capaciteit meegerekend</strong>`;
      const target=next?rendered.find(x=>x.name===next.name)?.node:null;
      if(target) target.insertAdjacentElement('beforebegin',div);
      else root.querySelector('.panel')?.appendChild(div);
    });
  }

  function escapeHtml(s){
    return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn||btn.textContent.trim()!=='Berekenen + capaciteit toetsen')return;
    const selected=selectedSteps();
    setTimeout(()=>repairCapacityResult(selected),80);
  },true);
})();
