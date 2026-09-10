// rAlabaster - logische schermvolgorde calculaties
(()=>{
function root(){return document.getElementById('view-calculation')}
function fieldFor(id){const e=document.getElementById(id);return e?.closest('.field')||e}
function buttonByText(text){return [...(root()?.querySelectorAll('button')||[])].find(b=>(b.textContent||'').trim().includes(text))}
function arrange(){
 const r=root();if(!r||r.classList.contains('hidden'))return;
 const firstPanel=[...r.querySelectorAll(':scope > .panel')][0]||r.querySelector('.panel');
 const productBar=document.getElementById('multiProductBar');
 const processTable=[...r.querySelectorAll('table')].find(t=>t.querySelector('[data-opcheck]'));
 const processPanel=processTable?.closest('.panel');
 if(!firstPanel||!productBar||!processPanel)return;

 // 1. Algemene gegevens: alleen klant/project/order/datum/concept.
 let general=document.getElementById('calcGeneralBlock');
 if(!general){
   general=document.createElement('div');general.id='calcGeneralBlock';general.className='panel';general.style.cssText='padding:16px;margin-bottom:12px';
   general.innerHTML='<h3 style="margin-top:0">Algemene gegevens</h3><div class="grid3" id="calcGeneralGrid"></div>';
   firstPanel.insertAdjacentElement('beforebegin',general);
 }
 const gg=document.getElementById('calcGeneralGrid');
 ['cCustomer','cProject','cOrder','cDeadline','cDraft'].forEach(id=>{const f=fieldFor(id);if(f&&f.parentNode!==gg)gg.appendChild(f)});

 // 2. Productgegevens horen direct onder productkeuze.
 let pd=document.getElementById('calcProductDetails');
 if(!pd){
   pd=document.createElement('div');pd.id='calcProductDetails';pd.className='panel';pd.style.cssText='padding:16px;margin:12px 0';
   pd.innerHTML='<h3 style="margin-top:0">Gegevens actief product</h3><div class="grid3" id="calcProductGrid"></div>';
   productBar.insertAdjacentElement('afterend',pd);
 }
 const pg=document.getElementById('calcProductGrid');
 ['cName','cQty','cTemplate','cMaterial','cMaterialMode','cMarginMode','cMargin'].forEach(id=>{const f=fieldFor(id);if(f&&f.parentNode!==pg)pg.appendChild(f)});

 // Oude lege bovenste panel verbergen zodra alle velden eruit zijn.
 const leftovers=[...firstPanel.querySelectorAll('input,select,textarea')].filter(e=>!['calcTestOrder'].includes(e.id));
 if(!leftovers.length)firstPanel.style.display='none';

 // Zorg voor vaste volgorde: algemeen -> producten -> actief product -> proces.
 if(general.nextElementSibling!==productBar)general.insertAdjacentElement('afterend',productBar);
 if(productBar.nextElementSibling!==pd)productBar.insertAdjacentElement('afterend',pd);
 if(pd.nextElementSibling!==processPanel)pd.insertAdjacentElement('afterend',processPanel);

 // 3. Rekenknop apart vóór resultaten.
 let calcActions=document.getElementById('calcPrimaryAction');
 if(!calcActions){calcActions=document.createElement('div');calcActions.id='calcPrimaryAction';calcActions.style.cssText='margin:12px 0;display:flex;gap:8px;flex-wrap:wrap';processPanel.insertAdjacentElement('afterend',calcActions)}
 const calculate=buttonByText('Berekenen + capaciteit toetsen');if(calculate&&calculate.parentNode!==calcActions)calcActions.appendChild(calculate);

 // 4. Resultaat/totalen daarna.
 const summary=document.getElementById('multiCalcSummary');const result=document.getElementById('calcResult');
 if(summary&&calcActions.nextElementSibling!==summary)calcActions.insertAdjacentElement('afterend',summary);
 if(result&&summary&&summary.nextElementSibling!==result)summary.insertAdjacentElement('afterend',result);

 // 5. Vervolgacties helemaal onderaan.
 let follow=document.getElementById('calcFollowupActions');
 if(!follow){follow=document.createElement('div');follow.id='calcFollowupActions';follow.style.cssText='margin:12px 0 24px;display:flex;gap:8px;flex-wrap:wrap';(result||summary||calcActions).insertAdjacentElement('afterend',follow)}
 ['Producttemplate opslaan','Concept opslaan','Naar offertes','Direct order & plannen'].forEach(txt=>{const b=buttonByText(txt);if(b&&b.parentNode!==follow)follow.appendChild(b)});
 if(result&&follow.previousElementSibling!==result)result.insertAdjacentElement('afterend',follow);

 // Duidelijke nummering/labels.
 const pTitle=productBar.querySelector('h3');if(pTitle)pTitle.textContent='2. Producten in deze calculatie';
 const gTitle=general.querySelector('h3');if(gTitle)gTitle.textContent='1. Algemene gegevens';
 const dTitle=pd.querySelector('h3');if(dTitle)dTitle.textContent='3. Gegevens actief product';
 const procTitle=processPanel.querySelector('h3');if(procTitle)procTitle.textContent='4. Processtappen actief product';
 calculate && (calculate.textContent='5. Berekenen + capaciteit toetsen');
}
function boot(){arrange();setTimeout(arrange,80);setTimeout(arrange,250)}
new MutationObserver(()=>setTimeout(arrange,20)).observe(document.querySelector('main')||document.body,{subtree:true,childList:true});
document.addEventListener('click',e=>{if(e.target.closest('.navbtn[data-view="calculation"]'))setTimeout(boot,100)},true);
setTimeout(boot,1200);
})();
