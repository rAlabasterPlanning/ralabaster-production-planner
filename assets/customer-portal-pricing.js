(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function tiers(p){return(p.price_tiers||[]).filter(t=>Number.isFinite(Number(t.qty))&&Number(t.qty)>0&&Number.isFinite(Number(t.unit_price))&&Number(t.unit_price)>=0).slice().sort((a,b)=>Number(a.qty)-Number(b.qty))}
function price(p,qty){const hit=tiers(p).filter(t=>Number(t.qty)<=Number(qty)).at(-1);return hit?Number(hit.unit_price):p.unit_price==null?null:Number(p.unit_price)}
function markup(p){const rows=tiers(p);if(!rows.length)return'';const language=window.RALAB_PORTAL_I18N?.get?.()||'nl',labels={nl:['Staffelprijzen','Vanaf','Aantal','Prijs per'],en:['Quantity pricing','From','Quantity','Price per'],de:['Staffelpreise','Ab','Menge','Preis pro']}[language],money=n=>new Intl.NumberFormat(window.RALAB_PORTAL_I18N?.locale?.()||'nl-NL',{style:'currency',currency:'EUR'}).format(n);return `<details class="portal-price-tiers"><summary>${labels[0]}</summary><table class="line-table"><thead><tr><th>${labels[2]}</th><th>${labels[3]} ${esc(p.unit)}</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${labels[1]} ${Number(t.qty)} ${esc(p.unit)}</td><td>${money(Number(t.unit_price))}</td></tr>`).join('')}</tbody></table></details>`}
window.RALAB_PORTAL_PRICING={tiers,price,markup};
})();
