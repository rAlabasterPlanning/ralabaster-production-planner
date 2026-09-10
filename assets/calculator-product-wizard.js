// rAlabaster - product-voor-product calculatieflow
(()=>{
function S(){try{return state}catch(_){return null}}
function root(){return document.getElementById('view-calculation')}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function activeProduct(){const mp=window.RALAB_MULTI_CALC;return mp?.products?.[mp.active]||null}
function processPanel(){const r=root();return [...(r?.querySelectorAll('.panel')||[])].find(p=>p.querySelector('[data-opcheck]'))||null}
function selectedOpsCount(){return root()?.querySelectorAll('[data-opcheck]:checked').length||0}
function isCurrentComplete(){const name=document.getElementById('cName')?.value?.trim();return !!name&&selectedOpsCount()>0}
function templateOptions(){const s=S();return (s?.productTemplates||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}${t.version?' · v'+t.version:''}</option>`).join('')}
function injectProductChoice(){
 const r=root(),details=document.getElementById('calcProductDetails');if(!r||!details)return;
 let box=document.getElementById('calcProductChoice');
 if(!box){
   box=document.createElement('div');box.id='calcProductChoice';box.style.cssText='margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--line)';
   const grid=details.querySelector('#calcProductGrid');details.insertBefore(box,grid||details.firstChild?.nextSibling||null);
 }
 const p=activeProduct(),currentTemplate=document.getElementById('cTemplate')?.value||p?.templateId||'';
 box.innerHTML=`<div class="grid2"><div class="field"><label>Product kiezen</label><select id="wizardProductChoice" class="input"><option value="new">— Nieuw product —</option>${templateOptions()}</select></div><div class="field"><label>Werkwijze</label><div class="muted" style="padding-top:10px">Kies een bestaand product om de bekende gegevens en processtappen te laden, of maak een nieuw product.</div></div></div>`;
 const sel=box.querySelector('#wizardProductChoice');if(sel){sel.value=currentTemplate||'new';sel.addEventListener('change',()=>{const id=sel.value;if(id==='new'){const tpl=document.getElementById('cTemplate');if(tpl)tpl.value='';return}const tpl=document.getElementById('cTemplate');if(!tpl)return;tpl.value=id;tpl.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(arrange,120)})}
}
function renderSummaries(){
 const bar=document.getElementById('multiProductBar'),mp=window.RALAB_MULTI_CALC;if(!bar||!mp)return;
 const add=bar.querySelector('#mpAdd');if(add)add.style.display='none';
 const holder=[...bar.querySelectorAll('div')].find(d=>d.querySelector?.('[data-mp-index]'));
 if(holder){holder.style.gap='10px';holder.querySelectorAll('[data-mp-index]').forEach((b,i)=>{const p=mp.products[i]||{};const done=!!p.name&&(p.ops||[]).length>0;b.textContent=`${i+1}. ${p.name||'Nieuw product'} · ${p.qty||1} st.${done?' · compleet':''}`;b.title='Klik om dit product te wijzigen';});}
 const title=bar.querySelector('h3');if(title)title.textContent='2. Producten in deze calculatie';
}
function injectNextButton(){
 const panel=processPanel();if(!panel)return;
 let wrap=document.getElementById('wizardNextProductWrap');
 if(!wrap){wrap=document.createElement('div');wrap.id='wizardNextProductWrap';wrap.style.cssText='margin:12px 0 18px;display:flex;align-items:center;gap:12px';panel.insertAdjacentElement('afterend',wrap)}
 const count=window.RALAB_MULTI_CALC?.products?.length||1;
 wrap.innerHTML=`<button class="btn primary" id="wizardAddProduct">+ Nog een product toevoegen</button><span class="muted">Maak product ${count} eerst compleet; daarna voeg je het volgende product toe.</span>`;
 wrap.querySelector('#wizardAddProduct')?.addEventListener('click',()=>{
   if(!isCurrentComplete())return alert('Maak dit product eerst compleet: vul een productnaam in en selecteer de processtappen.');
   const hiddenAdd=document.querySelector('#multiProductBar #mpAdd');if(!hiddenAdd)return alert('Product toevoegen is nog niet beschikbaar. Vernieuw de pagina en probeer opnieuw.');
   hiddenAdd.click();setTimeout(()=>{const choice=document.getElementById('wizardProductChoice');if(choice)choice.value='new';document.getElementById('cName')?.focus();arrange()},100)
 })
}
function renumber(){const d=document.querySelector('#calcProductDetails h3');if(d)d.textContent='3. Product '+((window.RALAB_MULTI_CALC?.active||0)+1);const p=processPanel()?.querySelector('h3');if(p)p.textContent='4. Processtappen product '+((window.RALAB_MULTI_CALC?.active||0)+1)}
function arrange(){const r=root();if(!r||r.classList.contains('hidden'))return;injectProductChoice();renderSummaries();injectNextButton();renumber()}
new MutationObserver(()=>setTimeout(arrange,30)).observe(document.querySelector('main')||document.body,{subtree:true,childList:true});
document.addEventListener('click',e=>{if(e.target.closest('.navbtn[data-view="calculation"], [data-mp-index], #loadSelectedSteps, #editStepSelection'))setTimeout(arrange,100)},true);
document.addEventListener('change',e=>{if(root()?.contains(e.target))setTimeout(arrange,80)},true);
setTimeout(arrange,1200);
})();
