// Zorg dat bestaande commerciële orderknoppen de productgekoppelde afnamecontract-flow openen.
(()=>{
function S(){try{return state}catch(_){return null}}
document.addEventListener('click',e=>{
 const b=e.target.closest('.commercial-order-btn');
 if(!b||!window.RALAB_OFFTAKE)return;
 const host=b.closest('tr,.panel,.ordercard')||b.parentElement;
 const txt=host?.textContent||'';
 const o=(S()?.orders||[]).find(x=>x.orderNo&&txt.includes(x.orderNo));
 if(!o)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 window.RALAB_OFFTAKE.orderForm(o.id);
},true);
})();