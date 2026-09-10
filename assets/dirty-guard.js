// Waarschuwing bij sluiten van een gewijzigd formulier zonder opslaan
(()=>{
let dirty=false,allowNext=false,root=null;
const SAVE_WORDS=/opslaan|save|bevestigen|voltooien|aanmaken|bijwerken/i;
function mark(){dirty=true}
function reset(){dirty=false;allowNext=false}
function allowClose(){allowNext=true;dirty=false}
function hasOpenModal(){return !!document.querySelector('#modalRoot .modalback,#modalRoot .modal')}
function ask(){return !dirty||allowNext||confirm('Je hebt wijzigingen die nog niet zijn opgeslagen. Weet je zeker dat je dit venster wilt sluiten?')}
function attach(){root=document.getElementById('modalRoot');if(!root)return setTimeout(attach,100);
 root.addEventListener('input',mark,true);root.addEventListener('change',mark,true);
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&SAVE_WORDS.test(b.textContent||'')){allowNext=true;return}const back=e.target.closest('.modalback');if(back&&e.target===back&&dirty&&!ask()){e.preventDefault();e.stopImmediatePropagation()}},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&hasOpenModal()&&dirty&&!ask()){e.preventDefault();e.stopImmediatePropagation()}},true);
 new MutationObserver(()=>{if(!hasOpenModal())reset()}).observe(root,{childList:true,subtree:true});
}
function installClosePatch(){if(typeof window.closeModal!=='function')return setTimeout(installClosePatch,100);if(window.closeModal.__dirtyGuard)return;const original=window.closeModal;const wrapped=function(){if(hasOpenModal()&&!ask()){allowNext=false;return false}const r=original.apply(this,arguments);reset();return r};wrapped.__dirtyGuard=true;window.closeModal=wrapped}
window.RALAB_DIRTY={allowClose,reset,isDirty:()=>dirty};attach();installClosePatch();
})();