// One explicit date/time editor, shared by all existing and future forms.
// Original inputs remain the data source; no native picker or synthetic tap is used.
(()=>{
 const VERSION='20260914-2',selector='input[type="date"],input[type="time"],input[type="datetime-local"]';
 const buttons=new WeakMap(),sources=new WeakMap();let active=null,queued=false;
 const pad=n=>String(n).padStart(2,'0');
 const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const today=()=>iso(new Date());
 function dateOf(value){
  let m=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m){const local=String(value||'').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(local)m=[local[0],local[3],pad(local[2]),pad(local[1])]}
  if(!m)return null;const valueIso=`${m[1]}-${m[2]}-${m[3]}`,d=new Date(valueIso+'T12:00:00');return Number.isFinite(d.getTime())&&iso(d)===valueIso?valueIso:null;
 }
 const localDate=value=>value?value.split('-').reverse().join('-'):'';
 function labelFor(input){return input.getAttribute('aria-label')||input.closest('.field')?.querySelector('label')?.textContent.trim()||({date:'Datum',time:'Tijd','datetime-local':'Datum en tijd'}[input.type])}
 function display(input){const value=input.value;if(!value)return input.type==='time'?'Kies tijd':'Kies datum';if(input.type==='time')return value;const [date,time]=value.split('T');return localDate(date)+(time?' · '+time:'')}
 function syncFields(){
  queued=false;
  for(const input of document.querySelectorAll(selector)){
   if(input.closest('[data-temporal-dialog]')||input.dataset.nativePicker==='true')continue;
   let button=buttons.get(input);
   if(!button||!button.isConnected){
    button=document.createElement('button');button.type='button';button.className='input temporal-field';button.dataset.temporalField='';button.setAttribute('aria-haspopup','dialog');
    buttons.set(input,button);sources.set(button,input);input.classList.add('temporal-source');input.after(button);
   }
   const text=display(input),label=labelFor(input)+': '+text;
   if(button.textContent!==text)button.textContent=text;
   if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
   const disabled=input.disabled||input.readOnly;if(button.disabled!==disabled)button.disabled=disabled;
  }
  if(active&&!active.input.isConnected)close(false);
 }
 function queueSync(){if(!queued){queued=true;queueMicrotask(syncFields)}}
 function close(restore=true){
  if(!active)return;const old=active;active=null;old.overlay.remove();window.RALAB_MODAL_LAYER?.sync?.();
  if(restore&&old.button.isConnected)old.button.focus();
 }
 function calendar(){
  if(!active?.dateInput)return;const {overlay,month}=active,grid=overlay.querySelector('[data-calendar-days]'),label=overlay.querySelector('[data-calendar-month]');
  label.textContent=month.toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
  grid.replaceChildren();const first=(month.getDay()+6)%7,count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(),selected=dateOf(active.dateInput.value);
  for(let i=0;i<first;i++)grid.appendChild(document.createElement('span'));
  for(let day=1;day<=count;day++){
   const value=iso(new Date(month.getFullYear(),month.getMonth(),day,12)),b=document.createElement('button');b.type='button';b.dataset.calendarDay=value;b.textContent=String(day);b.setAttribute('aria-label',localDate(value));b.setAttribute('aria-pressed',String(value===selected));
   grid.appendChild(b);
  }
 }
 function open(input,button){
  if(input.disabled||input.readOnly)return;close(false);
  const kind=input.type,[datePart,timePart]=kind==='time'?['',input.value]:input.value.split('T'),date=dateOf(datePart)||today(),time=timePart||'08:15';
  const overlay=document.createElement('div');overlay.dataset.temporalDialog='';overlay.className='temporal-overlay';
  overlay.innerHTML=`<div class="temporal-card" role="dialog" aria-modal="true" aria-labelledby="temporal-title"><h3 id="temporal-title"></h3>
   ${kind!=='time'?'<label for="temporal-date">Datum (dd-mm-jjjj)</label><input id="temporal-date" type="text" inputmode="numeric" autocomplete="off" placeholder="dd-mm-jjjj"><div class="temporal-month"><button type="button" data-calendar-prev aria-label="Vorige maand">‹</button><b data-calendar-month></b><button type="button" data-calendar-next aria-label="Volgende maand">›</button></div><div class="temporal-week">'+['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="temporal-days" data-calendar-days></div>':''}
   ${kind!=='date'?'<div class="temporal-time"><label>Uur<input id="temporal-hour" type="text" inputmode="numeric" maxlength="2" autocomplete="off"></label><span>:</span><label>Minuut<input id="temporal-minute" type="text" inputmode="numeric" maxlength="2" autocomplete="off"></label></div><p class="muted">Je kunt ook tijden buiten de normale werkdag kiezen.</p>':''}
   <p class="temporal-error" role="alert" data-temporal-error></p><div class="temporal-actions"><button class="btn" type="button" data-temporal-cancel>Annuleren</button><button class="btn" type="button" data-temporal-clear>Leegmaken</button><button class="btn primary" type="button" data-temporal-apply>Toepassen</button></div></div>`;
  overlay.querySelector('h3').textContent=labelFor(input);
  const dateInput=overlay.querySelector('#temporal-date');if(dateInput)dateInput.value=localDate(date);
  if(kind!=='date'){const [h,m]=time.split(':');overlay.querySelector('#temporal-hour').value=h;overlay.querySelector('#temporal-minute').value=m}
  active={input,button,overlay,dateInput,kind,month:new Date(date.slice(0,7)+'-01T12:00:00')};document.body.appendChild(overlay);calendar();window.RALAB_MODAL_LAYER?.sync?.();
  // Focus a button, not an input: opening the editor must not pop up a second keyboard/picker.
  overlay.querySelector('[data-temporal-apply]').focus();
 }
 function commit(clear=false){
  if(!active)return;const {input,overlay,kind,dateInput}=active;if(input.disabled||input.readOnly)return close();let value='';
  if(!clear){
   if(kind!=='time'){value=dateOf(dateInput.value);if(!value){overlay.querySelector('[data-temporal-error]').textContent='Vul een geldige datum in, bijvoorbeeld 16-09-2026.';return}}
   if(kind!=='date'){
    const h=overlay.querySelector('#temporal-hour').value.trim(),m=overlay.querySelector('#temporal-minute').value.trim();
    if(!/^\d{1,2}$/.test(h)||!/^\d{1,2}$/.test(m)||+h>23||+m>59){overlay.querySelector('[data-temporal-error]').textContent='Vul een uur van 0 t/m 23 en minuten van 0 t/m 59 in.';return}
    value=(kind==='datetime-local'?value+'T':'')+pad(+h)+':'+pad(+m);
   }
  }
  const changed=input.value!==value;input.value=value;close();
  if(changed){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}queueSync();
 }
 document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-temporal-field]');if(button){e.preventDefault();open(sources.get(button),button);return}
  if(!active||!active.overlay.contains(e.target))return;
  if(e.target.closest('[data-temporal-cancel]'))return close();
  if(e.target.closest('[data-temporal-apply]'))return commit();
  if(e.target.closest('[data-temporal-clear]'))return commit(true);
  const day=e.target.closest('[data-calendar-day]');if(day){active.dateInput.value=localDate(day.dataset.calendarDay);calendar();return}
  const direction=e.target.closest('[data-calendar-prev]')?-1:e.target.closest('[data-calendar-next]')?1:0;
  if(direction){active.month.setMonth(active.month.getMonth()+direction);calendar()}
 },true);
 document.addEventListener('keydown',e=>{
  if(!active)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return}
  if(e.key==='Enter'&&e.target.matches('input')){e.preventDefault();commit();return}
  if(e.key==='Tab'){const items=[...active.overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
 },true);
 document.addEventListener('input',queueSync);document.addEventListener('change',queueSync);
 new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['value','type','readonly','disabled']});
 syncFields();window.RALAB_DATE_TIME_FIELDS={version:VERSION,sync:syncFields};
})();
