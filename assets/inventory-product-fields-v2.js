// Product requirements used to match products to raw stock, slabs and semi-finished stock.
(()=>{
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let editingId=null,newVersion=false;
const S=()=>{try{return state}catch{return null}},val=(v,key,legacy='')=>v[key]??(legacy?v[legacy]:'')??'';
function source(){return editingId?S()?.productTemplates?.find(x=>x.id===editingId):null}
function inject(){
 const notes=document.getElementById('mpNotes');if(!notes||document.getElementById('mpStockCategory'))return;
 const v=source()||{},box=document.createElement('div');
 box.innerHTML=`<h3 style="margin-top:18px">Uit welk voorraadmateriaal komt dit product?</h3><div class="muted">Vul het minimaal benodigde uitgangsformaat per product in. Zonder deze gegevens doet het systeem geen automatische geschiktheidsclaim.</div><div class="grid3" style="margin-top:10px"><div class="field"><label>Voorraadsoort</label><select id="mpStockCategory" class="input"><option value="">— nog niet gekozen —</option><option value="raw" ${v.stockCategory==='raw'?'selected':''}>Ruw materiaal</option><option value="slab" ${v.stockCategory==='slab'?'selected':''}>Plaat</option><option value="semi" ${v.stockCategory==='semi'?'selected':''}>Half-fabricaat</option></select></div><div class="field"><label>Benodigde ruwe lengte mm</label><input id="mpRequiredLength" class="input" inputmode="decimal" value="${esc(val(v,'requiredStockLengthMm','finishedLengthMm'))}"></div><div class="field"><label>Benodigde ruwe breedte mm</label><input id="mpRequiredWidth" class="input" inputmode="decimal" value="${esc(val(v,'requiredStockWidthMm','finishedWidthMm'))}"></div><div class="field"><label>Benodigde ruwe dikte mm</label><input id="mpRequiredThickness" class="input" inputmode="decimal" value="${esc(val(v,'requiredStockThicknessMm','finishedHeightMm'))}"></div><div class="field"><label>Benodigde ruwe diameter mm</label><input id="mpRequiredDiameter" class="input" inputmode="decimal" value="${esc(val(v,'requiredStockDiameterMm','finishedDiameterMm'))}"></div><div class="field"><label>Extra bewerkingsmarge rondom mm</label><input id="mpStockAllowance" class="input" inputmode="decimal" value="${esc(v.stockAllowanceMm||'')}"></div><div class="field"><label>Vereist half-fabricaattype</label><input id="mpRequiredSemiType" class="input" value="${esc(v.requiredSemiFinishedType||'')}" placeholder="bijv. Half-fabricaat X"></div></div><div class="notice" id="mpStockRoute" style="margin-top:10px"></div>`;
 notes.closest('.field').before(box);
 const sel=document.getElementById('mpStockCategory'),show=()=>{const m={raw:'Start bij Ruw materiaal boren · vul lengte en diameter in',slab:'Start bij Waterjetten · vul lengte × breedte × dikte in',semi:'Start bij Doppen lijmen · vul het exacte half-fabricaattype in'};document.getElementById('mpStockRoute').innerHTML=`<b>Vaste route:</b> ${m[sel.value]||'kies eerst een voorraadsoort'}`};sel.addEventListener('change',show);show();
}
function install(){
 const api=window.RALAB_MASTER;if(!api||api.__inventoryRequirementFields)return setTimeout(install,100);
 const open=api.productForm,baseSave=api.saveProduct;
 api.productForm=function(id,version){editingId=id||null;newVersion=!!version;const out=open.apply(this,arguments);setTimeout(inject,0);return out};
 api.saveProduct=function(){
  const present=document.getElementById('mpStockCategory'),name=document.getElementById('mpName')?.value.trim(),fields=present?{stockCategory:present.value,requiredStockLengthMm:num(document.getElementById('mpRequiredLength').value),requiredStockWidthMm:num(document.getElementById('mpRequiredWidth').value),requiredStockThicknessMm:num(document.getElementById('mpRequiredThickness').value),requiredStockDiameterMm:num(document.getElementById('mpRequiredDiameter').value),stockAllowanceMm:num(document.getElementById('mpStockAllowance').value),requiredSemiFinishedType:document.getElementById('mpRequiredSemiType').value.trim()}:null;
  const out=baseSave.apply(this,arguments);
  if(fields){const rows=(S()?.productTemplates||[]).filter(x=>newVersion?String(x.name).toLowerCase()===String(name).toLowerCase():x.id===editingId||(editingId===null&&String(x.name).toLowerCase()===String(name).toLowerCase())).sort((a,b)=>(num(b.version)-num(a.version))||String(b.updated||b.created||'').localeCompare(String(a.updated||a.created||''))),target=rows[0];if(target){Object.assign(target,fields);try{save()}catch(e){console.error('Voorraadvereisten opslaan mislukt',e)}}}
  return out;
 };
 api.__inventoryRequirementFields=true;
}
install();
})();
