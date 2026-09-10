// rAlabaster uitbreidingslaag
window.RALAB_HOOKS=window.RALAB_HOOKS||{};
window.RALAB_DEFAULTS={deliveryBufferDays:14,internalDocumentEmail:'info@ralabaster.com'};
// Nieuwe ERP-pagina's onderscheppen vóór de oude planner-navigatie.
document.addEventListener('click',e=>{const b=e.target.closest('.erp-nav');if(!b||!window.RALAB_ERP)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();window.RALAB_ERP.show(b.dataset.view)},true);
// Calculatie kan ook vanuit de nieuwe flow geopend worden.
document.addEventListener('click',e=>{const b=e.target.closest('.navbtn[data-view="calculation"]');if(!b||!window.RALAB_CALC)return;setTimeout(()=>window.RALAB_CALC.render(),0)},true);
