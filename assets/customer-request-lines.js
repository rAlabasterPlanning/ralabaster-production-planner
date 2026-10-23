(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=r=>Array.isArray(r.product_lines)&&r.product_lines.length?r.product_lines:[r];
function details(r){return `${r.customer_reference?`<p><b>Uw referentie / PO:</b> ${esc(r.customer_reference)}</p>`:''}${r.requested_delivery_date?`<p>Gewenste leverdatum: ${esc(r.requested_delivery_date)}</p>`:''}<ol>${lines(r).map(l=>`<li><b>${esc(l.product_name)}</b><p style="white-space:pre-wrap">${esc(l.description)}</p><p>${esc(l.dimensions)} · ${esc(l.material)} · ${esc(l.quantity??'—')} ${esc(l.unit)}</p>${l.attachment_path?`<button type="button" class="btn" data-request-attachment="${esc(l.attachment_path)}">Tekening / foto bekijken</button>`:''}</li>`).join('')}</ol>`}
function fieldset(){return `<fieldset data-request-line class="panel" style="margin:14px 0"><legend>Productregel</legend><div class="form-grid"><div class="field full"><label>Productnaam *<input name="product_name" required minlength="2" maxlength="200"></label></div><div class="field full"><label>Omschrijving *<textarea name="description" required minlength="5" maxlength="10000" rows="3"></textarea></label></div><div class="field"><label>Afmetingen<input name="dimensions" maxlength="500"></label></div><div class="field"><label>Materiaal<input name="material" maxlength="500"></label></div><div class="field"><label>Aantal *<input name="quantity" type="number" min="0.001" step="0.001" required></label></div><div class="field"><label>Eenheid<select name="unit"><option>stuks</option><option>sets</option><option>kg</option><option>batch</option></select></label></div><div class="field full"><label>Tekening of foto (optioneel)<input name="attachment" type="file" accept="image/*,.pdf,.dxf,.dwg"></label><small>Maximaal 10 MB per productregel.</small></div></div><button type="button" class="btn" data-remove-request-line>Productregel verwijderen</button></fieldset>`}
document.addEventListener('click',async e=>{
 const add=e.target.closest('[data-add-request-line]'),remove=e.target.closest('[data-remove-request-line]');
 if(add){const box=add.form.querySelector('[data-request-lines]');if(box.children.length<50)box.insertAdjacentHTML('beforeend',fieldset());box.lastElementChild.querySelector('input').focus()}
 if(remove&&remove.form.querySelectorAll('[data-request-line]').length>1)remove.closest('fieldset').remove();
 const file=e.target.closest('[data-request-attachment]');if(!file)return;
 const c=window.RALAB_REQUEST_CLIENT||window.RALAB_ADMIN_AUTH?.client;if(!c)return;
 file.disabled=true;try{const {data,error}=await c.storage.from('portal-files').createSignedUrl(file.dataset.requestAttachment,60);if(error)throw error;window.open(data.signedUrl,'_blank','noopener')}catch(err){alert(err.message||'Bestand kon niet worden geopend.')}finally{file.disabled=false}
});
window.RALAB_REQUEST_LINES={lines,details,fieldset};
})();
