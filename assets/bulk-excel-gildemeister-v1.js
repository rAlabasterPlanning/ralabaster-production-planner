// rAlabaster bulk Excel extension: Gildemeister + powder coating import rules.
(()=>{
const VERSION='20260911-2';
const CANONICAL=['Gildemeister','Gildemeister - Instellen','Poedercoaten (extern)'];
const RATE={'Gildemeister':20.5,'Gildemeister - Instellen':60};
const norm=s=>String(s??'').trim().replace(/\s+/g,' ');
const lower=s=>norm(s).toLowerCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
const money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(n));
function canonicalWp(v){
 const x=lower(v).replace(/\s*-\s*/g,' - ');
 if(x==='gildemeister')return'Gildemeister';
 if(x==='gildemeister - instellen')return'Gildemeister - Instellen';
 if(x==='poedercoaten (extern)'||x==='poedercoaten extern'||x==='poedercoaten')return'Poedercoaten (extern)';
 return null;
}
function findHeader(sheet,row,col){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];return cell?.v??''}
function preprocessSheet(sheet){
 const clone=JSON.parse(JSON.stringify(sheet));
 const range=XLSX.utils.decode_range(clone['!ref']||'A1:A1');
 let headerRow=-1,headers={};
 for(let r=range.s.r;r<=Math.min(range.e.r,12);r++){
  headers={};
  for(let c=range.s.c;c<=range.e.c;c++){const v=String(findHeader(clone,r,c)||'').trim();if(v)headers[v]=c}
  if(headers['Klant']&&headers['Product']){headerRow=r;break}
 }
 if(headerRow<0)return {sheet:clone,map:new Map()};
 const replacements=new Map();
 for(let i=1;i<=15;i++){
  const c=headers[`Stap ${i} - Werkplek`];if(c===undefined)continue;
  for(let r=headerRow+1;r<=range.e.r;r++){
   const addr=XLSX.utils.encode_cell({r,c}),cell=clone[addr];if(!cell)continue;
   const canon=canonicalWp(cell.v);if(!canon)continue;
   replacements.set(`${r}|${i}`,canon);
   const placeholder=canon==='Poedercoaten (extern)'?'Waterjetten (extern)':'INTERN - Algemeen';
   cell.v=placeholder;cell.w=placeholder;cell.t='s';
  }
 }
 return {sheet:clone,map:replacements,headerRow};
}
function applyExtensions(rows,meta){
 for(const r of rows){
  for(let i=1;i<=15;i++){
   const canon=meta.map.get(`${r.row-1}|${i}`);if(!canon)continue;
   const step=r.steps[i-1];if(!step)continue;
   step.name=canon;step.machine=canon;
   if(canon==='Poedercoaten (extern)'){
    step.mode='external';
    step.rate=0;
    if(!step.minutes)step.minutes=20160;
    if(!r.warnings.includes('Poedercoaten is extern; externe kostprijs staat op €0 totdat hiervoor een tarief is ingesteld'))r.warnings.push('Poedercoaten is extern; externe kostprijs staat op €0 totdat hiervoor een tarief is ingesteld');
   }else{
    step.mode=step.mode==='external'||step.mode==='wait'?'batch':step.mode;
    step.rate=RATE[canon];
   }
  }
  if(r.steps.some(s=>CANONICAL.includes(s.machine))&&window.RALAB_BULK_EXCEL?.rowCost){
   r.cost=window.RALAB_BULK_EXCEL.rowCost(r);
   r.totalSale=num(r.saleUnit)*num(r.qty);
   r.margin=r.totalSale-r.cost.total;
   r.marginPct=r.totalSale?r.margin/r.totalSale*100:0;
  }
 }
 return rows;
}
function previewHtml(rows){
 const good=rows.filter(r=>!r.errors.length),bad=rows.length-good.length,newCustomers=new Set(good.filter(r=>!r.existingCustomer).map(r=>lower(r.customer))).size,newProducts=new Set(good.filter(r=>!r.existingProduct).map(r=>lower(r.product))).size;
 return `<div class="notice"><b>${rows.length} regels gevonden</b> · ${good.length} klaar voor import · ${bad} met fouten · ${newCustomers} nieuwe klanten · ${newProducts} nieuwe producten.<br><span class="muted">Gildemeister wordt berekend tegen hetzelfde machinetarief als Mori SL25 (€20,50/u); Gildemeister - Instellen tegen €60/u. Poedercoaten wordt automatisch als externe stap behandeld.</span></div><div class="panel" style="overflow:auto;margin-top:12px"><table style="min-width:1450px"><thead><tr><th>Excel</th><th>Intern ordernr.</th><th>Klant</th><th>Product</th><th>Aantal</th><th>Gewenst gereed</th><th>Verkoop/st.</th><th>Kost/st.</th><th>Marge</th><th>Stappen</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.row}</td><td><b>${esc(r.orderNo)}</b></td><td>${esc(r.customer)}</td><td>${esc(r.product)}</td><td>${r.qty||'—'}</td><td>${esc(r.ready||'—')}</td><td>${money(r.saleUnit)}</td><td>${money(r.cost?.costUnit)}</td><td>${money(r.margin)}${r.totalSale?`<br><span class="muted">${num(r.marginPct).toFixed(1)}%</span>`:''}</td><td>${r.steps.length}</td><td>${r.errors.length?`<span style="color:var(--danger);font-weight:700">${esc(r.errors.join(' · '))}</span>`:`<span style="color:var(--ok);font-weight:700">Klaar</span>${r.warnings.length?`<div class="muted">${esc(r.warnings.join(' · '))}</div>`:''}`}</td></tr>`).join('')}</tbody></table></div>`;
}
async function readSelectedExtended(){
 const f=document.getElementById('bulkExcelFile')?.files?.[0];if(!f)return alert('Kies eerst het ingevulde Excel-bestand.');
 if(!window.XLSX||!window.RALAB_BULK_EXCEL)return alert('Excel-import is nog niet geladen. Ververs de pagina met Ctrl+F5.');
 const data=await f.arrayBuffer(),wb=XLSX.read(data,{type:'array',cellDates:true});
 const source=wb.Sheets['Orders']||wb.Sheets[wb.SheetNames[0]];if(!source)return alert('Geen werkblad gevonden.');
 const meta=preprocessSheet(source),rows=applyExtensions(window.RALAB_BULK_EXCEL.parseRows(meta.sheet),meta);
 window.__ralabBulkRows=rows;
 const p=document.getElementById('bulkExcelPreview');if(p)p.innerHTML=previewHtml(rows);
 const btn=document.querySelector('[data-bulk-import]');if(btn)btn.disabled=!rows.length||rows.some(r=>r.errors.length);
 return rows;
}
function install(){
 if(!window.RALAB_BULK_EXCEL||!window.XLSX)return setTimeout(install,200);
 for(const x of CANONICAL)if(!window.RALAB_BULK_EXCEL.workplaces.includes(x))window.RALAB_BULK_EXCEL.workplaces.push(x);
 document.addEventListener('change',e=>{if(e.target?.id!=='bulkExcelFile')return;e.stopImmediatePropagation();readSelectedExtended().catch(err=>{console.error(err);alert('Excel kon niet worden gelezen: '+(err?.message||err))})},true);
 document.addEventListener('click',e=>{if(!e.target.closest('[data-bulk-preview]'))return;e.preventDefault();e.stopImmediatePropagation();readSelectedExtended().catch(err=>alert('Excel kon niet worden gelezen: '+(err?.message||err)))},true);
 window.RALAB_BULK_GILDEMEISTER={version:VERSION,canonicalWp,readSelectedExtended};
}
setTimeout(install,900);
})();